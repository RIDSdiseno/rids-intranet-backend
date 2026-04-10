import { prisma } from "../lib/prisma.js";
import { TipoAgenda, EstadoAgenda } from "@prisma/client";
import { graphReaderService } from "./email/graph-reader.service.js";
import { string } from "zod";

/* ======================================================
   ⚠️  Errores de negocio
====================================================== */

export class AgendaConflictError extends Error {
    constructor(message = "El técnico ya tiene una visita asignada en ese horario.") {
        super(message);
        this.name = "AgendaConflictError";
    }
}

export class AgendaPastDateError extends Error {
    constructor(message = "No se puede modificar una visita de una fecha pasada.") {
        super(message);
        this.name = "AgendaPastDateError";
    }
}

export class AgendaNotFoundError extends Error {
    constructor(message = "Visita de agenda no encontrada.") {
        super(message);
        this.name = "AgendaNotFoundError";
    }
}

/* ======================================================
   🗓️ Utilidades de fecha
====================================================== */

/**
 * Parsea un string "YYYY-MM-DD" y devuelve UTC midnight sin pasar por new Date(string),
 * evitando cualquier ambigüedad de timezone en el servidor.
 */
function normalizarFechaDesdeString(fecha: string): Date {
    const [year, month, day] = fecha.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!));
}

/**
 * Devuelve el número de semana ISO del año para una fecha UTC.
 * Semanas consecutivas difieren en exactamente 1, lo que permite
 * usar este valor como offset de rotación semanal circular.
 */
function getSemanaISO(fecha: Date): number {
    const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
    const day = d.getUTCDay() || 7; // lunes=1 ... domingo=7
    d.setUTCDate(d.getUTCDate() + 4 - day); // desplazar al jueves de la semana
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Formatea un Date UTC midnight como "YYYY-MM-DD" para respuestas de agenda (sin timezone). */
function formatearFechaAgenda(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function serializarAgendaVisita<T extends { fecha: Date }>(
    visita: T
): Omit<T, "fecha"> & { fecha: string } {
    return {
        ...visita,
        fecha: formatearFechaAgenda(visita.fecha),
    };
}

/** Devuelve el lunes de la semana a la que pertenece la fecha (UTC). */
function getLunesDeLaSemana(fecha: Date): Date {
    const day = fecha.getUTCDay(); // 0=Dom..6=Sáb
    const daysFromMon = day === 0 ? 6 : day - 1;
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() - daysFromMon));
}

/** Devuelve el domingo de la semana a la que pertenece la fecha (UTC), al final del día. */
function getDomingoDeLaSemana(fecha: Date): Date {
    const day = fecha.getUTCDay();
    const daysToSun = day === 0 ? 0 : 7 - day;
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + daysToSun, 23, 59, 59, 999));
}

/** Devuelve true si el día de la semana es sábado (6). Usa UTC para coincidir con Date.UTC(). */
function esSabado(date: Date): boolean {
    return date.getUTCDay() === 6;
}

/** Devuelve true si es día de semana Lunes-Viernes (1-5). Usa UTC para coincidir con Date.UTC(). */
function esDiaSemana(date: Date): boolean {
    const d = date.getUTCDay();
    return d >= 1 && d <= 5;
}

/** Devuelve true si la fecha (UTC midnight) es estrictamente anterior a hoy (UTC). */
function esFechaPasada(fecha: Date): boolean {
    const hoy = new Date();
    const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
    return fecha < hoyUTC;
}

