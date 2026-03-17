import { prisma } from "../../lib/prisma.js";

import {
    contarMantenimientos,
    contarExtras,
    contarTiposVisita,
    obtenerTopUsuariosGeneral
} from "./reportes.metrics.js";

/* ======================================================
   📅 YYYY-MM -> rango [start, end)
====================================================== */
export function monthRange(ym: string) {

    const [y, m] = ym.split("-").map(Number);

    if (!y || !m) throw new Error("month inválido (usa YYYY-MM)");

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));

    const end = new Date(
        Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0)
    );

    return { start, end };

}

/* ======================================================
   🔄 Empresa -> TicketOrg
====================================================== */
function normalizeOrgName(nombre?: string | null): string | null {

    const key = (nombre ?? "").trim();

    return key ? key.toUpperCase() : null;

}

/* ======================================================
   ⏱️ Formatear duración
====================================================== */
function formatMs(ms: number) {

    const minutes = Math.round(ms / 60000);

    const h = Math.floor(minutes / 60);

    const m = minutes % 60;

    return h > 0
        ? `${h}h ${m}m`
        : `${m} minutos`;

}

/* ======================================================
   📊 SERVICE – REPORTE EMPRESA
====================================================== */
export async function buildReporteEmpresaData(
    empresaId: number,
    ym: string
) {

    /* =====================
       Empresa
    ===================== */
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true, nombre: true }
    });

    if (!empresa) throw new Error("Empresa no encontrada");

    const { start, end } = monthRange(ym);

    /* =====================
       VISITAS (única query)
    ===================== */
    const visitas = await prisma.visita.findMany({

        where: {
            empresaId,
            inicio: { gte: start, lt: end }
        },

        orderBy: { inicio: "asc" },

        select: {

            inicio: true,
            fin: true,

            solicitante: true,
            otrosDetalle: true,

            tecnico: { select: { nombre: true } },
            sucursal: { select: { nombre: true } },

            actualizaciones: true,
            antivirus: true,
            ccleaner: true,
            estadoDisco: true,
            mantenimientoReloj: true,
            rendimientoEquipo: true,
            licenciaOffice: true,
            licenciaWindows: true,

            confImpresoras: true,
            confTelefonos: true,
            confPiePagina: true,
            otros: true

        }

    });

    const visitasCount = visitas.length;

    const duracionesMs = visitas
        .filter(v => v.fin)
        .map(v =>
            new Date(v.fin!).getTime() - new Date(v.inicio!).getTime()
        )
        .filter(ms => ms > 0);

    const totalMs = duracionesMs.reduce((a, b) => a + b, 0);

    const avgMs = duracionesMs.length
        ? Math.round(totalMs / duracionesMs.length)
        : 0;

    /* =====================
       MÉTRICAS
    ===================== */
    const mantenimientos = contarMantenimientos(visitas);

    const extras = contarExtras(visitas);

    const visitasPorTipo = contarTiposVisita(visitas);

    /* =====================
       VISITAS POR TÉCNICO
    ===================== */
    const visitasPorTecnicoMap: Record<string, number> = {};

    for (const v of visitas) {

        const tecnico = v.tecnico?.nombre ?? "SIN TÉCNICO";

        visitasPorTecnicoMap[tecnico] =
            (visitasPorTecnicoMap[tecnico] ?? 0) + 1;

    }

    const visitasPorTecnico = Object
        .entries(visitasPorTecnicoMap)
        .map(([tecnico, cantidad]) => ({ tecnico, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

    /* =====================
       INVENTARIO
    ===================== */
    const equipos = await prisma.equipo.findMany({

        where: {
            solicitante: { empresaId }
        },

        select: {
            serial: true,
            marca: true,
            modelo: true,
            procesador: true,
            ram: true,
            disco: true,
            propiedad: true,
            solicitante: { select: { nombre: true } }
        }

    });

    /* =====================
       TICKETS
    ===================== */
    const orgName = normalizeOrgName(empresa.nombre);

    let ticketsDetalle: any[] = [];

    if (orgName) {

        const org = await prisma.ticketOrg.findUnique({
            where: { name: orgName }
        });

        if (org) {

            ticketsDetalle = await prisma.freshdeskTicket.findMany({

                where: {
                    ticketOrgId: org.id,
                    createdAt: { gte: start, lt: end }
                },

                select: {
                    id: true,
                    subject: true,
                    type: true,
                    status: true,
                    createdAt: true,
                    ticketRequester: {
                        select: {
                            name: true,
                            email: true
                        }
                    }
                },

                orderBy: { createdAt: "asc" }

            });

        }

    }

    const topUsuariosGeneral =
        obtenerTopUsuariosGeneral(visitas, ticketsDetalle);

    /* =====================
       TOP USUARIOS TICKETS
    ===================== */
    const usuarioMap: Record<
        string,
        { usuario: string; email?: string; cantidad: number }
    > = {};

    for (const t of ticketsDetalle) {

        const nombre = t.ticketRequester?.name ?? "Sin nombre";

        const email = t.ticketRequester?.email ?? null;

        if (!usuarioMap[nombre]) {

            usuarioMap[nombre] = {
                usuario: nombre,
                email,
                cantidad: 0
            };

        }

        usuarioMap[nombre].cantidad++;

    }

    const usuariosListado = Object.values(usuarioMap);

    const topUsuarios = usuariosListado
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    /* =====================
       MANTENCIONES REMOTAS
    ===================== */
    const mantenciones = await prisma.mantencionRemota.findMany({

        where: {
            empresaId,
            inicio: { gte: start, lt: end }
        },

        select: {
            id_mantencion: true,
            inicio: true,
            fin: true,
            status: true,
            solicitante: true,
            tecnico: { select: { nombre: true } }
        },

        orderBy: { inicio: "asc" }

    });

    /* =====================
       MANTENCIONES POR STATUS
    ===================== */
    const mantStatusMap: Record<string, number> = {};

    for (const m of mantenciones) {

        const status = m.status ?? "SIN ESTADO";

        mantStatusMap[status] =
            (mantStatusMap[status] ?? 0) + 1;

    }

    const porStatus = Object
        .entries(mantStatusMap)
        .map(([status, cantidad]) => ({ status, cantidad }));

    /* =====================
       MANTENCIONES POR TÉCNICO
    ===================== */
    const mantPorTecnicoMap: Record<string, number> = {};

    for (const m of mantenciones) {

        const tecnico = m.tecnico?.nombre ?? "SIN TÉCNICO";

        mantPorTecnicoMap[tecnico] =
            (mantPorTecnicoMap[tecnico] ?? 0) + 1;

    }

    const porTecnico = Object
        .entries(mantPorTecnicoMap)
        .map(([tecnico, cantidad]) => ({ tecnico, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

    /* =====================
       MANTENCIONES POR DÍA
    ===================== */
    const mantPorDiaMap: Record<string, number> = {};

    for (const m of mantenciones) {

        const fecha =
            new Date(m.inicio).toISOString().slice(0, 10);

        mantPorDiaMap[fecha] =
            (mantPorDiaMap[fecha] ?? 0) + 1;

    }

    const porDia = Object
        .entries(mantPorDiaMap)
        .map(([fecha, cantidad]) => ({ fecha, cantidad }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

    /* =====================
       TOP SOLICITANTES
    ===================== */
    const mantPorSolicitanteMap: Record<string, number> = {};

    for (const m of mantenciones) {

        const solicitante = m.solicitante ?? "Sin nombre";

        mantPorSolicitanteMap[solicitante] =
            (mantPorSolicitanteMap[solicitante] ?? 0) + 1;

    }

    const topSolicitantes = Object
        .entries(mantPorSolicitanteMap)
        .map(([solicitante, cantidad]) => ({ solicitante, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    /* =====================
       USUARIOS CRM
    ===================== */
    const usuariosCRM = await prisma.solicitante.findMany({

        where: { empresaId },

        select: {
            nombre: true,
            email: true
        },

        orderBy: { nombre: "asc" }

    });

    /* =====================
       NARRATIVA
    ===================== */
    const narrativa = {

        resumen:
            `Durante el periodo ${ym}, se realizaron ${visitasCount} visitas técnicas con una duración promedio de ${formatMs(avgMs)} por intervención.`

    };

    /* =====================
       RETURN FINAL
    ===================== */
    return {

        empresa,
        month: ym,

        kpis: {

            visitas: {
                count: visitasCount,
                totalMs,
                avgMs
            },

            equipos: {
                count: equipos.length
            },

            tickets: {
                total: ticketsDetalle.length
            },

            mantenciones: {
                total: mantenciones.length
            }

        },

        visitas: {
            detalle: visitas,
            porTipo: visitasPorTipo,
            porTecnico: visitasPorTecnico
        },

        mantenimientos,
        extras,

        inventario: {
            equipos,
            total: equipos.length
        },

        tickets: {
            detalle: ticketsDetalle,
            total: ticketsDetalle.length,
            topUsuarios,
            topUsuariosGeneral
        },

        mantenciones: {
            total: mantenciones.length,
            detalle: mantenciones,
            porStatus,
            porTecnico,
            porDia,
            topSolicitantes
        },

        usuariosCRM: usuariosCRM.map(u => ({
            usuario: u.nombre,
            email: u.email ?? null
        })),

        narrativa

    };

}