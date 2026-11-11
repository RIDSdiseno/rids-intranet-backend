// src/service/pendientes/pendientes-resumen.service.ts

/* =========================================================
   RESUMEN DIARIO DE PENDIENTES POR CORREO

   Las mismas listas "en vivo" de la campana de recordatorios
   (vista ADMIN: todo), en un solo correo para una lista fija
   (PENDIENTES_RESUMEN_CORREOS):

     - Tickets activos (NEW, OPEN, PENDING)
     - Visitas en PENDIENTE hace más de 24 h (por jornada)
     - Órdenes de taller sin salida
     - Suscripciones vencidas y por vencer
     - Cotizaciones en BORRADOR de los últimos 30 días

   Si no hay nada en ninguna sección, no se envía.
   ========================================================= */

import {
    obtenerCotizacionesBorrador,
    obtenerOrdenesTallerPendientes,
    obtenerTicketsActivos,
    obtenerVisitasVencidas,
} from "../../controllers/recordatorios.controller.js";

import {
    vencimientosSuscripcionesCampana,
} from "../suscripciones-contratos/suscripciones-vencimientos.service.js";

import {
    hoyChile,
    normalizarListaCorreos,
} from "../suscripciones-contratos/suscripciones-avisos.service.js";

import {
    sendEmail,
} from "../correos-masivos/masivos-email-sender.service.js";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    evaluarCompletitudFichasEmpresas,
    type CompletitudFichaEmpresa,
} from "../empresas/empresa-ficha-completitud.service.js";

const LOG =
    "[PENDIENTES RESUMEN]";

const ZONA =
    "America/Santiago";

/** Rol con el que se arman las listas: ADMIN ve todo. */
const ROL_RESUMEN =
    "ADMIN";

/* =========================================================
   TIPOS
   ========================================================= */

type Tickets =
    Awaited<ReturnType<typeof obtenerTicketsActivos>>;

type Visitas =
    Awaited<ReturnType<typeof obtenerVisitasVencidas>>;

type Taller =
    Awaited<ReturnType<typeof obtenerOrdenesTallerPendientes>>;

type Suscripciones =
    Awaited<ReturnType<typeof vencimientosSuscripcionesCampana>>;

type Cotizaciones =
    Awaited<ReturnType<typeof obtenerCotizacionesBorrador>>;

type FichaIncompleta = {
    empresaId: number;
    empresaNombre: string;
    completitud: CompletitudFichaEmpresa;
};

export type DatosResumenPendientes = {
    /** YYYY-MM-DD (Chile) */
    hoy: string;
    tickets: Tickets;
    visitas: Visitas;
    taller: Taller;
    suscripciones: Suscripciones;
    cotizaciones: Cotizaciones;
    fichas: FichaIncompleta[]
};

export type ResultadoResumenPendientes = {
    hoy: string;
    enviado: boolean;
    motivo: string;
    destinatarios: string[];
    conteos: {
        tickets: number;
        visitas: number;
        taller: number;
        suscripciones: number;
        cotizaciones: number;
        fichas: number;
    };
    /** Solo con simular: el HTML que se enviaría. */
    html?: string;
};

/* =========================================================
   CONFIG
   ========================================================= */

export function correosResumenPendientes(): string[] {
    return normalizarListaCorreos(
        process.env
            .PENDIENTES_RESUMEN_CORREOS,
    );
}

/* =========================================================
   HELPERS
   ========================================================= */

const DIA_MS =
    86_400_000;

/** Empresas comodín que no tienen ficha real (se comparan en mayúsculas). */
const EMPRESAS_SIN_FICHA = new Set([
    "SIN EMPRESA",
    "SIN CLASIFICAR",
]);

/** Faltantes que se listan por sección; el resto va como "y N más". */
const MAX_FALTANTES_POR_SECCION = 6;

function escaparHtml(
    valor: unknown,
): string {
    return String(
        valor ??
        "",
    )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function fechaCorta(
    fecha: Date | string,
): string {
    return new Intl.DateTimeFormat(
        "es-CL",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: ZONA,
        },
    ).format(
        new Date(fecha),
    );
}

