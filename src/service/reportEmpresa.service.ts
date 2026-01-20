import { prisma } from "../lib/prisma.js";

/* ======================================================
   📅 YYYY-MM -> rango [start, end) en UTC
====================================================== */
export function monthRange(ym: string) {
    const [y, m] = ym.split("-").map(Number);

    if (!y || !m) {
        throw new Error("month inválido (usa YYYY-MM)");
    }

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
   🧠 Clasificación del tipo de visita (DERIVADO)
====================================================== */
function clasificarTipoVisita(v: {
    actualizaciones: boolean;
    antivirus: boolean;
    ccleaner: boolean;
    estadoDisco: boolean;
    mantenimientoReloj: boolean;
    rendimientoEquipo: boolean;
    otros: boolean;
    otrosDetalle: string | null;
}): "PROGRAMADA" | "ADICIONAL" {
    if (
        v.actualizaciones ||
        v.antivirus ||
        v.ccleaner ||
        v.estadoDisco ||
        v.mantenimientoReloj ||
        v.rendimientoEquipo
    ) {
        return "PROGRAMADA";
    }

    if ((v.otrosDetalle ?? "").toLowerCase().includes("program")) {
        return "PROGRAMADA";
    }

    return "ADICIONAL";
}

/* ======================================================
   📊 Servicio principal de reportes
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
        select: { id_empresa: true, nombre: true },
    });

    if (!empresa) {
        throw new Error("Empresa no encontrada");
    }

    const { start, end } = monthRange(ym);

    /* =====================
       Visitas (KPIs)
    ===================== */
    const visitas = await prisma.visita.findMany({
        where: {
            empresaId,
            inicio: { gte: start, lt: end },
        },
        select: {
            inicio: true,
            fin: true,
        },
    });

    const visitasCount = visitas.length;

    const duracionesMs = visitas
        .filter(v => v.fin)
        .map(v => new Date(v.fin!).getTime() - new Date(v.inicio!).getTime())
        .filter(ms => ms > 0);

    const totalMs = duracionesMs.reduce((a, b) => a + b, 0);
    const avgMs = duracionesMs.length
        ? Math.round(totalMs / duracionesMs.length)
        : 0;

    /* =====================
       Visitas por tipo (derivado)
    ===================== */
    const visitasClasificables = await prisma.visita.findMany({
        where: {
            empresaId,
            inicio: { gte: start, lt: end },
        },
        select: {
            actualizaciones: true,
            antivirus: true,
            ccleaner: true,
            estadoDisco: true,
            mantenimientoReloj: true,
            rendimientoEquipo: true,
            otros: true,
            otrosDetalle: true,
        },
    });

    const visitasPorTipoMap: Record<"PROGRAMADA" | "ADICIONAL", number> = {
        PROGRAMADA: 0,
        ADICIONAL: 0,
    };

    for (const v of visitasClasificables) {
        const tipo = clasificarTipoVisita(v);
        visitasPorTipoMap[tipo]++;
    }

    const visitasPorTipo = Object.entries(visitasPorTipoMap).map(
        ([tipo, cantidad]) => ({
            tipo,
            cantidad,
        })
    );

    /* =====================
       Equipos
    ===================== */
    const equiposCount = await prisma.equipo.count({
        where: {
            solicitante: {
                empresaId,
            },
        },
    });

    /* =====================
       Tickets
    ===================== */
    const orgName = normalizeOrgName(empresa.nombre);
    let ticketsTotal = 0;

    if (orgName) {
        const org = await prisma.ticketOrg.findUnique({
            where: { name: orgName },
        });

        if (org) {
            ticketsTotal = await prisma.freshdeskTicket.count({
                where: {
                    ticketOrgId: org.id,
                    createdAt: { gte: start, lt: end },
                },
            });
        }
    }

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
                avgMs,
            },
            equipos: {
                count: equiposCount,
            },
            tickets: {
                total: ticketsTotal,
            },
        },

        visitasPorTipo,
    };
}
