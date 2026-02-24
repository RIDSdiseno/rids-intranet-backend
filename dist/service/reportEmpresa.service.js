import { prisma } from "../lib/prisma.js";
/* ======================================================
   📅 YYYY-MM -> rango [start, end) en UTC
====================================================== */
export function monthRange(ym) {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m)
        throw new Error("month inválido (usa YYYY-MM)");
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
    return { start, end };
}
/* ======================================================
   🔄 Empresa -> TicketOrg
====================================================== */
function normalizeOrgName(nombre) {
    const key = (nombre ?? "").trim();
    return key ? key.toUpperCase() : null;
}
/* ======================================================
   🧠 Clasificación del tipo de visita (DERIVADO)
====================================================== */
function clasificarTipoVisita(v) {
    if (v.actualizaciones ||
        v.antivirus ||
        v.ccleaner ||
        v.estadoDisco ||
        v.mantenimientoReloj ||
        v.rendimientoEquipo)
        return "PROGRAMADA";
    if ((v.otrosDetalle ?? "").toLowerCase().includes("program")) {
        return "PROGRAMADA";
    }
    return "ADICIONAL";
}
/* ======================================================
   📊 SERVICE FINAL – REPORTE EMPRESA
====================================================== */
export async function buildReporteEmpresaData(empresaId, ym) {
    /* =====================
       Empresa
    ===================== */
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true, nombre: true },
    });
    if (!empresa)
        throw new Error("Empresa no encontrada");
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
        .map(v => new Date(v.fin).getTime() - new Date(v.inicio).getTime())
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
    const visitasPorTipoMap = {
        PROGRAMADA: 0,
        ADICIONAL: 0,
    };
    for (const v of visitasClasificables) {
        const tipo = clasificarTipoVisita(v);
        visitasPorTipoMap[tipo]++;
    }
    const visitasPorTipo = Object.entries(visitasPorTipoMap).map(([tipo, cantidad]) => ({ tipo, cantidad }));
    /* =====================
       VISITAS – DETALLE
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
    const visitasPorTecnicoMap = {};
    for (const v of visitasDetalle) {
        const tecnico = v.tecnico?.nombre ?? "SIN TÉCNICO";
        visitasPorTecnicoMap[tecnico] = (visitasPorTecnicoMap[tecnico] ?? 0) + 1;
    }
    const visitasPorTecnico = Object.entries(visitasPorTecnicoMap).map(([tecnico, cantidad]) => ({ tecnico, cantidad }));
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
       🔥 SOLICITANTES DEL CRM (todos los de la empresa)
    ===================== */
    const solicitantesCRM = await prisma.solicitante.findMany({
        where: { empresaId },
        select: {
            id_solicitante: true,
            nombre: true,
            email: true,
        },
        orderBy: { nombre: "asc" },
    });
    // Listado completo para el reporte
    const usuariosCRMListado = solicitantesCRM.map(s => ({
        usuario: s.nombre,
        email: s.email ?? undefined,
    }));
    /* =====================
       TICKETS
    ===================== */
    const orgName = normalizeOrgName(empresa.nombre);
    let ticketsDetalle = [];
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
                    id: true,
                    subject: true,
                    type: true,
                    status: true,
                    createdAt: true,
                    requesterEmail: true,
                    ticketRequester: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { createdAt: "asc" },
            });
        }
    }
    // Mapa de usuarios por tickets (Freshdesk)
    const usuariosMap = {};
    for (const t of ticketsDetalle) {
        const nombre = t.ticketRequester?.name ?? "Sin nombre";
        const email = t.ticketRequester?.email ?? "";
        if (!usuariosMap[nombre]) {
            usuariosMap[nombre] = { email, cantidad: 0 };
        }
        usuariosMap[nombre].cantidad++;
    }
    // Top usuarios por cantidad de tickets
    const topUsuarios = Object.entries(usuariosMap)
        .map(([usuario, { email, cantidad }]) => ({ usuario, email, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);
    // Listado combinado: solicitantes CRM + datos de tickets si tienen
    // Prioriza solicitantes del CRM, enriquece con ticket count si existe
    const usuariosListado = usuariosCRMListado.map(s => {
        const ticketData = usuariosMap[s.usuario];
        return {
            usuario: s.usuario,
            email: s.email ?? ticketData?.email,
            cantidad: ticketData?.cantidad ?? 0,
        };
    });
    /* =====================
       MANTENCIONES REMOTAS
    ===================== */
    const mantencionesDetalle = await prisma.mantencionRemota.findMany({
        where: {
            empresaId,
            inicio: { gte: start, lt: end },
        },
        orderBy: { inicio: "asc" },
        select: {
            id_mantencion: true,
            inicio: true,
            fin: true,
            status: true,
            solicitante: true,
            tecnico: { select: { nombre: true } },
        },
    });
    const mantencionesCount = mantencionesDetalle.length;
    const mantencionesPorStatusMap = {};
    for (const m of mantencionesDetalle) {
        const key = m.status ?? "SIN ESTADO";
        mantencionesPorStatusMap[key] = (mantencionesPorStatusMap[key] ?? 0) + 1;
    }
    const mantencionesPorStatus = Object.entries(mantencionesPorStatusMap).map(([status, cantidad]) => ({ status, cantidad }));
    /* =====================
       NARRATIVA AUTOMÁTICA
    ===================== */
    const narrativa = {
        resumen: `Durante el periodo ${ym}, se realizaron ${visitasCount} visitas técnicas, con una duración promedio de ${Math.round(avgMs / 60000)} minutos por visita. Se registraron ${equipos.length} equipos, ${ticketsDetalle.length} tickets y ${mantencionesCount} mantenciones remotas asociadas a la empresa. El CRM registra ${solicitantesCRM.length} solicitantes activos.`,
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
                usuariosActivos: Object.keys(usuariosMap).length,
            },
            mantenciones: {
                total: mantencionesCount,
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
            topUsuarios, // ranking por tickets Freshdesk
            usuariosListado, // 🔥 todos los solicitantes CRM + ticket count
        },
        usuariosCRM: usuariosCRMListado, // 🔥 listado puro del CRM
        mantenciones: {
            detalle: mantencionesDetalle,
            total: mantencionesCount,
            porStatus: mantencionesPorStatus,
        },
        narrativa,
    };
}
//# sourceMappingURL=reportEmpresa.service.js.map