function fechaLarga(
    clave: string,
): string {
    return new Intl.DateTimeFormat(
        "es-CL",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        },
    ).format(
        new Date(`${clave}T00:00:00.000Z`),
    );
}

/** "YYYY-MM-DD" de una suscripción (medianoche UTC) a "DD-MM-YYYY". */
function claveADmy(
    clave: string,
): string {
    const [
        y,
        m,
        d,
    ] = clave.split("-");

    return `${d}-${m}-${y}`;
}

function diasDesde(
    fecha: Date | string,
): number {
    return Math.max(
        0,
        Math.floor(
            (Date.now() -
                new Date(fecha).getTime()) /
            DIA_MS,
        ),
    );
}

function textoDias(
    dias: number,
): string {
    if (dias === 0) {
        return "hoy";
    }

    return dias === 1
        ? "1 día"
        : `${dias} días`;
}

const ESTADO_TICKET: Record<string, string> = {
    NEW: "Nuevo",
    OPEN: "Abierto",
    PENDING: "Pendiente",
};

function monto(
    valor: number,
    moneda: string,
): string {
    return new Intl.NumberFormat(
        "es-CL",
        {
            style: "currency",
            currency: moneda === "USD" ? "USD" : "CLP",
            maximumFractionDigits: moneda === "USD" ? 2 : 0,
        },
    ).format(valor);
}

const PRIORIDAD_TICKET: Record<string, string> = {
    URGENT: "Urgente",
    HIGH: "Alta",
    NORMAL: "Normal",
    LOW: "Baja",
};

/* =========================================================
   HTML (tablas con estilos en línea: compatible con Outlook)
   ========================================================= */

const COLOR = {
    texto: "#1E293B",
    suave: "#64748B",
    linea: "#E2E8F0",
    cabecera: "#F1F5F9",
    titulo: "#0B2545",
    rojo: "#B91C1C",
    rojoFondo: "#FEE2E2",
    ambar: "#B45309",
    ambarFondo: "#FEF3C7",
};

const TH =
    `style="text-align:left;padding:6px 8px;background:${COLOR.cabecera};border-bottom:1px solid ${COLOR.linea};font-size:12px;color:${COLOR.suave};font-weight:600;white-space:nowrap;"`;

const TD_BASE =
    `padding:6px 8px;border-bottom:1px solid ${COLOR.linea};font-size:13px;color:${COLOR.texto};vertical-align:top;`;

const TD =
    `style="${TD_BASE}"`;

/** Celda con estilos extra (un solo atributo style: el segundo se ignora). */
function td(
    extra: string,
): string {
    return `style="${TD_BASE}${extra}"`;
}

function chip(
    texto: string,
    tono: "rojo" | "ambar" | "normal",
): string {
    const estilos =
        tono === "rojo"
            ? `background:${COLOR.rojoFondo};color:${COLOR.rojo};`
            : tono === "ambar"
                ? `background:${COLOR.ambarFondo};color:${COLOR.ambar};`
                : `background:${COLOR.cabecera};color:${COLOR.suave};`;

    return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap;${estilos}">${escaparHtml(texto)}</span>`;
}

function seccion(
    titulo: string,
    cantidad: number,
    cabeceras: string[],
    filas: string[],
    pie?: string,
): string {
    if (
        cantidad === 0
    ) {
        return "";
    }

    return `
<h2 style="margin:28px 0 8px;font-size:16px;color:${COLOR.titulo};">${escaparHtml(titulo)} <span style="color:${COLOR.suave};font-weight:400;">(${cantidad})</span></h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${COLOR.linea};">
    <tr>${cabeceras.map((c) => `<th ${TH}>${escaparHtml(c)}</th>`).join("")}</tr>
    ${filas.join("\n    ")}
</table>
${pie ? `<p style="margin:6px 0 0;font-size:12px;color:${COLOR.suave};">${escaparHtml(pie)}</p>` : ""}`;
}

