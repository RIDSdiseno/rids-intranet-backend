// src/service/equipos/hostname-sugerido.service.ts
//
// Hostname sugerido para equipos PC (solo sugerencia, no modifica nada).
// Formato: <NT|WS>-<SIGLA>-<INICIAL+APELLIDO>[n], maximo 15 caracteres (NetBIOS).
//   - NT = notebook; WS = resto de tipos PC.
//   - SIGLA: calculada desde el nombre de la empresa (sin campo en BD).
//   - Sin solicitante: correlativo por empresa (NT-CLC-01).
//   - Duplicado dentro de la empresa: sufijo 2, 3...

import { prisma } from "../../lib/prisma.js";

export const HOSTNAME_MAX = 15;

const TIPOS_PC = new Set([
    "GENERICO",
    "NOTEBOOK",
    "ALL_IN_ONE",
    "DESKTOP",
    "CPU",
    "EQUIPO_ARMADO",
]);

// Palabras que no aportan a la sigla de la empresa.
// Los articulos (LA, LAS, LOS, EL) se mantienen: suelen ser parte del nombre
// (Clinica Las Condes -> CLC).
const PALABRAS_IGNORADAS_EMPRESA = new Set([
    "SPA", "LTDA", "LIMITADA", "EIRL", "CIA", "COMPANIA", "SOCIEDAD",
    "DE", "DEL", "Y", "E",
]);

// Particulas de apellidos compuestos (Maria de la Fuente)
const PARTICULAS_NOMBRE = new Set([
    "DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DI", "VAN", "VON",
]);

