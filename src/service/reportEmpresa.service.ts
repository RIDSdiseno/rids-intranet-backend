import { prisma } from "../lib/prisma.js";

/* ======================================================
   📅 YYYY-MM -> rango [start, end) en UTC
====================================================== */
export function monthRange(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) throw new Error("month inválido (usa YYYY-MM)");

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));

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
    ) return "PROGRAMADA";

    if ((v.otrosDetalle ?? "").toLowerCase().includes("program")) {
        return "PROGRAMADA";
    }

    return "ADICIONAL";
}

/* ======================================================
   📊 SERVICE FINAL – REPORTE EMPRESA
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

    if (!empresa) throw new Error("Empresa no encontrada");

    const { start, end } = monthRange(ym);

    /* =====================
       VISITAS – KPIs
    ===================== */
    const visitasBase = await prisma.visita.findMany({
        where: { empresaId, inicio: { gte: start, lt: end } },
        select: {
            inicio: true,
            fin: true,
        },
    });

    const visitasCount = visitasBase.length;

    const duracionesMs = visitasBase
        .filter(v => v.fin)
        .map(v => new Date(v.fin!).getTime() - new Date(v.inicio!).getTime())
        .filter(ms => ms > 0);

    const totalMs = duracionesMs.reduce((a, b) => a + b, 0);
    const avgMs = duracionesMs.length ? Math.round(totalMs / duracionesMs.length) : 0;

    /* =====================
       VISITAS – CLASIFICACIÓN
    ===================== */
    const visitasClasificables = await prisma.visita.findMany({
        where: { empresaId, inicio: { gte: start, lt: end } },
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
        ([tipo, cantidad]) => ({ tipo, cantidad })
    );

    /* =====================
       VISITAS – DETALLE (IGUAL A LA WEB)
    ===================== */
    const visitasDetalle = await prisma.visita.findMany({
        where: { empresaId, inicio: { gte: start, lt: end } },
        orderBy: { inicio: "asc" },
        select: {
            inicio: true,
            fin: true,
            solicitante: true,
            tecnico: { select: { nombre: true } },
            sucursal: { select: { nombre: true } },
            otrosDetalle: true,
        },
    });

    /* =====================
       VISITAS – POR TÉCNICO
    ===================== */
    const visitasPorTecnicoMap: Record<string, number> = {};
    for (const v of visitasDetalle) {
        const tecnico = v.tecnico?.nombre ?? "SIN TÉCNICO";
        visitasPorTecnicoMap[tecnico] = (visitasPorTecnicoMap[tecnico] ?? 0) + 1;
    }

    const visitasPorTecnico = Object.entries(visitasPorTecnicoMap).map(
        ([tecnico, cantidad]) => ({ tecnico, cantidad })
    );

    /* =====================
       EQUIPOS / INVENTARIO
    ===================== */
    const equipos = await prisma.equipo.findMany({
        where: {
            solicitante: { empresaId },
        },
        select: {
            serial: true,
            marca: true,
            modelo: true,
            procesador: true,
            ram: true,
            disco: true,
            propiedad: true,
            solicitante: { select: { nombre: true } },
        },
    });

    /* =====================
       TICKETS
    ===================== */
    const orgName = normalizeOrgName(empresa.nombre);
    let ticketsDetalle: {
        createdAt: Date;
        type: string | null;
        status: number;
    }[] = [];

    if (orgName) {
        const org = await prisma.ticketOrg.findUnique({
            where: { name: orgName },
        });

        if (org) {
            ticketsDetalle = await prisma.freshdeskTicket.findMany({
                where: {
                    ticketOrgId: org.id,
                    createdAt: { gte: start, lt: end },
                },
                select: {
                    createdAt: true,
                    type: true,
                    status: true,
                },
                orderBy: { createdAt: "asc" },
            });
        }
    }

    /* =====================
       NARRATIVA AUTOMÁTICA
    ===================== */
    const narrativa = {
        resumen: `Durante el periodo ${ym}, se realizaron ${visitasCount} visitas técnicas, con una duración promedio de ${Math.round(
            avgMs / 60000
        )} minutos por visita. Se registraron ${equipos.length} equipos y ${ticketsDetalle.length} tickets asociados a la empresa.`,
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
                avgMs,
            },
            equipos: {
                count: equipos.length,
            },
            tickets: {
                total: ticketsDetalle.length,
            },
        },

        visitasPorTipo,
        visitasDetalle,
        visitasPorTecnico,

        inventario: {
            equipos,
            total: equipos.length,
        },

        tickets: {
            detalle: ticketsDetalle,
            total: ticketsDetalle.length,
        },

        narrativa,
    };
}