export function construirCorreoPendientes(
    datos: DatosResumenPendientes,
): {
    asunto: string;
    html: string;
} {

    const {
        tickets,
        visitas,
        taller,
        suscripciones,
        cotizaciones,
        fichas,
    } = datos;

    const nTickets =
        tickets.total;

    const urgentes =
        tickets.tickets.filter(
            (t) =>
                t.priority === "URGENT",
        ).length;

    const vencidas =
        suscripciones.filter(
            (s) =>
                s.dias < 0,
        ).length;

    /* ---------- Tickets ---------- */

    const filasTickets =
        tickets.tickets.map(
            (t) => {
                const prioridad =
                    t.priority === "URGENT"
                        ? chip("Urgente", "rojo")
                        : t.priority === "HIGH"
                            ? chip("Alta", "ambar")
                            : escaparHtml(PRIORIDAD_TICKET[t.priority] ?? t.priority);

                return `<tr>
        <td ${TD}>#${t.id}</td>
        <td ${TD}>${escaparHtml(t.subject)}</td>
        <td ${TD}>${escaparHtml(t.empresa?.nombre ?? "—")}</td>
        <td ${TD}>${escaparHtml(ESTADO_TICKET[t.status] ?? t.status)}</td>
        <td ${TD}>${prioridad}</td>
        <td ${TD}>${escaparHtml(t.assignee?.nombre ?? "Sin asignar")}</td>
        <td ${td("white-space:nowrap;")}>${textoDias(diasDesde(t.createdAt))}</td>
    </tr>`;
            },
        );

    /* ---------- Visitas ---------- */

    const filasVisitas =
        visitas.map(
            (v) => {
                const dias =
                    textoDias(v.dias);

                return `<tr>
        <td ${td("white-space:nowrap;")}>${claveADmy(v.fecha)}</td>
        <td ${TD}>${escaparHtml(v.empresaNombre)}</td>
        <td ${TD}>${escaparHtml(v.tecnicoNombre)}</td>
        <td ${TD}>${v.visitaIds.length}</td>
        <td ${TD}>${v.dias >= 3 ? chip(dias, "rojo") : chip(dias, "ambar")}</td>
    </tr>`;
            },
        );

    /* ---------- Taller ---------- */

    const filasTaller =
        taller.map(
            (o) => {
                const dias =
                    diasDesde(
                        o.fechaIngreso ??
                        o.fecha,
                    );

                const equipo =
                    o.equipo
                        ? `${o.equipo.marca} ${o.equipo.modelo}${o.equipo.serial ? ` (${o.equipo.serial})` : ""}`
                        : "—";

                return `<tr>
        <td ${TD}>#${o.id}</td>
        <td ${td("white-space:nowrap;")}>${escaparHtml(o.numeroOrden ?? "—")}</td>
        <td ${TD}>${escaparHtml(o.entidad?.nombre ?? "—")}</td>
        <td ${TD}>${escaparHtml(o.tipoTrabajo)}<br><span style="color:${COLOR.suave};font-size:12px;">${escaparHtml(equipo)}</span></td>
        <td ${TD}>${escaparHtml(o.tecnico?.nombre ?? "Sin técnico")}</td>
        <td ${TD}>${dias >= 7 ? chip(textoDias(dias), "rojo") : chip(textoDias(dias), "normal")}</td>
    </tr>`;
            },
        );

    /* ---------- Suscripciones ---------- */

    const filasSuscripciones =
        suscripciones.map(
            (s) => {
                const estado =
                    s.dias < 0
                        ? chip(`Vencida hace ${textoDias(-s.dias)}`, "rojo")
                        : s.dias === 0
                            ? chip("Vence hoy", "rojo")
                            : s.dias <= 7
                                ? chip(`Vence en ${textoDias(s.dias)}`, "ambar")
                                : chip(`Vence en ${textoDias(s.dias)}`, "normal");

                const fechas =
                    s.fechas
                        .map(
                            (f) =>
                                `${f.tipoFecha === "RENOVACION" ? "Renovación" : "Término"} ${claveADmy(f.fecha)}`,
                        )
                        .join("<br>");

                return `<tr>
        <td ${TD}>${escaparHtml(s.empresaNombre)}</td>
        <td ${TD}>${escaparHtml(s.productoPlan)}</td>
        <td ${td("white-space:nowrap;")}>${fechas}</td>
        <td ${TD}>${estado}</td>
    </tr>`;
            },
        );

    /* ---------- Cotizaciones ---------- */

    const nCotizaciones =
        cotizaciones.total;

    const filasCotizaciones =
        cotizaciones.cotizaciones.map(
            (c) => {
                const dias =
                    diasDesde(c.fecha);

                return `<tr>
        <td ${TD}>#${c.id}</td>
        <td ${TD}>${escaparHtml(c.entidad?.nombre ?? "Sin cliente")}${c.tipo !== "CLIENTE" ? ` ${chip(c.tipo === "INTERNA" ? "Interna" : "Proveedor", "normal")}` : ""}</td>
        <td ${td("white-space:nowrap;text-align:right;")}>${escaparHtml(monto(c.total, c.moneda))}</td>
        <td ${TD}>${escaparHtml(c.tecnico?.nombre ?? c.personaResponsable ?? "—")}</td>
        <td ${td("white-space:nowrap;")}>${fechaCorta(c.fecha)}</td>
        <td ${TD}>${dias >= 20 ? chip(textoDias(dias), "ambar") : chip(textoDias(dias), "normal")}</td>
    </tr>`;
            },
        );

    /* ---------- Fichas de empresa ---------- */

    const filasFichas =
        fichas.map(
            (f) => {
                const p =
                    f.completitud.porcentaje;

                const porcentaje =
                    p < 50
                        ? chip(`${p}%`, "rojo")
                        : p < 80
                            ? chip(`${p}%`, "ambar")
                            : chip(`${p}%`, "normal");

                /* Solo secciones obligatorias con algo pendiente */
                const detalle =
                    f.completitud.secciones
                        .filter(
                            (s) =>
                                s.obligatoria &&
                                (s.estado === "INCOMPLETA" ||
                                    s.estado === "SIN_DATOS"),
                        )
                        .map(
                            (s) => {
                                if (
                                    s.estado ===
                                    "SIN_DATOS"
                                ) {
                                    return `<b>${escaparHtml(s.label)}</b>: sin datos`;
                                }

                                const lista =
                                    s.faltantes
                                        .slice(
                                            0,
                                            MAX_FALTANTES_POR_SECCION,
                                        )
                                        .map(
                                            (x) =>
                                                escaparHtml(
                                                    x.registro
                                                        ? `${x.label} (${x.registro})`
                                                        : x.label,
                                                ),
                                        );

                                const resto =
                                    s.faltantes.length -
                                    MAX_FALTANTES_POR_SECCION;

                                return `<b>${escaparHtml(s.label)}</b> (${s.porcentaje}%): ${lista.join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`;
                            },
                        )
                        .join("<br>");

                return `<tr>
        <td ${TD}>${escaparHtml(f.empresaNombre)}</td>
        <td ${td("white-space:nowrap;")}>${porcentaje}<br><span style="color:${COLOR.suave};font-size:12px;">${f.completitud.seccionesCompletas}/${f.completitud.totalSecciones} secciones</span></td>
        <td ${td("font-size:12px;line-height:1.5;")}>${detalle || "—"}</td>
    </tr>`;
            },
        );

    const promedioFichas =
        fichas.length > 0
            ? Math.round(
                fichas.reduce(
                    (t, f) =>
                        t + f.completitud.porcentaje,
                    0,
                ) /
                fichas.length,
            )
            : 100;

    /* ---------- Resumen superior ---------- */

    const fechaDia =
        fechaLarga(datos.hoy);

    /* "miércoles, 11 de noviembre…" -> "Miércoles, 11 de noviembre…" */
    const fechaTitulo =
        fechaDia.charAt(0).toUpperCase() +
        fechaDia.slice(1);

    const tarjeta =
        (
            numero: number,
            etiqueta: string,
            detalle: string,
        ) =>
            `<td style="padding:10px 12px;border:1px solid ${COLOR.linea};border-radius:8px;width:16%;">
        <div style="font-size:22px;font-weight:700;color:${COLOR.titulo};">${numero}</div>
        <div style="font-size:12px;color:${COLOR.texto};">${escaparHtml(etiqueta)}</div>
        <div style="font-size:11px;color:${COLOR.suave};">${escaparHtml(detalle)}</div>
    </td>`;

    const html = `
<div style="font-family:Arial,sans-serif;color:${COLOR.texto};max-width:900px;">
<h1 style="margin:0 0 4px;font-size:20px;color:${COLOR.titulo};">Pendientes a revisar</h1>
<p style="margin:0 0 16px;font-size:13px;color:${COLOR.suave};">${escaparHtml(fechaTitulo)}</p>

<table role="presentation" cellpadding="0" cellspacing="6" style="width:100%;">
    <tr>
    ${tarjeta(nTickets, "Tickets activos", urgentes > 0 ? (urgentes === 1 ? "1 urgente" : `${urgentes} urgentes`) : "Nuevos, abiertos y pendientes")}
    ${tarjeta(visitas.length, "Visitas sin cerrar", "Pendientes hace más de 24 h")}
    ${tarjeta(taller.length, "Órdenes en taller", "Sin salida registrada")}
    ${tarjeta(suscripciones.length, "Suscripciones", vencidas > 0 ? (vencidas === 1 ? "1 vencida" : `${vencidas} vencidas`) : "Por vencer en 30 días")}
    ${tarjeta(nCotizaciones, "Cotizaciones", "En borrador, últimos 30 días")}
    ${tarjeta(fichas.length, "Fichas incompletas", fichas.length > 0 ? `Promedio ${promedioFichas}%` : "Todas completas")}
    </tr>
</table>

${seccion(
        "Tickets activos",
        nTickets,
        ["#", "Asunto", "Empresa", "Estado", "Prioridad", "Asignado", "Antigüedad"],
        filasTickets,
        nTickets > tickets.tickets.length
            ? `Se muestran ${tickets.tickets.length} de ${nTickets}. El resto está en Helpdesk.`
            : undefined,
    )}

${seccion(
        "Visitas sin cerrar",
        visitas.length,
        ["Fecha", "Empresa", "Técnico", "Atenciones", "Pendiente hace"],
        filasVisitas,
    )}

${seccion(
        "Órdenes en taller",
        taller.length,
        ["#", "Orden", "Cliente", "Trabajo / equipo", "Técnico", "En taller"],
        filasTaller,
    )}

${seccion(
        "Suscripciones y contratos",
        suscripciones.length,
        ["Empresa", "Producto / plan", "Fecha", "Estado"],
        filasSuscripciones,
    )}

${seccion(
        "Cotizaciones en borrador (últimos 30 días)",
        nCotizaciones,
        ["#", "Cliente", "Total", "Responsable", "Fecha", "Antigüedad"],
        filasCotizaciones,
        nCotizaciones > cotizaciones.cotizaciones.length
            ? `Se muestran ${cotizaciones.cotizaciones.length} de ${nCotizaciones}. El resto está en Cotizaciones.`
            : undefined,
    )}

${seccion(
        "Fichas de empresa incompletas",
        fichas.length,
        ["Empresa", "Completitud", "Lo que falta"],
        filasFichas,
    )}

<p style="margin:28px 0 0;font-size:11px;color:${COLOR.suave};">Correo automático del CRM RIDS. Mismos datos que la campana de recordatorios.</p>
</div>`.trim();

    const partes = [
        nTickets > 0 ? `${nTickets} tickets` : null,
        visitas.length > 0 ? `${visitas.length} visitas` : null,
        taller.length > 0 ? `${taller.length} en taller` : null,
        suscripciones.length > 0 ? `${suscripciones.length} suscripciones` : null,
        nCotizaciones > 0 ? `${nCotizaciones} cotizaciones` : null,
        fichas.length > 0 ? `${fichas.length} fichas incompletas` : null,
    ].filter(Boolean);

    return {
        asunto:
            `Pendientes CRM del ${fechaCorta(new Date())}: ${partes.join(" · ")}`,
        html,
    };
}