/** Mayusculas, sin tildes ni caracteres fuera de A-Z / 0-9 (la Ñ pasa a N). */
export function normalizarTexto(valor: string): string {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

/** Sigla de la empresa: iniciales (hasta 4) o, si es una sola palabra, sus 4 primeras letras. */
export function calcularSiglaEmpresa(nombre: string): string {
    // "S.A." / "S. A." al final o en medio
    const sinSa = nombre.replace(/\bS\s*\.\s*A\s*\.?(?=\s|$)/gi, " ");

    const palabras = normalizarTexto(sinSa)
        .split(" ")
        .filter((p) => p && !PALABRAS_IGNORADAS_EMPRESA.has(p));

    if (palabras.length === 0) return "EMP";

    if (palabras.length === 1) {
        return (palabras[0] ?? "EMP").slice(0, 4);
    }

    return palabras
        .slice(0, 4)
        .map((p) => p.charAt(0))
        .join("");
}

/**
 * Inicial del primer nombre + primer apellido.
 *   2-3 palabras: Juan Perez [Soto] -> JPEREZ
 *   4+ palabras:  Juan Carlos Perez Soto -> JPEREZ (penultima)
 */
export function calcularParteSolicitante(nombre: string): string | null {
    const palabras = normalizarTexto(nombre)
        .split(" ")
        .filter((p) => p && !PARTICULAS_NOMBRE.has(p));

    if (palabras.length === 0) return null;

    const primera = palabras[0] ?? "";

    if (palabras.length === 1) return primera;

    const apellido =
        palabras.length >= 4
            ? palabras[palabras.length - 2] ?? ""
            : palabras[1] ?? "";

    return `${primera.charAt(0)}${apellido}`;
}

/** Solicitante de relleno «[SIN SOLICITANTE]»: se trata como equipo sin solicitante. */
export function esSolicitanteDeRelleno(nombre: string): boolean {
    return nombre.trim().toUpperCase() === "[SIN SOLICITANTE]";
}

/** Equipo Mac (marca Apple, agente Mac o macOS): no recibe hostname sugerido. */
export function esEquipoMac(datos: {
    marca?: string | null;
    agenteVersion?: string | null;
    sistemaOperativo?: string | null;
}): boolean {
    return (
        /^apple$/i.test((datos.marca ?? "").trim()) ||
        /mac/i.test(datos.agenteVersion ?? "") ||
        /mac\s?os|darwin/i.test(datos.sistemaOperativo ?? "")
    );
}

export function prefijoTipo(tipo: string): string {
    return tipo === "NOTEBOOK" ? "NT" : "WS";
}

/** Candidato n (1 = sin sufijo), recortando el nombre para respetar el maximo. */
export function armarCandidato(base: string, nombre: string, n: number): string {
    const sufijo = n > 1 ? String(n) : "";
    const largoNombre = Math.max(1, HOSTNAME_MAX - base.length - sufijo.length);

    return `${base}${nombre.slice(0, largoNombre)}${sufijo}`;
}

export type HostnameSugeridoResultado = {
    ok: true;
    idEquipo: number;
    actual: string | null;
    sugerido: string | null;
    coincide: boolean;
    motivo: string | null;
    detalle: {
        prefijo: string | null;
        sigla: string | null;
        parteSolicitante: string | null;
        sinSolicitante: boolean;
    };
};

/**
 * Calcula la sugerencia a partir de los datos ya cargados.
 * `ocupados`: hostnames (en mayusculas) de los otros equipos de la empresa.
 */
export function sugerirHostname(params: {
    tipo: string;
    esMac?: boolean;
    hostnameActual: string | null;
    nombreEmpresa: string | null;
    nombreSolicitante: string | null;
    ocupados: Set<string>;
}): {
    sugerido: string | null;
    motivo: string | null;
    prefijo: string | null;
    sigla: string | null;
    parteSolicitante: string | null;
} {
    if (params.esMac) {
        return {
            sugerido: null,
            motivo: "Los equipos Mac no reciben hostname sugerido.",
            prefijo: null,
            sigla: null,
            parteSolicitante: null,
        };
    }

    if (!TIPOS_PC.has(params.tipo)) {
        return {
            sugerido: null,
            motivo: "Solo se sugiere hostname para equipos PC.",
            prefijo: null,
            sigla: null,
            parteSolicitante: null,
        };
    }

    if (!params.nombreEmpresa) {
        return {
            sugerido: null,
            motivo: "Asigne una empresa al equipo para sugerir hostname.",
            prefijo: null,
            sigla: null,
            parteSolicitante: null,
        };
    }

    const prefijo = prefijoTipo(params.tipo);
    const sigla = calcularSiglaEmpresa(params.nombreEmpresa);
    const base = `${prefijo}-${sigla}-`;
    const actual = (params.hostnameActual ?? "").trim().toUpperCase();

    const parteSolicitante =
        params.nombreSolicitante && !esSolicitanteDeRelleno(params.nombreSolicitante)
            ? calcularParteSolicitante(params.nombreSolicitante)
            : null;

    // Sin solicitante: correlativo 01..99 dentro de la empresa
    if (!parteSolicitante) {
        const candidatos: string[] = [];

        for (let n = 1; n <= 99; n++) {
            candidatos.push(`${base}${String(n).padStart(2, "0")}`);
        }

        // Si el hostname actual ya es un correlativo valido y libre, se respeta
        if (candidatos.includes(actual) && !params.ocupados.has(actual)) {
            return { sugerido: actual, motivo: null, prefijo, sigla, parteSolicitante: null };
        }

        const libre = candidatos.find((c) => !params.ocupados.has(c)) ?? null;

        return {
            sugerido: libre,
            motivo: libre ? null : "No hay correlativos libres (01 a 99) para esta empresa.",
            prefijo,
            sigla,
            parteSolicitante: null,
        };
    }

    const candidatos: string[] = [];

    for (let n = 1; n <= 99; n++) {
        candidatos.push(armarCandidato(base, parteSolicitante, n));
    }

    // Si el hostname actual ya calza con el formato (con o sin sufijo) y esta libre, se respeta
    if (candidatos.includes(actual) && !params.ocupados.has(actual)) {
        return { sugerido: actual, motivo: null, prefijo, sigla, parteSolicitante };
    }

    const libre = candidatos.find((c) => !params.ocupados.has(c)) ?? null;

    return {
        sugerido: libre,
        motivo: libre ? null : "No hay sufijos libres (2 a 99) para este solicitante.",
        prefijo,
        sigla,
        parteSolicitante,
    };
}

export type HostnameControl = {
    sugerido: string | null;
    coincide: boolean;
    motivo: string | null;
    prefijo: string | null;
    sigla: string | null;
    parteSolicitante: string | null;
    sinSolicitante: boolean;
    /* El hostname actual lo tienen otros equipos de la MISMA empresa */
    repetido: boolean;
    /* Equipos de la empresa con ese hostname (1 = único) */
    repeticiones: number;
    /* Equipos de todo el CRM con ese hostname (informativo) */
    repeticionesCrm: number;
};

/* Estados que no reciben sugerencia (ya no estan en uso por la empresa) */
const ESTADOS_SIN_SUGERENCIA = new Set(["DADO_DE_BAJA", "VENDIDO"]);

/**
 * Hostname sugerido para TODOS los equipos de las empresas indicadas.
 *
 * Se calcula por empresa completa (no depende de filtros ni busquedas) para que
 * cada equipo reciba un nombre distinto:
 *   1) los equipos cuyo hostname actual ya es valido lo conservan;
 *   2) el resto, en orden de id, toma el primer candidato libre que no este
 *      ocupado por otro equipo ni reservado para otro equipo de la empresa
 *      (correlativos 01, 02, 03... y sufijos 2, 3... para nombres repetidos).
 *
 * El detalle del equipo y el agente usan esta misma funcion, asi que todos
 * muestran la misma sugerencia. Usa 3 consultas en total.
 */
export async function calcularHostnamesEmpresas(
    empresaIds: number[]
): Promise<Map<number, HostnameControl>> {
    const resultado = new Map<number, HostnameControl>();

    const ids = Array.from(new Set(empresaIds.filter((id) => Number.isInteger(id) && id > 0)));

    if (ids.length === 0) return resultado;

    const equipos = await prisma.equipo.findMany({
        where: {
            deletedAt: null,
            OR: [
                { empresaId: { in: ids } },
                { empresaId: null, solicitante: { is: { empresaId: { in: ids } } } },
            ],
        },
        select: {
            id_equipo: true,
            tipo: true,
            estado: true,
            hostname: true,
            marca: true,
            agenteVersion: true,
            empresaId: true,
            detalle: { select: { so: true } },
            solicitante: { select: { nombre: true, empresaId: true } },
        },
        orderBy: { id_equipo: "asc" },
    });

    const empresas = await prisma.empresa.findMany({
        where: { id_empresa: { in: ids } },
        select: { id_empresa: true, nombre: true },
    });

    const nombreEmpresa = new Map(empresas.map((e) => [e.id_empresa, e.nombre]));

    /* Hostnames repetidos en todo el CRM (informativo) */
    const filasRepetidos = await prisma.$queryRaw<Array<{ h: string; n: number }>>`
        SELECT upper(trim(hostname)) AS h, count(*)::int AS n
        FROM "Equipo"
        WHERE "deletedAt" IS NULL AND hostname IS NOT NULL AND trim(hostname) <> ''
        GROUP BY 1
        HAVING count(*) > 1
    `;

    const repetidosCrm = new Map(filasRepetidos.map((r) => [r.h, Number(r.n)]));

    /* Agrupar por empresa */
    const porEmpresa = new Map<number, typeof equipos>();

    for (const e of equipos) {
        const empresaId = e.empresaId ?? e.solicitante?.empresaId ?? null;

        if (empresaId === null) continue;

        const lista = porEmpresa.get(empresaId) ?? [];
        lista.push(e);
        porEmpresa.set(empresaId, lista);
    }

    for (const [empresaId, lista] of porEmpresa) {
        /* Dados de baja y vendidos: no reciben sugerencia y su nombre queda libre */
        const participantes = lista.filter((e) => !ESTADOS_SIN_SUGERENCIA.has(String(e.estado)));

        /* idEquipo -> HOSTNAME actual de los equipos en uso de la empresa */
        const hostnames = new Map<number, string>();

        for (const e of participantes) {
            const h = e.hostname?.trim().toUpperCase();
            if (h) hostnames.set(e.id_equipo, h);
        }

        const conteoEmpresa = new Map<string, number>();

        for (const h of hostnames.values()) {
            conteoEmpresa.set(h, (conteoEmpresa.get(h) ?? 0) + 1);
        }

        /*
 * ignorarPropio (solo paso 1): los otros equipos con el MISMO nombre no
 * cuentan como ocupado; el primero (menor id) lo reserva y los demas
 * quedan para el paso 2.
 */
        const calcular = (
            e: (typeof lista)[number],
            reservados: Set<string>,
            ignorarPropio = false
        ) => {
            const ocupados = new Set<string>(reservados);
            const propio = e.hostname?.trim().toUpperCase() ?? "";

            for (const [id, h] of hostnames) {
                if (id === e.id_equipo) continue;
                if (ignorarPropio && h === propio) continue;

                ocupados.add(h);
            }

            return sugerirHostname({
                tipo: String(e.tipo),
                esMac: esEquipoMac({
                    marca: e.marca,
                    agenteVersion: e.agenteVersion,
                    sistemaOperativo: e.detalle?.so ?? null,
                }),
                hostnameActual: e.hostname,
                nombreEmpresa: nombreEmpresa.get(empresaId) ?? null,
                nombreSolicitante: e.solicitante?.nombre ?? null,
                ocupados,
            });
        };

        const asignados = new Map<number, ReturnType<typeof sugerirHostname>>();
        const reservados = new Set<string>();

        /*
  * 1) Conservan su nombre los que ya lo tienen valido. Si varios equipos
  *    comparten el mismo nombre valido (imagen clonada), lo conserva el
  *    de menor id y el resto recibe uno nuevo en el paso 2.
  */
        for (const e of participantes) {
            const r = calcular(e, reservados, true);
            const actual = e.hostname?.trim().toUpperCase() ?? "";

            if (r.sugerido && actual === r.sugerido) {
                asignados.set(e.id_equipo, r);
                reservados.add(r.sugerido);
            }
        }

        /* 2) El resto toma el primer candidato libre, en orden de id */
        for (const e of participantes) {
            if (asignados.has(e.id_equipo)) continue;

            const r = calcular(e, reservados);
            asignados.set(e.id_equipo, r);

            if (r.sugerido) reservados.add(r.sugerido);
        }

        for (const e of participantes) {
            const r = asignados.get(e.id_equipo)!;
            const actual = e.hostname?.trim().toUpperCase() ?? "";
            const esMac = esEquipoMac({
                marca: e.marca,
                agenteVersion: e.agenteVersion,
                sistemaOperativo: e.detalle?.so ?? null,
            });
            const repeticiones = actual ? conteoEmpresa.get(actual) ?? 1 : 0;

            resultado.set(e.id_equipo, {
                sugerido: r.sugerido,
                coincide: Boolean(r.sugerido && actual === r.sugerido),
                motivo: r.motivo,
                prefijo: r.prefijo,
                sigla: r.sigla,
                parteSolicitante: r.parteSolicitante,
                sinSolicitante:
                    !e.solicitante || esSolicitanteDeRelleno(e.solicitante.nombre),
                /* Los Mac quedan fuera del control de hostnames */
                repetido: !esMac && repeticiones > 1,
                repeticiones,
                repeticionesCrm: actual ? repetidosCrm.get(actual) ?? 1 : 0,
            });
        }
    }

    return resultado;
}

/** Carga los datos del equipo y calcula el hostname sugerido. null = equipo no existe. */
export async function obtenerHostnameSugerido(
    idEquipo: number
): Promise<HostnameSugeridoResultado | null> {
    const equipo = await prisma.equipo.findFirst({
        where: { id_equipo: idEquipo, deletedAt: null },
        select: {
            id_equipo: true,
            tipo: true,
            hostname: true,
            marca: true,
            agenteVersion: true,
            empresaId: true,
            empresa: { select: { nombre: true } },
            solicitante: { select: { nombre: true, empresaId: true } },
            detalle: { select: { so: true } },
        },
    });

    if (!equipo) return null;

    const empresaId = equipo.empresaId ?? equipo.solicitante?.empresaId ?? null;

    /*
     * Mismo calculo que el dashboard (por empresa completa), para que cada
     * equipo reciba un nombre distinto. Los dados de baja / vendidos no estan
     * en el calculo por empresa y siguen con el calculo individual de abajo.
     */
    if (empresaId) {
        const h = (await calcularHostnamesEmpresas([empresaId])).get(equipo.id_equipo);

        if (h) {
            const actualEquipo = equipo.hostname?.trim() || null;

            return {
                ok: true,
                idEquipo: equipo.id_equipo,
                actual: actualEquipo,
                sugerido: h.sugerido,
                coincide: h.coincide,
                motivo: h.motivo,
                detalle: {
                    prefijo: h.prefijo,
                    sigla: h.sigla,
                    parteSolicitante: h.parteSolicitante,
                    sinSolicitante: h.sinSolicitante,
                },
            };
        }
    }

    let nombreEmpresa = equipo.empresa?.nombre ?? null;

    if (!nombreEmpresa && empresaId) {
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { nombre: true },
        });

        nombreEmpresa = empresa?.nombre ?? null;
    }

    const ocupados = new Set<string>();

    if (empresaId) {
        const otros = await prisma.equipo.findMany({
            where: {
                id_equipo: { not: equipo.id_equipo },
                deletedAt: null,
                hostname: { not: null },
                OR: [
                    { empresaId },
                    { empresaId: null, solicitante: { is: { empresaId } } },
                ],
            },
            select: { hostname: true },
        });

        for (const o of otros) {
            if (o.hostname) ocupados.add(o.hostname.trim().toUpperCase());
        }
    }

    const r = sugerirHostname({
        tipo: String(equipo.tipo),
        hostnameActual: equipo.hostname,
        nombreEmpresa,
        nombreSolicitante: equipo.solicitante?.nombre ?? null,
        esMac: esEquipoMac({
            marca: equipo.marca,
            agenteVersion: equipo.agenteVersion,
            sistemaOperativo: equipo.detalle?.so ?? null,
        }),
        ocupados,
    });

    const actual = equipo.hostname?.trim() || null;

    return {
        ok: true,
        idEquipo: equipo.id_equipo,
        actual,
        sugerido: r.sugerido,
        coincide: Boolean(r.sugerido && actual && actual.toUpperCase() === r.sugerido),
        motivo: r.motivo,
        detalle: {
            prefijo: r.prefijo,
            sigla: r.sigla,
            parteSolicitante: r.parteSolicitante,
            sinSolicitante:
                !equipo.solicitante ||
                esSolicitanteDeRelleno(equipo.solicitante.nombre),
        },
    };
}