function escapeHtml(texto?: string | null): string {
    if (!texto) return "";

    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

type AgendaOutlookVisita = {
    id: number;
    fecha: Date;
    tipo: TipoAgenda;
    estado: EstadoAgenda | string;
    horaInicio?: string | null;
    horaFin?: string | null;
    notas?: string | null;
    mensaje?: string | null;
    empresa?: { nombre: string } | null;
    empresaExternaNombre?: string | null;
    tecnicos?: Array<{
        tecnico?: {
            nombre?: string | null;
            email?: string | null;
        } | null;
    }>;
};

function normalizarNombreEmpresaOutlook(nombre?: string | null): string | null {
    const nombreTrim = nombre?.trim().replace(/^@/, "").trim();
    if (!nombreTrim) return null;

    const mapaNormalizacion: Record<string, string> = {
        "nace alameda": "CLN ALAMEDA",
        "nace prov.": "CLN PROVIDENCIA",
        "nace providencia": "CLN PROVIDENCIA",
        "procret": "FIJACIONES PROCRET",
        "jpl concon": "JPL",
        "oficina": "OFICINA",
        "t-sales latadia": "T-SALES",
    };

    return mapaNormalizacion[nombreTrim.toLowerCase()] ?? nombreTrim;
}

async function resolverEmpresaDesdeOutlook(nombre?: string | null): Promise<{
    empresaId: number | null;
    empresaExternaNombre: string | null;
    nombreFinal: string | null;
}> {
    const nombreNormalizado = normalizarNombreEmpresaOutlook(nombre);

    if (!nombreNormalizado) {
        return {
            empresaId: null,
            empresaExternaNombre: null,
            nombreFinal: null,
        };
    }

    // OFICINA: sin empresa ni nombre externo
    if (nombreNormalizado.toLowerCase() === "oficina") {
        return {
            empresaId: null,
            empresaExternaNombre: null,
            nombreFinal: "OFICINA",
        };
    }

    const empresa = await prisma.empresa.findFirst({
        where: {
            nombre: {
                equals: nombreNormalizado,
                mode: "insensitive",
            },
        },
        select: {
            id_empresa: true,
            nombre: true,
        },
    });

    if (empresa) {
        return {
            empresaId: empresa.id_empresa,
            empresaExternaNombre: null,
            nombreFinal: empresa.nombre,
        };
    }

    return {
        empresaId: null,
        empresaExternaNombre: nombreNormalizado,
        nombreFinal: nombreNormalizado,
    };
}

function getNombreEmpresaAgenda(visita: {
    empresa?: { nombre?: string | null } | null;
    empresaExternaNombre?: string | null;
}): string {
    return (
        visita.empresa?.nombre?.trim() ||
        visita.empresaExternaNombre?.trim() ||
        "OFICINA"
    );
}

function buildAgendaDateTime(fecha: Date, hora?: string | null): string | undefined {
    const horaNormalizada = hora?.trim();
    if (!horaNormalizada) return undefined;

    return `${formatearFechaAgenda(fecha)}T${horaNormalizada}:00`;
}

function buildAgendaOutlookSubject(visita: AgendaOutlookVisita): string {
    const nombreTecnico =
        visita.tecnicos?.[0]?.tecnico?.nombre?.trim() || "Técnico";

    const nombreEmpresa = getNombreEmpresaAgenda(visita);

    return `${nombreTecnico} - ${nombreEmpresa}`;
}

function buildAgendaOutlookBody(visita: AgendaOutlookVisita): string {
    const nombreEmpresa = getNombreEmpresaAgenda(visita);
    const fechaStr = formatearFechaAgenda(visita.fecha);
    const tecnicos = visita.tecnicos ?? [];
    const tecnicosHtml = tecnicos.length > 0
        ? tecnicos
            .map(
                ({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${escapeHtml(tecnico?.nombre ?? "Sin nombre")}</strong> - ${escapeHtml(tecnico?.email?.trim()) || "Sin email"}
    </li>`
            )
            .join("")
        : `
    <li style="margin-bottom: 8px;">Sin técnicos asignados</li>`;

    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #2563eb; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">AGENDA TECNICA</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Detalle de la agenda</h2>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${escapeHtml(String(visita.id))}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(nombreEmpresa)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(fechaStr)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.tipo)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.estado)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaInicio?.trim()) || "Sin hora registrada"}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaFin?.trim()) || "Sin hora registrada"}</td>
    </tr>
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Técnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Notas</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${escapeHtml(visita.notas?.trim()) || "Sin notas registradas"}</p>
  </div>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Mensaje</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${escapeHtml(visita.mensaje?.trim()) || "Sin mensaje registrado"}</p>
  </div>
</div>
    `.trim();
}

function buildAgendaOutlookAttendees(visita: AgendaOutlookVisita): Array<{
    emailAddress: { address: string; name?: string };
    type: "required";
}> {
    const seen = new Set<string>();
    const attendees: Array<{ emailAddress: { address: string; name?: string }; type: "required" }> = [];

    for (const { tecnico } of visita.tecnicos ?? []) {
        const email = tecnico?.email?.trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const nombre = tecnico?.nombre?.trim();
        attendees.push({
            emailAddress: { address: email, ...(nombre ? { name: nombre } : {}) },
            type: "required",
        });
    }

    return attendees;
}

function buildAgendaOutlookCategory(visita: AgendaOutlookVisita): string {
    const tecnicoNombre = visita.tecnicos?.[0]?.tecnico?.nombre?.trim().toLowerCase() || "";

    if (tecnicoNombre.includes("manuel ahumada")) return "Manuel Ahumada";
    if (tecnicoNombre.includes("georges martinez")) return "Georges Martinez";
    if (tecnicoNombre.includes("rudy calsin")) return "Rudy Calsin";
    if (tecnicoNombre.includes("constanza")) return "Constanza";
    if (tecnicoNombre.includes("diego")) return "Diego";
    if (tecnicoNombre.includes("gonzalo")) return "Gonzalo";
    if (tecnicoNombre.includes("ignacio")) return "Ignacio";
    if (tecnicoNombre.includes("sebastian")) return "Sebastian";

    return "OFICINA";
}



/* ======================================================
   🎲 Lógica de rotación de Sábados
====================================================== */

/**
 * Devuelve los IDs de los técnicos que trabajaron el último sábado.
 * Retorna [] si no hay sábados previos en la BD.
 */
async function getTecnicosUltimoSabado(): Promise<number[]> {
    const ultimoSabado = await prisma.agendaVisita.findFirst({
        where: {
            tipo: TipoAgenda.SABADO,
            fecha: { lt: new Date() },
        },
        orderBy: { fecha: "desc" },
        include: {
            tecnicos: { select: { tecnicoId: true } },
        },
    });

    if (!ultimoSabado) return [];
    return ultimoSabado.tecnicos.map((t) => t.tecnicoId);
}

/**
 * Selecciona 3 técnicos aleatorios para el sábado,
 * evitando repetir los del sábado anterior.
 * Si no hay suficientes sin repetir, rota desde el inicio.
 */
async function elegirTecnicosSabado(
    todosTecnicos: { id_tecnico: number; nombre: string }[]
): Promise<number[]> {
    const excluidos = await getTecnicosUltimoSabado();

    let candidatos = todosTecnicos.filter(
        (t) => !excluidos.includes(t.id_tecnico)
    );

    // Si no hay suficientes para elegir 3, usar todos (rotación completa)
    if (candidatos.length < 3) {
        candidatos = todosTecnicos;
    }

    // Mezcla aleatoria (Fisher-Yates)
    const mezclados: { id_tecnico: number; nombre: string }[] = [...candidatos];
    for (let i = mezclados.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = mezclados[i]!;
        mezclados[i] = mezclados[j]!;
        mezclados[j] = tmp;
    }

    return mezclados.slice(0, 3).map((t) => t.id_tecnico);
}

/* ======================================================
   ⚙️ GENERADOR DE MALLA MENSUAL
====================================================== */

/**
 * Genera todas las AgendaVisita del mes para:
 *   - Días de semana: cada empresa recibe exactamente 1 técnico,
 *     rotando por índice circular según el día del mes.
 *   - Sábados: turno de oficina con 3 técnicos aleatorios (con rotación).
 *
 * Omite entradas que ya existen en la BD (idempotente).
 *
 * @param year  Año completo (ej: 2026)
 * @param month Mes 1-12
 */
export async function generarMallaMensual(
    year: number,
    month: number,
    empresaIds?: number[],
    includeOficina?: boolean
): Promise<{ creadas: number; omitidas: number }> {
    // Extender hasta el domingo de la última semana visible del calendario mensual
    const primerDia    = new Date(Date.UTC(year, month - 1, 1));
    const ultimoDiaMes = new Date(Date.UTC(year, month, 0));
    const finVisible   = getDomingoDeLaSemana(ultimoDiaMes); // puede caer en el mes siguiente

    const totalDias = Math.floor((finVisible.getTime() - primerDia.getTime()) / 86400000) + 1;
    const dias: Date[] = Array.from({ length: totalDias }, (_, d) =>
        new Date(Date.UTC(primerDia.getUTCFullYear(), primerDia.getUTCMonth(), primerDia.getUTCDate() + d))
    );

    /* =====================
       Técnicos activos y todas las empresas
    ===================== */

    const tecnicos_excluidos = [23, 16, 5, 14, 7];
    const empresasFijas: Record<number, number> = {
    30: 21, // Sony Music -> Gonzalo Villalobos
    };
    const [tecnicos, empresas] = await Promise.all([
        prisma.tecnico.findMany({
            where: { status: true, 
                id_tecnico: {
                    notIn: tecnicos_excluidos,
                },
            },
            select: { id_tecnico: true, nombre: true },
        }),
        prisma.empresa.findMany({
            where: {
                AND: [
                    { id_empresa: { not: 32 } },
                    ...(empresaIds ? [{ id_empresa: { in: empresaIds } }] : []),
                ],
            },
            select: { id_empresa: true, nombre: true },
        }),
    ]);

    if (tecnicos.length === 0 || (empresas.length === 0 && !includeOficina)) {
        console.log("[AGENDA] Sin técnicos activos o sin empresas — nada que generar.");
        return { creadas: 0, omitidas: 0 };
    }

    /* =====================
       Pre-carga de visitas existentes del mes → Set en memoria
       Clave: "YYYY-MM-DD|empresaId|tipo"   (empresaId = "null" para sábados)
       Evita un findFirst() por cada empresa/día dentro del loop.
    ===================== */
    // El rango debe coincidir exactamente con el rango de generación (primerDia → finVisible)
    const visitasExistentes = await prisma.agendaVisita.findMany({
        where: { fecha: { gte: primerDia, lte: finVisible } },
        select: { fecha: true, empresaId: true, tipo: true },
    });

    const existeSet = new Set<string>(
        visitasExistentes.map((v) => {
            const d = v.fecha.toISOString().slice(0, 10);
            return `${d}|${v.empresaId ?? "null"}|${v.tipo}`;
        })
    );

    // Fechas que ya tienen al menos una visita → el loop las salta por completo
    const fechasOcupadas = new Set<string>(
        visitasExistentes.map((v) => v.fecha.toISOString().slice(0, 10))
    );

    /* =====================
       Fase 1: recolección en memoria — sin ningún insert al DB
    ===================== */
    type VisitaPayload = {
        fecha: Date;
        tipo: TipoAgenda;
        estado: EstadoAgenda;
        empresaId: number | null;
        notas?: string;
        tecnicoIds: number[];
    };

    const nuevas: VisitaPayload[] = [];
    let omitidas = 0;

    /* =====================
       Constantes de bloque — calculadas una sola vez, fuera del loop
    ===================== */
    const empresasFijasSet = new Set(Object.keys(empresasFijas).map(Number));
    const tecnicosFijosSet = new Set(Object.values(empresasFijas));
    // Pool de rotación: excluye empresas con asignación fija (ej: Sony no rota)
    const empresasPool = empresas.filter(e => !empresasFijasSet.has(e.id_empresa));
    const tecnicosLMV  = tecnicos;                                                    // todos en LMV
    const tecnicosMJ   = tecnicos.filter(t => !tecnicosFijosSet.has(t.id_tecnico));   // sin fijos en MJ
    const N      = empresasPool.length;
    const halfMJ = Math.ceil(N / 2); // stagger: MJ empieza en la mitad del pool para evitar repetir empresas de LMV

    for (const fecha of dias) {
        const fechaStr = fecha.toISOString().slice(0, 10);

        // Si ya existe cualquier visita para este día, no tocar nada
        if (fechasOcupadas.has(fechaStr)) continue;

        /* SÁBADOS */
        if (esSabado(fecha)) {
            const clave = `${fechaStr}|null|${TipoAgenda.SABADO}`;
            if (existeSet.has(clave)) { omitidas++; continue; }

            // Único await permitido dentro del loop: max 5 veces (un sábado por semana)
            const seleccionados = await elegirTecnicosSabado(tecnicos);
            nuevas.push({
                fecha,
                tipo: TipoAgenda.SABADO,
                estado: EstadoAgenda.PROGRAMADA,
                empresaId: null,
                notas: "Turno de oficina – asignación automática",
                tecnicoIds: seleccionados,
            });
            existeSet.add(clave);
            continue;
        }

        if (!esDiaSemana(fecha)) continue;

        const utcDay       = fecha.getUTCDay();
        const esLMV        = utcDay === 1 || utcDay === 3 || utcDay === 5;
        const esMJ         = utcDay === 2 || utcDay === 4;
        const offsetSemana = getSemanaISO(fecha);
        const poolDelDia   = esLMV ? tecnicosLMV : tecnicosMJ;

        // Mapa empresa → tecnicoIds para este día
        const asignaciones = new Map<number, number[]>();

        if (esLMV && N > 0) {
            // Todos los técnicos activos rotan por el pool de empresas
            for (let i = 0; i < tecnicosLMV.length; i++) {
                const t = tecnicosLMV[i]!;
                const e = empresasPool[(i + offsetSemana) % N]!;
                if (!asignaciones.has(e.id_empresa)) asignaciones.set(e.id_empresa, []);
                asignaciones.get(e.id_empresa)!.push(t.id_tecnico);
            }
        } else if (esMJ) {
            // Asignaciones fijas primero (ej: Sony → Gonzalo)
            for (const [empIdStr, tecId] of Object.entries(empresasFijas)) {
                const empId = Number(empIdStr);
                asignaciones.set(empId, [tecId]);
            }
            // Rotación MJ con stagger para técnicos no fijos
            if (N > 0) {
                for (let i = 0; i < tecnicosMJ.length; i++) {
                    const t = tecnicosMJ[i]!;
                    const e = empresasPool[(i + offsetSemana + halfMJ) % N]!;
                    if (!asignaciones.has(e.id_empresa)) asignaciones.set(e.id_empresa, []);
                    asignaciones.get(e.id_empresa)!.push(t.id_tecnico);
                }
            }
        }

        // OFICINA explícita: reservar un técnico del pool del día para empresaId null
        if (includeOficina && poolDelDia.length > 0) {
            const idxOficina = (offsetSemana + fecha.getUTCDate()) % poolDelDia.length;
            const tecnicoOficinaId = poolDelDia[idxOficina]!.id_tecnico;

            for (const [empresaId, tecnicoIds] of asignaciones) {
                const filtrados = tecnicoIds.filter((id) => id !== tecnicoOficinaId);
                if (filtrados.length === 0) asignaciones.delete(empresaId);
                else asignaciones.set(empresaId, filtrados);
            }
        }

        /* Crear una visita por empresa con todos sus técnicos asignados */
        for (const [empresaId, tecnicoIds] of asignaciones) {
            const clave = `${fechaStr}|${empresaId}|${TipoAgenda.SEMANA}`;
            if (existeSet.has(clave)) { omitidas++; continue; }

            nuevas.push({
                fecha,
                tipo: TipoAgenda.SEMANA,
                estado: EstadoAgenda.PROGRAMADA,
                empresaId,
                tecnicoIds,
            });
            existeSet.add(clave);
        }

        /* OFICINA — técnicos que no recibieron empresa se asignan como respaldo */
        const tecnicosEnEmpresas = new Set<number>();
        for (const ids of asignaciones.values()) ids.forEach(id => tecnicosEnEmpresas.add(id));
        const noAsignados = poolDelDia
            .filter(t => !tecnicosEnEmpresas.has(t.id_tecnico))
            .map(t => t.id_tecnico);
        if (noAsignados.length > 0) {
            const claveOficina = `${fechaStr}|null|${TipoAgenda.SEMANA}`;
            if (!existeSet.has(claveOficina)) {
                nuevas.push({
                    fecha,
                    tipo: TipoAgenda.SEMANA,
                    estado: EstadoAgenda.PROGRAMADA,
                    empresaId: null,
                    notas: "Turno de oficina – día hábil",
                    tecnicoIds: noAsignados,
                });
                existeSet.add(claveOficina);
            }
        }
    }

    if (nuevas.length === 0) {
        console.log(`[AGENDA] Malla ${year}-${String(month).padStart(2, "0")} ya existía completa | omitidas: ${omitidas}`);
        return { creadas: 0, omitidas };
    }

    /* =====================
       Fase 2: insert masivo de AgendaVisita (1 query)
    ===================== */
    await prisma.agendaVisita.createMany({
        data: nuevas.map((v) => ({
            fecha: v.fecha,
            tipo: v.tipo,
            estado: v.estado,
            empresaId: v.empresaId,
            ...(v.notas !== undefined && { notas: v.notas }),
        })),
    });

    /* =====================
       Fase 3: re-query para obtener IDs asignados (1 query)
       Filtramos solo las recién creadas usando el Set de claves nuevas.
    ===================== */
    const claveNuevas = new Set(
        nuevas.map((v) => `${v.fecha.toISOString().slice(0, 10)}|${v.empresaId ?? "null"}|${v.tipo}`)
    );

    const visitasEnBD = await prisma.agendaVisita.findMany({
        where: { fecha: { gte: primerDia, lte: finVisible } },
        select: { id: true, fecha: true, empresaId: true, tipo: true },
    });

    const idMap = new Map<string, number>();
    for (const v of visitasEnBD) {
        const key = `${v.fecha.toISOString().slice(0, 10)}|${v.empresaId ?? "null"}|${v.tipo}`;
        if (claveNuevas.has(key)) idMap.set(key, v.id);
    }

    /* =====================
       Fase 4: insert masivo de AgendaTecnico (1 query)
    ===================== */
    const relaciones: { agendaId: number; tecnicoId: number }[] = [];
    for (const v of nuevas) {
        const key = `${v.fecha.toISOString().slice(0, 10)}|${v.empresaId ?? "null"}|${v.tipo}`;
        const agendaId = idMap.get(key);
        if (agendaId !== undefined) {
            for (const tecnicoId of v.tecnicoIds) {
                relaciones.push({ agendaId, tecnicoId });
            }
        }
    }

    await prisma.agendaTecnico.createMany({ data: relaciones, skipDuplicates: true });

    console.log(
        `[AGENDA] Malla ${year}-${String(month).padStart(2, "0")} generada | creadas: ${nuevas.length} | omitidas: ${omitidas}`
    );

    return { creadas: nuevas.length, omitidas };
}

/* ======================================================
   📋 CONSULTAS DE AGENDA
====================================================== */

/**
 * Catálogo de empresas válidas para la agenda.
 * Misma fuente que generarMallaMensual: sin nombres vacíos ni "SIN EMPRESA".
 */
export async function getEmpresasAgenda() {
    return prisma.empresa.findMany({
        where: {
            nombre: {
                not: { equals: "" },
                notIn: ["SIN EMPRESA"],
            },
        },
        select: { id_empresa: true, nombre: true },
        orderBy: { nombre: "asc" },
    });
}

/**
 * Devuelve todas las visitas del mes con técnicos y empresa incluidos.
 */
export async function getAgendaMensual(
    year: number,
    month: number,
    filtros?: {
        tecnico?: string;
        empresa?: string;
    }
) {
    // Rango visible del calendario mensual: semana completa del primer al último día del mes
    const primerDia  = new Date(Date.UTC(year, month - 1, 1));
    const ultimoDia  = new Date(Date.UTC(year, month, 0));
    const inicio = getLunesDeLaSemana(primerDia);
    const fin    = getDomingoDeLaSemana(ultimoDia);

    const tecnico = filtros?.tecnico?.trim();
    const empresa = filtros?.empresa?.trim();

    const where = {
        fecha: { gte: inicio, lte: fin },
        ...(empresa && {
            OR: [
                {
                    empresa: {
                        nombre: {
                            contains: empresa,
                            mode: "insensitive" as const,
                        },
                    },
                },
                {
                    empresaExternaNombre: {
                        contains: empresa,
                        mode: "insensitive" as const,
                    },
                },
                ...("oficina".startsWith(empresa.toLowerCase())
                    ? [{ empresaId: null, empresaExternaNombre: null }]
                    : []),
            ],
        }),
        ...(tecnico && {
            tecnicos: {
                some: {
                    tecnico: {
                        nombre: {
                            contains: tecnico,
                            mode: "insensitive" as const,
                        },
                    },
                },
            },
        }),
    };

    const visitas = await prisma.agendaVisita.findMany({
        where,
        include: {
            empresa: { select: { id_empresa: true, nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
                },
            },
        },
        orderBy: { fecha: "asc" },
    });

    return visitas.map(serializarAgendaVisita);
}

export async function getAgendaDesdeOutlook(
    year: number,
    month: number
): Promise<Array<{
    outlookEventId: string;
    subject: string;
    fecha: string;
    horaInicio: string | null;
    horaFin: string | null;
    tecnico: string | null;
    empresa: string | null;
    categories: string[];
}>> {
    const primerDia = new Date(Date.UTC(year, month - 1, 1));
    const ultimoDia = new Date(Date.UTC(year, month, 0));
    const inicio = getLunesDeLaSemana(primerDia);
    const fin = getDomingoDeLaSemana(ultimoDia);

    const startDateTime = `${formatearFechaAgenda(inicio)}T00:00:00`;
    const endDateTime = `${formatearFechaAgenda(fin)}T23:59:59`;

    const events = await graphReaderService.readCalendarEvents(startDateTime, endDateTime);

    return events.map((event) => {
        const { fecha, hora: horaInicio } = parseAgendaOutlookDateTime(event.start);
        const { hora: horaFin } = parseAgendaOutlookDateTime(event.end);
        const { empresa } = parseAgendaOutlookSubject(event.subject);
        const tecnico = event.categories?.[0]?.trim() || null;

        return {
            outlookEventId: event.id,
            subject: event.subject,
            fecha: fecha ?? "",
            horaInicio,
            horaFin,
            tecnico,
            empresa,
            categories: event.categories || [],
        };
    });
}

function parseAgendaOutlookSubject(subject?: string | null): {
    tecnico: string | null;
    empresa: string | null;
} {
    const subjectTrim = subject?.trim();
    if (!subjectTrim) {
        return { tecnico: null, empresa: null };
    }

    const separatorIndex = subjectTrim.indexOf(" - ");

    // Caso normal: "Tecnico - Empresa"
    if (separatorIndex >= 0) {
        return {
            tecnico: subjectTrim.slice(0, separatorIndex).trim() || null,
            empresa: subjectTrim.slice(separatorIndex + 3).trim() || null,
        };
    }

    // Caso Outlook simple: "Nace Alameda", "Procret", "JPL Concon"
    // Se interpreta como nombre de empresa
    return {
        tecnico: null,
        empresa: subjectTrim,
    };
}

function parseAgendaOutlookDateTime(value?: string | null): {
    fecha: string | null;
    hora: string | null;
} {
    const valueTrim = value?.trim();
    if (!valueTrim) {
        return { fecha: null, hora: null };
    }

    const match = valueTrim.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
    if (!match) {
        return { fecha: null, hora: null };
    }

    return {
        fecha: match[1] ?? null,
        hora: match[2] ?? null,
    };
}

function buildAgendaOutlookMonthRange(year: number, month: number): {
    inicio: Date;
    fin: Date;
    startDateTime: string;
    endDateTime: string;
} {
    const primerDia = new Date(Date.UTC(year, month - 1, 1));
    const ultimoDia = new Date(Date.UTC(year, month, 0));
    const inicio = getLunesDeLaSemana(primerDia);
    const fin = getDomingoDeLaSemana(ultimoDia);

    return {
        inicio,
        fin,
        startDateTime: `${formatearFechaAgenda(inicio)}T00:00:00`,
        endDateTime: `${formatearFechaAgenda(fin)}T23:59:59`,
    };
}

function normalizarTextoNombre(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

async function buscarTecnicoPorNombreOutlook(nombre?: string | null): Promise<{
    id_tecnico: number;
    nombre: string;
} | null> {
    const nombreTrim = nombre?.trim();
    if (!nombreTrim) return null;

    // 1. Match exacto insensible a mayúsculas
    const tecnicoExacto = await prisma.tecnico.findFirst({
        where: {
            nombre: {
                equals: nombreTrim,
                mode: "insensitive",
            },
        },
        select: { id_tecnico: true, nombre: true },
    });
    if (tecnicoExacto) return tecnicoExacto;

    // 2. Contiene el nombre (ej: "Ignacio" encuentra "Ignacio Gonzalez")
    const tecnicoContiene = await prisma.tecnico.findFirst({
        where: {
            nombre: {
                contains: nombreTrim,
                mode: "insensitive",
            },
        },
        select: { id_tecnico: true, nombre: true },
    });
    if (tecnicoContiene) return tecnicoContiene;

    // 3. Match con normalización de tildes (ej: "Sebastián" → "Sebastian")
    const nombreNormalizado = normalizarTextoNombre(nombreTrim);
    const todos = await prisma.tecnico.findMany({
        select: { id_tecnico: true, nombre: true },
    });

    // 3a. Alguno cuyo nombre normalizado sea igual al candidato normalizado
    const porIgual = todos.find(
        (t) => normalizarTextoNombre(t.nombre) === nombreNormalizado
    );
    if (porIgual) return porIgual;

    // 3b. Alguno cuyo nombre normalizado empiece con el primer token del candidato
    // (ej: "Sebastián" → "sebastian" encuentra "Sebastian Rojas")
    const primerToken = nombreNormalizado.split(" ")[0];
    if (primerToken && primerToken.length >= 3) {
        const porPrimerToken = todos.find((t) =>
            normalizarTextoNombre(t.nombre).startsWith(primerToken)
        );
        if (porPrimerToken) return porPrimerToken;
    }

    return null;
}

async function resolverTecnicoDesdeOutlook(params: {
    subject?: string | null;
    categories?: string[] | null;
}): Promise<{
    id_tecnico: number;
    nombre: string;
} | null> {
    const { tecnico: tecnicoDesdeSubject } = parseAgendaOutlookSubject(params.subject);
    const candidatos = [params.categories?.[0]?.trim() || null, tecnicoDesdeSubject]
        .filter((nombre, index, arr): nombre is string => Boolean(nombre) && arr.indexOf(nombre) === index);

    for (const candidato of candidatos) {
        const tecnico = await buscarTecnicoPorNombreOutlook(candidato);
        if (tecnico) return tecnico;
    }

    return null;
}

async function resolverTecnicosDesdeOutlook(params: {
    subject?: string | null;
    categories?: string[] | null;
    attendees?: Array<{
        emailAddress?: {
            address?: string;
            name?: string;
        } | null;
    } | null>;
}): Promise<Array<{
    id_tecnico: number;
    nombre: string;
}>> {
    const supportEmail = process.env.EMAIL_USER?.trim().toLowerCase() || null;
    const attendeeEmails = Array.from(
        new Set(
            (params.attendees ?? [])
                .map((attendee) => attendee?.emailAddress?.address?.trim().toLowerCase())
                .filter((email): email is string => Boolean(email) && email !== supportEmail)
        )
    );

    if (attendeeEmails.length > 0) {
        const tecnicosPorEmail = await prisma.tecnico.findMany({
            where: {
                OR: attendeeEmails.map((email) => ({
                    email: {
                        equals: email,
                        mode: "insensitive" as const,
                    },
                })),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
        });

        const tecnicoPorEmail = new Map(
            tecnicosPorEmail
                .filter((tecnico) => Boolean(tecnico.email?.trim()))
                .map((tecnico) => [
                    tecnico.email!.trim().toLowerCase(),
                    { id_tecnico: tecnico.id_tecnico, nombre: tecnico.nombre },
                ])
        );

        const tecnicos: Array<{ id_tecnico: number; nombre: string }> = [];
        const seen = new Set<number>();

        for (const email of attendeeEmails) {
            const tecnico = tecnicoPorEmail.get(email);
            if (!tecnico || seen.has(tecnico.id_tecnico)) continue;
            seen.add(tecnico.id_tecnico);
            tecnicos.push(tecnico);
        }

        if (tecnicos.length > 0) {
            return tecnicos;
        }
    }

    const tecnicoFallback = await resolverTecnicoDesdeOutlook({
        ...(params.subject !== undefined && { subject: params.subject }),
        ...(params.categories !== undefined && { categories: params.categories }),
    });

    return tecnicoFallback ? [tecnicoFallback] : [];
}

async function sincronizarTecnicosAgendaOutlook(
    agendaId: number,
    tecnicoIds: number[]
): Promise<void> {
    await prisma.agendaTecnico.deleteMany({
        where: { agendaId },
    });

    await prisma.agendaTecnico.createMany({
        data: tecnicoIds.map((tecnicoId) => ({ agendaId, tecnicoId })),
        skipDuplicates: true,
    });
}

async function buscarAgendaCoincidenteDesdeOutlook(params: {
    fecha: Date;
    horaInicio: string | null;
    horaFin: string | null;
    tecnicoIds: number[];
    empresaId: number | null;
    empresaExternaNombre: string | null;
    tipo: TipoAgenda;
}): Promise<{ id: number; outlookEventId: string | null } | null> {
    const tecnicoIdsObjetivo = Array.from(new Set(params.tecnicoIds));
    if (tecnicoIdsObjetivo.length === 0) return null;

    const baseWhere = {
        fecha: params.fecha,
        horaInicio: params.horaInicio,
        horaFin: params.horaFin,
        tipo: params.tipo,
    };

    const empresaExternaNormalizada = normalizarNombreEmpresaOutlook(params.empresaExternaNombre);
    const esOficina =
        params.empresaId === null &&
        (!empresaExternaNormalizada || empresaExternaNormalizada.toLowerCase() === "oficina");

    let where: Record<string, unknown>;

    if (params.empresaId !== null) {
        where = {
            ...baseWhere,
            empresaId: params.empresaId,
        };
    } else if (esOficina) {
        where = {
            ...baseWhere,
            empresaId: null,
            OR: [
                { empresaExternaNombre: null },
                {
                    empresaExternaNombre: {
                        equals: "OFICINA",
                        mode: "insensitive" as const,
                    },
                },
            ],
        };
    } else {
        where = {
            ...baseWhere,
            empresaId: null,
            empresaExternaNombre: {
                equals: empresaExternaNormalizada,
                mode: "insensitive" as const,
            },
        };
    }

    const candidatas = await prisma.agendaVisita.findMany({
        where,
        select: {
            id: true,
            outlookEventId: true,
            tecnicos: {
                select: {
                    tecnicoId: true,
                },
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    const tecnicoIdsObjetivoSet = new Set(tecnicoIdsObjetivo);
    let mejorCoincidencia: { id: number; outlookEventId: string | null } | null = null;
    let mayorCantidadCoincidencias = 0;

    for (const candidata of candidatas) {
        const tecnicoIdsCandidata = Array.from(
            new Set(candidata.tecnicos.map((tecnico) => tecnico.tecnicoId))
        );

        const cantidadCoincidencias = tecnicoIdsCandidata.filter((tecnicoId) =>
            tecnicoIdsObjetivoSet.has(tecnicoId)
        ).length;

        if (cantidadCoincidencias === 0) continue;

        const esCoincidenciaExacta =
            cantidadCoincidencias === tecnicoIdsObjetivoSet.size &&
            tecnicoIdsCandidata.length === tecnicoIdsObjetivoSet.size;

        if (esCoincidenciaExacta) {
            return {
                id: candidata.id,
                outlookEventId: candidata.outlookEventId,
            };
        }

        if (cantidadCoincidencias > mayorCantidadCoincidencias) {
            mayorCantidadCoincidencias = cantidadCoincidencias;
            mejorCoincidencia = {
                id: candidata.id,
                outlookEventId: candidata.outlookEventId,
            };
        }
    }

    if (tecnicoIdsObjetivo.length >= 2 && mayorCantidadCoincidencias < 2) {
        return null;
    }

    return mejorCoincidencia;
}

export async function sincronizarAgendaDesdeOutlook(
    year: number,
    month: number
): Promise<{
    creadas: number;
    actualizadas: number;
    omitidas: number;
    errores: number;
}> {
    const { inicio, fin, startDateTime, endDateTime } = buildAgendaOutlookMonthRange(year, month);
    const events = await graphReaderService.readCalendarEvents(startDateTime, endDateTime);

    const outlookIdsVigentes = new Set(
        events
            .map((event) => event.id?.trim())
            .filter((id):id is string => Boolean(id))
    );

    const visitasLocalesSincronizadas = await prisma.agendaVisita.findMany({
        where: {
            fecha: {
                gte: inicio,
                lte: fin,
            },
            outlookEventId: {
                not: null,
            },
        },
        select: { id: true,
            outlookEventId: true,
        },
    });

    const visitasEliminadasEnOutlook = visitasLocalesSincronizadas.filter((visita) => {
        const outlookId = visita.outlookEventId?.trim();
        return Boolean(outlookId) && !outlookIdsVigentes.has(outlookId!);
    });

    if (visitasEliminadasEnOutlook.length > 0) {
        await prisma.agendaVisita.deleteMany({
            where: {
                id: {
                    in: visitasEliminadasEnOutlook.map((visita) => visita.id),
                },
            },
        });

        console.log(
            `[AGENDA OUTLOOK SYNC] Eliminadas en intranet por borrado en Outlook: ${visitasEliminadasEnOutlook.length}`
        );
    }

    let creadas = 0;
    let actualizadas = 0;
    let omitidas = 0;
    let errores = 0;

    for (const event of events) {
        try {
            if (!event.id?.trim()) {
                throw new Error("Evento de Outlook sin id");
            }

            const { fecha } = parseAgendaOutlookDateTime(event.start);
            const { hora: horaInicio } = parseAgendaOutlookDateTime(event.start);
            const { hora: horaFin } = parseAgendaOutlookDateTime(event.end);

            if (!fecha) {
                throw new Error(`Evento ${event.id} sin fecha de inicio válida`);
            }

            const tecnicos = await resolverTecnicosDesdeOutlook({
                subject: event.subject,
                categories: event.categories,
                attendees: event.attendees,
            });
            const tecnicoIds = tecnicos.map((tecnico) => tecnico.id_tecnico);

            if (tecnicoIds.length === 0) {
                omitidas++;
                continue;
            }

            const { empresa: empresaDesdeSubject } = parseAgendaOutlookSubject(event.subject);
            const {
                empresaId,
                empresaExternaNombre,
            } = await resolverEmpresaDesdeOutlook(empresaDesdeSubject);

            const fechaUTC = normalizarFechaDesdeString(fecha);
            const tipo = esSabado(fechaUTC) ? TipoAgenda.SABADO : TipoAgenda.SEMANA;

            let agendaObjetivo = await prisma.agendaVisita.findFirst({
                where: {
                    outlookEventId: event.id,
                },
                select: {
                    id: true,
                    outlookEventId: true,
                },
            });

            if (!agendaObjetivo) {
                agendaObjetivo = await buscarAgendaCoincidenteDesdeOutlook({
                    fecha: fechaUTC,
                    horaInicio,
                    horaFin,
                    tecnicoIds,
                    empresaId,
                    empresaExternaNombre,
                    tipo,
                });
            }

            if (agendaObjetivo) {
                await prisma.agendaVisita.update({
                    where: { id: agendaObjetivo.id },
                    data: {
                        fecha: fechaUTC,
                        horaInicio,
                        horaFin,
                        empresaId,
                        empresaExternaNombre,
                        tipo,
                        estado: EstadoAgenda.PROGRAMADA,
                        outlookEventId: event.id,
                    },
                });

                await sincronizarTecnicosAgendaOutlook(agendaObjetivo.id, tecnicoIds);

                actualizadas++;
                continue;
            }

            const agendaCreada = await prisma.agendaVisita.create({
                data: {
                    fecha: fechaUTC,
                    empresaId,
                    empresaExternaNombre,
                    tipo,
                    estado: EstadoAgenda.PROGRAMADA,
                    horaInicio,
                    horaFin,
                    outlookEventId: event.id,
                },
                select: {
                    id: true,
                },
            });

            await prisma.agendaTecnico.createMany({
                data: tecnicoIds.map((tecnicoId) => ({ agendaId: agendaCreada.id, tecnicoId })),
                skipDuplicates: true,
            });

            creadas++;
        } catch (error) {
            console.error(`[AGENDA OUTLOOK SYNC] Error procesando evento ${event.id || "(sin id)"}:`, error);
            errores++;
        }
    }

    return {
        creadas,
        actualizadas,
        omitidas,
        errores,
    };
}

/**
 * Devuelve las visitas de un día puntual.
 */
export async function getAgendaPorDia(fecha: Date) {
    const dia = new Date(
        Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
    );

    const visitas = await prisma.agendaVisita.findMany({
        where: { fecha: dia },
        include: {
            empresa: { select: { id_empresa: true, nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { id_tecnico: true, nombre: true } },
                },
            },
        },
        orderBy: { tipo: "asc" },
    });

    return visitas.map(serializarAgendaVisita);
}

/* ======================================================
   ⏱️ VALIDACIÓN DE CONFLICTO HORARIO
====================================================== */

/** Convierte "HH:mm" a minutos desde medianoche. */
function horaAMinutos(hora: string): number {
    const [h, m] = hora.split(":").map(Number);
    return h! * 60 + m!;
}

/** Devuelve true si los rangos [aInicio, aFin) y [bInicio, bFin) se solapan. */
function seSolapan(aInicio: number, aFin: number, bInicio: number, bFin: number): boolean {
    return aInicio < bFin && aFin > bInicio;
}

/**
 * Lanza AgendaConflictError si algún técnico ya tiene una visita con horario solapado
 * en la misma fecha. Visitas sin horaInicio/horaFin se ignoran.
 * Si se pasa excluirVisitaId, esa visita se omite (para no chocar consigo misma al editar).
 */
async function validarConflictoHorario(params: {
    fecha: Date;
    horaInicio: string;
    horaFin: string;
    tecnicoIds: number[];
    excluirVisitaId?: number;
}): Promise<void> {
    const { fecha, horaInicio, horaFin, tecnicoIds, excluirVisitaId } = params;

    const visitasDelDia = await prisma.agendaVisita.findMany({
        where: {
            fecha,
            horaInicio: { not: null },
            horaFin:    { not: null },
            ...(excluirVisitaId !== undefined && { id: { not: excluirVisitaId } }),
            tecnicos: { some: { tecnicoId: { in: tecnicoIds } } },
        },
        select: { horaInicio: true, horaFin: true },
    });

    const nuevoInicio = horaAMinutos(horaInicio);
    const nuevoFin    = horaAMinutos(horaFin);

    if (nuevoInicio >= nuevoFin) {
        throw new AgendaConflictError("La hora de inicio debe ser menor que la hora de fin.");
    }

    for (const v of visitasDelDia) {
        if (seSolapan(nuevoInicio, nuevoFin, horaAMinutos(v.horaInicio!), horaAMinutos(v.horaFin!))) {
            throw new AgendaConflictError();
        }
    }
}

/* ======================================================
   ✏️ EDICIÓN MANUAL DE AGENDA
====================================================== */

/**
 * Actualiza una visita: puede cambiar fecha, estado, notas, mensaje, horario o empresa.
 */
export async function actualizarAgendaVisita(
    id: number,
    datos: {
        fecha?: string | undefined;
        estado?: EstadoAgenda | undefined;
        notas?: string | undefined;
        mensaje?: string | undefined;
        horaInicio?: string | undefined;
        horaFin?: string | undefined;
        empresaId?: number | null | undefined;
    }
) {
    const {
        fecha: fechaStr,
        estado,
        notas,
        mensaje,
        horaInicio,
        horaFin,
        empresaId,
    } = datos;

    // Fetch previo: necesario para validación de fecha pasada y conflicto horario
    const actual = await prisma.agendaVisita.findUnique({
        where: { id },
        select: {
            fecha:          true,
            horaInicio:     true,
            horaFin:        true,
            outlookEventId: true,
            tecnicos:       { select: { tecnicoId: true } },
        },
    });

    if (actual) {
        // Bloquear modificación de visitas pasadas
        if (esFechaPasada(actual.fecha)) {
            throw new AgendaPastDateError();
        }

        // Validar conflicto horario si se modifica fecha u horario
        if (fechaStr !== undefined || horaInicio !== undefined || horaFin !== undefined) {
            const fechaFinal  = fechaStr    ? normalizarFechaDesdeString(fechaStr) : actual.fecha;
            const inicioFinal = horaInicio ?? actual.horaInicio;
            const finFinal    = horaFin    ?? actual.horaFin;
            const tecnicoIds  = actual.tecnicos.map((t) => t.tecnicoId);
            if (inicioFinal && finFinal && tecnicoIds.length > 0) {
                await validarConflictoHorario({ fecha: fechaFinal, horaInicio: inicioFinal, horaFin: finFinal, tecnicoIds, excluirVisitaId: id });
            }
        }
    }

    const visita = await prisma.agendaVisita.update({
        where: { id },
        data: {
            ...(fechaStr !== undefined && { fecha: normalizarFechaDesdeString(fechaStr) }),
            ...(estado !== undefined && { estado }),
            ...(notas !== undefined && { notas }),
            ...(mensaje !== undefined && { mensaje }),
            ...(horaInicio !== undefined && { horaInicio }),
            ...(horaFin !== undefined && { horaFin }),
            ...(empresaId !== undefined && { empresaId }),
        },
        include: {
            empresa: { select: { id_empresa: true, nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
                },
            },
        },
    });

    const startDateTime = buildAgendaDateTime(visita.fecha, visita.horaInicio);
    const endDateTime = buildAgendaDateTime(visita.fecha, visita.horaFin);

    if (startDateTime && endDateTime) {
        const categoriaOutlook = buildAgendaOutlookCategory(visita);

        try {
            if (actual?.outlookEventId) {
                const eventData = {
                    subject: buildAgendaOutlookSubject(visita),
                    bodyHtml: buildAgendaOutlookBody(visita),
                    startDateTime,
                    endDateTime,
                    categories: [categoriaOutlook],
                    attendees: buildAgendaOutlookAttendees(visita),
                };

                await graphReaderService.updateCalendarEvent(actual.outlookEventId, eventData);
                visita.outlookEventId = actual.outlookEventId;
            } else {
                const eventData = {
                    subject: buildAgendaOutlookSubject(visita),
                    bodyHtml: buildAgendaOutlookBody(visita),
                    startDateTime,
                    endDateTime,
                    categories: [categoriaOutlook],
                    attendees: buildAgendaOutlookAttendees(visita),
                };

                const outlookEvent = await graphReaderService.createCalendarEvent(eventData);

                if (outlookEvent?.id) {
                    await prisma.agendaVisita.update({
                        where: { id: visita.id },
                        data: { outlookEventId: outlookEvent.id },
                    });
                    visita.outlookEventId = outlookEvent.id;
                }
            }
        } catch (error) {
            console.error(`[AGENDA OUTLOOK] Error sincronizando agenda #${visita.id}:`, error);
        }
    } else if (actual?.outlookEventId) {
        try {
            await graphReaderService.deleteCalendarEvent(actual.outlookEventId);
            await prisma.agendaVisita.update({
                where: { id: visita.id },
                data: { outlookEventId: null },
            });
            visita.outlookEventId = null;
        } catch (error) {
            console.error(`[AGENDA OUTLOOK] Error eliminando evento de agenda #${visita.id}:`, error);
        }
    }

    return serializarAgendaVisita(visita);
}

export async function cerrarAgendasPendientesDelDia(): Promise<number> {
    const hoy = new Date();
    const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));

    const resultado = await prisma.agendaVisita.updateMany({
        where: {
            fecha: { lt: hoyUTC },
            estado: EstadoAgenda.PROGRAMADA,
        },
        data: {
            estado: EstadoAgenda.COMPLETADA,
        },
    });

    console.log(`[AGENDA] Cierre automatico ejecutado - agendas cerradas: ${resultado.count}`);

    return resultado.count;
}

/**
 * Reemplaza completamente los técnicos de una visita.
 * Borra los existentes y crea los nuevos.
 */
export async function reasignarTecnicos(
    agendaId: number,
    nuevosTecnicoIds: number[]
) {
    const visita = await prisma.agendaVisita.findUnique({
        where: { id: agendaId },
        select: { fecha: true, horaInicio: true, horaFin: true },
    });

    if (visita && esFechaPasada(visita.fecha)) {
        throw new AgendaPastDateError();
    }

    if (visita?.horaInicio && visita?.horaFin) {
        await validarConflictoHorario({
            fecha:           visita.fecha,
            horaInicio:      visita.horaInicio,
            horaFin:         visita.horaFin,
            tecnicoIds:      nuevosTecnicoIds,
            excluirVisitaId: agendaId,
        });
    }

    await prisma.agendaTecnico.deleteMany({ where: { agendaId } });

    const resultado = await prisma.agendaTecnico.createMany({
        data: nuevosTecnicoIds.map((tecnicoId) => ({ agendaId, tecnicoId })),
    });

    const visitaActualizada = await prisma.agendaVisita.findUnique({
        where: { id: agendaId },
        include: {
            empresa: { select: { id_empresa: true, nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
                },
            },
        },
    });

    if (
        visitaActualizada?.outlookEventId &&
        visitaActualizada.horaInicio &&
        visitaActualizada.horaFin
    ) {
        const startDateTime = buildAgendaDateTime(visitaActualizada.fecha, visitaActualizada.horaInicio);
        const endDateTime = buildAgendaDateTime(visitaActualizada.fecha, visitaActualizada.horaFin);

        if (startDateTime && endDateTime) {
            try {
                const eventData = {
                    subject: buildAgendaOutlookSubject(visitaActualizada),
                    bodyHtml: buildAgendaOutlookBody(visitaActualizada),
                    startDateTime,
                    endDateTime,
                    categories: [buildAgendaOutlookCategory(visitaActualizada)],
                    attendees: buildAgendaOutlookAttendees(visitaActualizada),
                };

                await graphReaderService.updateCalendarEvent(visitaActualizada.outlookEventId, eventData);
            } catch (error) {
                console.error(`[AGENDA OUTLOOK] Error sincronizando reasignación agenda #${agendaId}:`, error);
            }
        }
    }

    return resultado;
}

/**
 * Elimina una visita y sus técnicos asociados (Cascade en el schema).
 */
export async function eliminarAgendaVisita(id: number) {
    const visita = await prisma.agendaVisita.findUnique({
        where: { id },
        select: { outlookEventId: true },
    });

    if (visita?.outlookEventId) {
        try {
            await graphReaderService.deleteCalendarEvent(visita.outlookEventId);
        } catch (error) {
            const errorCode =
                typeof error === "object" && error !== null
                    ? (
                        ("code" in error && typeof error.code === "string" && error.code) ||
                        (
                            "body" in error &&
                            typeof error.body === "object" &&
                            error.body !== null &&
                            "error" in error.body &&
                            typeof error.body.error === "object" &&
                            error.body.error !== null &&
                            "code" in error.body.error &&
                            typeof error.body.error.code === "string" &&
                            error.body.error.code
                        ) ||
                        null
                    )
                    : null;

            if (errorCode === "ErrorItemNotFound") {
                console.warn(
                    `[AGENDA OUTLOOK] Evento no encontrado en Outlook para agenda #${id} (${visita.outlookEventId}). Se elimina solo en BD.`
                );
            } else {
                console.error(`[AGENDA OUTLOOK] Error eliminando evento de agenda #${id}:`, error);
                throw error;
            }
        }
    }

    return prisma.agendaVisita.delete({ where: { id } });
}

/**
 * Elimina todas las visitas de un mes completo.
 * Útil para regenerar la malla desde cero.
 */
export async function eliminarMallaMensual(
    year: number,
    month: number
): Promise<{ eliminadas: number }> {
    const fin = getDomingoDeLaSemana(new Date(Date.UTC(year, month, 0)));

    // Solo borrar desde mañana en adelante — no tocar historial
    const hoy    = new Date();
    const manana = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1));

    if (manana > fin) {
        console.log(`[AGENDA] Malla ${year}-${String(month).padStart(2, "0")} — nada futuro que eliminar`);
        return { eliminadas: 0 };
    }

    const { count } = await prisma.agendaVisita.deleteMany({
        where: { fecha: { gte: manana, lte: fin }, outlookEventId: null },
    });

    console.log(
        `[AGENDA] Malla ${year}-${String(month).padStart(2, "0")} eliminada | visitas borradas: ${count}`
    );

    return { eliminadas: count };
}

/**
 * Crea una visita individual de forma manual.
 * La fecha se normaliza a UTC (solo día, sin hora).
 * El tipo se infiere automáticamente: SABADO si cae en sábado, SEMANA en cualquier otro caso.
 */
export async function crearAgendaVisitaManual(data: {
    fecha: string;
    empresaId: number | null;
    tecnicoId: number;
    horaInicio?: string | undefined;
    horaFin?: string | undefined;
    mensaje?: string | undefined;
    notas?: string | undefined;
}) {
    const fechaUTC = normalizarFechaDesdeString(data.fecha);

    if (data.horaInicio && data.horaFin) {
        await validarConflictoHorario({
            fecha:      fechaUTC,
            horaInicio: data.horaInicio,
            horaFin:    data.horaFin,
            tecnicoIds: [data.tecnicoId],
        });
    }

    const tipo = esSabado(fechaUTC) ? TipoAgenda.SABADO : TipoAgenda.SEMANA;

    const visita = await prisma.agendaVisita.create({
        data: {
            fecha: fechaUTC,
            empresaId: data.empresaId,
            tipo,
            estado: EstadoAgenda.PROGRAMADA,
            ...(data.horaInicio !== undefined && { horaInicio: data.horaInicio }),
            ...(data.horaFin !== undefined && { horaFin: data.horaFin }),
            ...(data.mensaje !== undefined && { mensaje: data.mensaje }),
            ...(data.notas !== undefined && { notas: data.notas }),
            tecnicos: {
                create: { tecnicoId: data.tecnicoId },
            },
        },
        include: {
            empresa: { select: { id_empresa: true, nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
                },
            },
        },
    });

    const startDateTime = buildAgendaDateTime(visita.fecha, visita.horaInicio);
    const endDateTime = buildAgendaDateTime(visita.fecha, visita.horaFin);

    if (startDateTime && endDateTime) {
        const categoriaOutlook = buildAgendaOutlookCategory(visita);

        try {
            const eventData = {
                subject: buildAgendaOutlookSubject(visita),
                bodyHtml: buildAgendaOutlookBody(visita),
                startDateTime,
                endDateTime,
                categories: [categoriaOutlook],
                attendees: buildAgendaOutlookAttendees(visita),
            };

            const outlookEvent = await graphReaderService.createCalendarEvent(eventData);

            if (outlookEvent?.id) {
                const visitaActualizada = await prisma.agendaVisita.update({
                    where: { id: visita.id },
                    data: { outlookEventId: outlookEvent.id },
                    include: {
                        empresa: { select: { id_empresa: true, nombre: true } },
                        tecnicos: {
                            include: {
                                tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
                            },
                        },
                    },
                });

                return serializarAgendaVisita(visitaActualizada);
            }
        } catch (error) {
            console.error(`[AGENDA OUTLOOK] Error creando evento para agenda #${visita.id}:`, error);
        }
    }

    return serializarAgendaVisita(visita);
}

/* ======================================================
   🔔 NOTIFICACIONES REALES POR CORREO
====================================================== */

/**
 * Envía correos reales a los técnicos de cada agenda pendiente del día.
 * Usa Microsoft Graph via graphReaderService.sendReplyEmail().
 * Marca notificacionEnviada = true en cada agenda procesada correctamente.
 */
export async function enviarNotificacionesPendientes(): Promise<number> {
    const hoy = new Date();
    const fechaHoy = new Date(
        Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
    );

    const pendientes = await prisma.agendaVisita.findMany({
        where: {
            fecha: fechaHoy,
            notificacionEnviada: false,
            estado: EstadoAgenda.PROGRAMADA,
        },
        include: {
            empresa: { select: { nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { nombre: true, email: true } },
                },
            },
        },
    });

    console.log(`[AGENDA] Agendas pendientes para ${fechaHoy.toISOString().slice(0, 10)}: ${pendientes.length}`);

    let enviadas = 0;

    for (const visita of pendientes) {
        const nombreEmpresa = getNombreEmpresaAgenda(visita);

        const fechaStr = visita.fecha.toISOString().slice(0, 10);

        const tecnicosHtml = visita.tecnicos
            .map(
                ({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${escapeHtml(tecnico.nombre)}</strong> - ${escapeHtml(tecnico.email?.trim()) || "Sin email"}
    </li>`
            )
            .join("");

        const subject = `[AGENDA] Agenda tecnica - ${nombreEmpresa}`;

        const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #2563eb; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">AGENDA TECNICA ASIGNADA</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Agenda tecnica</h2>
  <p style="color: #555; margin: 0 0 8px; line-height: 1.5;">
    Tienes una visita tecnica programada para hoy con <strong>${escapeHtml(nombreEmpresa)}</strong>. Revisa a continuacion el detalle de la agenda.
  </p>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${escapeHtml(String(visita.id))}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(fechaStr)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(nombreEmpresa)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.tipo)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.estado)}</td>
    </tr>
    ${visita.horaInicio?.trim()
            ? `<tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaInicio?.trim())}</td>
    </tr>`
            : ""}
    ${visita.horaFin?.trim()
            ? `<tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaFin?.trim())}</td>
    </tr>`
            : ""}
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Tecnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  ${visita.mensaje?.trim()
            ? `<div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Mensaje adicional</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${escapeHtml(visita.mensaje?.trim())}</p>
  </div>`
            : ""}

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este correo fue generado automaticamente por el sistema de agenda RIDS.
  </p>
</div>
        `.trim();

        const destinatarios = visita.tecnicos
            .map(({ tecnico }) => tecnico.email?.trim())
            .filter((email): email is string => Boolean(email));

        if (destinatarios.length === 0) {
            console.warn(`[AGENDA] Agenda #${visita.id} (${nombreEmpresa}) omitida — sin correos validos`);
            continue;
        }

        try {
            for (const to of destinatarios) {
                await graphReaderService.sendReplyEmail({ to, subject, bodyHtml });
                console.log(`[AGENDA] Correo enviado → ${to} (agenda #${visita.id})`);
            }

            await prisma.agendaVisita.update({
                where: { id: visita.id },
                data: { notificacionEnviada: true },
            });

            enviadas++;
        } catch (error) {
            console.error(`[AGENDA] Error al enviar correos de agenda #${visita.id}:`, error);
        }
    }

    console.log(`[AGENDA] Notificaciones completadas — agendas procesadas: ${enviadas}/${pendientes.length}`);

    return enviadas;
}

export async function enviarRecordatoriosPendientes(): Promise<number> {
    const hoy = new Date();
    const fechaHoy = new Date(
        Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
    );
    const horaChileStr = hoy.toLocaleString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false });
    const [horas, minutos] = horaChileStr.split(":").map(Number);
    const horaActualMinutos = horas! * 60 + minutos!;

    const candidatas = await prisma.agendaVisita.findMany({
        where: {
            fecha: fechaHoy,
            estado: EstadoAgenda.PROGRAMADA,
            horaInicio: { not: null },
            OR:[ 
                { recordatorioEnviado: false }, 
                { recordatorioEnviado: null },
                ],
        },
        include: {
            empresa: { select: { nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { nombre: true, email: true } },
                },
            },
        },
    });

    console.log(`[AGENDA RECORDATORIOS] Agendas candidatas: ${candidatas.length}`);

    let agendasProcesadas = 0;
    let correosEnviados = 0;

    for (const visita of candidatas) {
        const horaInicio = visita.horaInicio?.trim();
        if (!horaInicio) continue;

        const diferencia = horaAMinutos(horaInicio) - horaActualMinutos;
        if (diferencia < 55 || diferencia > 60) continue;

        const nombreEmpresa = getNombreEmpresaAgenda(visita);
        const fechaStr = visita.fecha.toISOString().slice(0, 10);

        const tecnicosHtml = visita.tecnicos
            .map(
                ({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${escapeHtml(tecnico.nombre)}</strong> - ${escapeHtml(tecnico.email?.trim()) || "Sin email"}
    </li>`
            )
            .join("");

        const subject = `[RECORDATORIO] Visita tecnica en 1 hora - ${nombreEmpresa}`;

        const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #2563eb; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">RECORDATORIO DE VISITA TECNICA</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Visita tecnica en 1 hora</h2>
  <p style="color: #555; margin: 0 0 8px; line-height: 1.5;">
    Este es un recordatorio de tu visita tecnica programada con <strong>${escapeHtml(nombreEmpresa)}</strong> en aproximadamente 1 hora.
  </p>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${escapeHtml(String(visita.id))}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(fechaStr)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(nombreEmpresa)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.tipo)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.estado)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(horaInicio)}</td>
    </tr>
    ${visita.horaFin?.trim()
                ? `<tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaFin.trim())}</td>
    </tr>`
                : ""}
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Tecnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  ${visita.mensaje?.trim()
                ? `<div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Mensaje adicional</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${escapeHtml(visita.mensaje.trim())}</p>
  </div>`
                : ""}

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este correo fue generado automaticamente por el sistema de agenda RIDS.
  </p>
</div>
        `.trim();

        const destinatarios = visita.tecnicos
            .map(({ tecnico }) => tecnico.email?.trim())
            .filter((email): email is string => Boolean(email));

        if (destinatarios.length === 0) {
            console.warn(`[AGENDA RECORDATORIOS] Agenda omitida sin email - agenda #${visita.id}`);

            await prisma.agendaVisita.update({
                where: { id: visita.id },
                data: { recordatorioEnviado: true },
            });

            agendasProcesadas++;
            continue;
        }

        try {
            for (const to of destinatarios) {
                await graphReaderService.sendReplyEmail({ to, subject, bodyHtml });
                console.log(`[AGENDA RECORDATORIOS] Recordatorio enviado -> ${to}`);
                correosEnviados++;
            }

            await prisma.agendaVisita.update({
                where: { id: visita.id },
                data: { recordatorioEnviado: true },
            });

            agendasProcesadas++;
        } catch (error) {
            console.error(`[AGENDA RECORDATORIOS] Error al enviar agenda #${visita.id}:`, error);
        }
    }

    console.log(
        `[AGENDA RECORDATORIOS] Agendas procesadas: ${agendasProcesadas} | Correos enviados: ${correosEnviados}`
    );

    return correosEnviados;
}

export async function enviarNotaAgendaPorCorreo(agendaId: number): Promise<number> {
    const visita = await prisma.agendaVisita.findUnique({
        where: { id: agendaId },
        include: {
            empresa: { select: { nombre: true } },
            tecnicos: {
                include: {
                    tecnico: { select: { nombre: true, email: true } },
                },
            },
        },
    });

    if (!visita) {
        throw new AgendaNotFoundError(`No se encontro una agenda con id ${agendaId}`);
    }

    const nombreEmpresa = getNombreEmpresaAgenda(visita);

    const destinatarios = visita.tecnicos
        .map(({ tecnico }) => tecnico.email?.trim())
        .filter((email): email is string => Boolean(email));

    if (destinatarios.length === 0) {
        console.warn(`[AGENDA NOTA] Agenda #${visita.id} sin correos validos para envio`);
        return 0;
    }

    const fechaStr = visita.fecha.toISOString().slice(0, 10);
    const notaActual = visita.notas?.trim() || "Sin nota registrada";

    const tecnicosHtml = visita.tecnicos
        .map(
            ({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${escapeHtml(tecnico.nombre)}</strong> - ${escapeHtml(tecnico.email?.trim()) || "Sin email"}
    </li>`
        )
        .join("");

    const subject = `[AGENDA] Actualizacion de nota - ${nombreEmpresa}`;

    const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #2563eb; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">ACTUALIZACION DE NOTA DE AGENDA</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Actualizacion de nota</h2>
  <p style="color: #555; margin: 0 0 8px; line-height: 1.5;">
    Se ha actualizado la informacion de la visita tecnica con <strong>${escapeHtml(nombreEmpresa)}</strong>. Revisa la nota indicada a continuacion.
  </p>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${escapeHtml(String(visita.id))}</p>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Nota actual</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${escapeHtml(notaActual)}</p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-top: 24px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(fechaStr)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(nombreEmpresa)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.tipo)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.estado)}</td>
    </tr>
    ${visita.horaInicio?.trim()
            ? `<tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaInicio.trim())}</td>
    </tr>`
            : ""}
    ${visita.horaFin?.trim()
            ? `<tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${escapeHtml(visita.horaFin.trim())}</td>
    </tr>`
            : ""}
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Tecnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este correo fue generado automaticamente por el sistema de agenda RIDS.
  </p>
</div>
    `.trim();

    let enviados = 0;

    for (const to of destinatarios) {
        await graphReaderService.sendReplyEmail({ to, subject, bodyHtml });
        enviados++;
        console.log(`[AGENDA NOTA] Nota enviada -> ${to} (agenda #${visita.id})`);
    }

    console.log(`[AGENDA NOTA] Total correos enviados para agenda #${visita.id}: ${enviados}`);

    return enviados;
}

export async function sincronizarAgendaAutomaticaOutlook(): Promise<{
    actual: { year: number; month: number; resultado: { creadas: number; actualizadas: number; omitidas: number; errores: number } | null; error: string | null };
    siguiente: { year: number; month: number; resultado: { creadas: number; actualizadas: number; omitidas: number; errores: number } | null; error: string | null };
}> {
    const hoy = new Date();
    const yearActual = hoy.getFullYear();
    const monthActual = hoy.getMonth() + 1;

    const siguienteFecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const yearSiguiente = siguienteFecha.getFullYear();
    const monthSiguiente = siguienteFecha.getMonth() + 1;

    let resultadoActual: { creadas: number; actualizadas: number; omitidas: number; errores: number } | null = null;
    let errorActual: string | null = null;

    try {
        resultadoActual = await sincronizarAgendaDesdeOutlook(yearActual, monthActual);
        console.log(`[AGENDA OUTLOOK AUTO] Mes actual (${yearActual}-${monthActual}) sincronizado:`, resultadoActual);
    } catch (err) {
        errorActual = err instanceof Error ? err.message : String(err);
        console.error(`[AGENDA OUTLOOK AUTO] Error en mes actual (${yearActual}-${monthActual}):`, errorActual);
    }

    let resultadoSiguiente: { creadas: number; actualizadas: number; omitidas: number; errores: number } | null = null;
    let errorSiguiente: string | null = null;

    try {
        resultadoSiguiente = await sincronizarAgendaDesdeOutlook(yearSiguiente, monthSiguiente);
        console.log(`[AGENDA OUTLOOK AUTO] Mes siguiente (${yearSiguiente}-${monthSiguiente}) sincronizado:`, resultadoSiguiente);
    } catch (err) {
        errorSiguiente = err instanceof Error ? err.message : String(err);
        console.error(`[AGENDA OUTLOOK AUTO] Error en mes siguiente (${yearSiguiente}-${monthSiguiente}):`, errorSiguiente);
    }

    return {
        actual: { year: yearActual, month: monthActual, resultado: resultadoActual, error: errorActual },
        siguiente: { year: yearSiguiente, month: monthSiguiente, resultado: resultadoSiguiente, error: errorSiguiente },
    };
}