/* =========================================================
   PROCESO
   ========================================================= */

/**
 * Empresas activas con ficha INCOMPLETA (mismo cálculo que el chip
 * «Ficha %» del listado de empresas), la de menor porcentaje primero.
 */
async function obtenerFichasIncompletas(): Promise<FichaIncompleta[]> {

    const empresas =
        await prisma.empresa.findMany({
            where: {
                isActive:
                    true,
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,
            },
        });

    const evaluables =
        empresas.filter(
            (e) =>
                !EMPRESAS_SIN_FICHA.has(
                    e.nombre.trim().toUpperCase(),
                ),
        );

    const completitud =
        await evaluarCompletitudFichasEmpresas(
            evaluables.map(
                (e) =>
                    e.id_empresa,
            ),
        );

    return evaluables
        .flatMap(
            (e) => {
                const c =
                    completitud.get(
                        e.id_empresa,
                    );

                return c &&
                    c.estado ===
                    "INCOMPLETA"
                    ? [{
                        empresaId:
                            e.id_empresa,

                        empresaNombre:
                            e.nombre,

                        completitud:
                            c,
                    }]
                    : [];
            },
        )
        .sort(
            (a, b) =>
                a.completitud.porcentaje -
                b.completitud.porcentaje ||
                a.empresaNombre.localeCompare(
                    b.empresaNombre,
                    "es",
                ),
        );
}

export async function obtenerDatosResumenPendientes(): Promise<DatosResumenPendientes> {

    const [
        tickets,
        visitas,
        taller,
        suscripciones,
        cotizaciones,
        fichas,
    ] = await Promise.all([
        obtenerTicketsActivos(
            ROL_RESUMEN,
        ),

        /* ADMIN ve todas: el técnico no se usa */
        obtenerVisitasVencidas(
            ROL_RESUMEN,
            0,
        ),

        obtenerOrdenesTallerPendientes(
            ROL_RESUMEN,
        ),

        vencimientosSuscripcionesCampana(),

        obtenerCotizacionesBorrador(
            ROL_RESUMEN,
        ),

         obtenerFichasIncompletas(),
    ]);

    return {
        hoy:
            hoyChile(),
        tickets,
        visitas,
        taller,
        suscripciones,
        cotizaciones,
        fichas,
    };
}

export async function procesarResumenPendientes(
    opciones?: {
        simular?: boolean;
    },
): Promise<ResultadoResumenPendientes> {

    const destinatarios =
        correosResumenPendientes();

    const datos =
        await obtenerDatosResumenPendientes();

    const conteos = {
        tickets:
            datos.tickets.total,
        visitas:
            datos.visitas.length,
        taller:
            datos.taller.length,
        suscripciones:
            datos.suscripciones.length,
        cotizaciones:
            datos.cotizaciones.total,
         fichas:
            datos.fichas.length,
    };

    const base = {
        hoy:
            datos.hoy,
        destinatarios,
        conteos,
    };

    const total =
        conteos.tickets +
        conteos.visitas +
        conteos.taller +
        conteos.suscripciones +
        conteos.cotizaciones +
        conteos.fichas;

    if (
        total ===
        0
    ) {
        return {
            ...base,
            enviado: false,
            motivo: "sin pendientes",
        };
    }

    const {
        asunto,
        html,
    } = construirCorreoPendientes(
        datos,
    );

    if (
        opciones?.simular
    ) {
        return {
            ...base,
            enviado: false,
            motivo: "simulación",
            html,
        };
    }

    if (
        destinatarios.length ===
        0
    ) {
        console.warn(
            `${LOG} ⚠️ PENDIENTES_RESUMEN_CORREOS vacío: no se envía`,
        );

        return {
            ...base,
            enviado: false,
            motivo: "sin destinatarios",
        };
    }

    /* Un correo por destinatario, igual que los avisos de suscripciones */
    const errores: string[] =
        [];

    for (
        const correo
        of destinatarios
    ) {
        try {
            await sendEmail({
                to:
                    correo,

                subject:
                    asunto,

                bodyHtml:
                    html,
            });
        } catch (
        error
        ) {
            const detalle =
                error instanceof Error
                    ? error.message
                    : String(error);

            errores.push(
                `${correo}: ${detalle}`,
            );

            console.error(
                `${LOG} ❌ ${correo}`,
                detalle,
            );
        }
    }

    if (
        errores.length ===
        destinatarios.length
    ) {
        return {
            ...base,
            enviado: false,
            motivo: `error en todos los envíos (${errores.join("; ")})`,
        };
    }

    return {
        ...base,
        enviado: true,
        motivo:
            errores.length > 0
                ? `enviado con errores (${errores.join("; ")})`
                : "enviado",
    };
}