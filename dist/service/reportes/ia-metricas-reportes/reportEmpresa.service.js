// src/service/ia-metricas-reportes/reportEmpresa.service.ts
import { prisma } from "../../../lib/prisma.js";
import { contarMantenimientos, contarExtras, contarTiposVisita, obtenerTopUsuariosGeneral } from "./reportes.metrics.js";
/* ======================================================
   📅 YYYY-MM -> rango [start, end)
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
   ⏱️ Formatear duración
====================================================== */
function calcularDuracionMinutos(inicio, fin) {
    if (!inicio || !fin)
        return 0;
    const start = new Date(inicio).getTime();
    const end = new Date(fin).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end))
        return 0;
    const diffMs = end - start;
    if (diffMs <= 0)
        return 0;
    return Math.round(diffMs / 1000 / 60);
}
function formatMinutosAHoras(minutos) {
    const total = Math.max(0, Math.round(Number(minutos) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0)
        return `${m} min`;
    if (m === 0)
        return `${h} h`;
    return `${h} h ${m} min`;
}
function obtenerFechaLocalChile(fecha) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(fecha));
}
function calcularTotalMinutosPorJornada(visitas) {
    const jornadas = new Map();
    for (const visita of visitas) {
        if (!visita.inicio || !visita.fin)
            continue;
        const inicioMs = new Date(visita.inicio).getTime();
        const finMs = new Date(visita.fin).getTime();
        if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs))
            continue;
        if (finMs <= inicioMs)
            continue;
        const fecha = obtenerFechaLocalChile(visita.inicio);
        const tecnico = visita.tecnico?.nombre?.trim() || "SIN_TECNICO";
        const key = `${fecha}__${tecnico}`;
        const actual = jornadas.get(key);
        if (!actual) {
            jornadas.set(key, {
                inicioMin: inicioMs,
                finMax: finMs,
            });
            continue;
        }
        actual.inicioMin = Math.min(actual.inicioMin, inicioMs);
        actual.finMax = Math.max(actual.finMax, finMs);
    }
    let total = 0;
    for (const jornada of jornadas.values()) {
        const minutos = Math.round((jornada.finMax - jornada.inicioMin) / 1000 / 60);
        if (minutos > 0) {
            total += minutos;
        }
    }
    return total;
}
/* ======================================================
   📊 SERVICE – REPORTE EMPRESA
====================================================== */
export async function buildReporteEmpresaData(empresaId, ym) {
    /* =====================
       Empresa
    ===================== */
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true, nombre: true }
    });
    if (!empresa)
        throw new Error("Empresa no encontrada");
    const { start, end } = monthRange(ym);
    /* =====================
   LICENCIAS MICROSOFT
===================== */
    const licenciasAsignadas = await prisma.solicitanteMsLicense.findMany({
        where: {
            solicitante: {
                empresaId,
                isActive: true,
                deletedAt: null,
            },
        },
        include: {
            sku: {
                select: {
                    skuId: true,
                    skuPartNumber: true,
                    displayName: true,
                },
            },
            solicitante: {
                select: {
                    id_solicitante: true,
                    nombre: true,
                    email: true,
                    empresaId: true,
                },
            },
        },
        orderBy: {
            assignedAt: "desc",
        },
    });
    // Evita duplicados exactos del mismo usuario con la misma licencia.
    // Ejemplo: mismo solicitante + mismo SKU repetido por sincronización.
    const licenciasUnicasPorUsuarioSkuMap = new Map();
    for (const licencia of licenciasAsignadas) {
        const solicitanteId = licencia.solicitante.id_solicitante;
        const skuId = licencia.skuId;
        const key = `${solicitanteId}__${skuId}`;
        if (licenciasUnicasPorUsuarioSkuMap.has(key)) {
            continue;
        }
        licenciasUnicasPorUsuarioSkuMap.set(key, {
            solicitanteId,
            nombre: licencia.solicitante.nombre,
            email: licencia.solicitante.email,
            skuId,
            skuPartNumber: licencia.sku?.skuPartNumber ?? skuId,
            displayName: licencia.sku?.displayName ??
                licencia.sku?.skuPartNumber ??
                skuId,
            assignedAt: licencia.assignedAt,
        });
    }
    const licenciasUnicasPorUsuarioSku = Array.from(licenciasUnicasPorUsuarioSkuMap.values());
    // Usuarios únicos con al menos una licencia.
    const usuariosUnicosConLicenciaMap = new Map();
    for (const licencia of licenciasUnicasPorUsuarioSku) {
        if (!usuariosUnicosConLicenciaMap.has(licencia.solicitanteId)) {
            usuariosUnicosConLicenciaMap.set(licencia.solicitanteId, licencia);
        }
    }
    const usuariosConLicencias = Array.from(usuariosUnicosConLicenciaMap.values()).sort((a, b) => String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es"));
    // Total ejecutivo: una licencia usada por usuario único.
    const totalUsuariosConLicencia = usuariosConLicencias.length;
    const totalLicenciasUsuario = totalUsuariosConLicencia;
    // Por tipo: cuenta usuarios únicos por SKU, no filas duplicadas.
    const licenciasPorTipoMap = new Map();
    for (const licencia of licenciasUnicasPorUsuarioSku) {
        const current = licenciasPorTipoMap.get(licencia.skuId);
        if (current) {
            current.usuariosUnicos.add(licencia.solicitanteId);
            current.cantidad = current.usuariosUnicos.size;
        }
        else {
            licenciasPorTipoMap.set(licencia.skuId, {
                skuId: licencia.skuId,
                skuPartNumber: licencia.skuPartNumber,
                displayName: licencia.displayName,
                cantidad: 1,
                usuariosUnicos: new Set([licencia.solicitanteId]),
            });
        }
    }
    const licenciasPorTipo = Array.from(licenciasPorTipoMap.values())
        .map(({ usuariosUnicos, ...item }) => item)
        .sort((a, b) => b.cantidad - a.cantidad);
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
    const visitasDetalle = visitas.map((v) => {
        const duracionMinutos = calcularDuracionMinutos(v.inicio, v.fin);
        return {
            ...v,
            duracionMinutos,
            duracionTexto: formatMinutosAHoras(duracionMinutos),
        };
    });
    const duracionesMinutosVisitas = visitasDetalle
        .map((v) => v.duracionMinutos)
        .filter((min) => min > 0);
    // Total real de jornada, no suma por cada solicitante registrado
    const totalMinutos = calcularTotalMinutosPorJornada(visitasDetalle);
    // Promedio se mantiene por visita individual
    const avgMinutos = duracionesMinutosVisitas.length
        ? Math.round(duracionesMinutosVisitas.reduce((a, b) => a + b, 0) /
            duracionesMinutosVisitas.length)
        : 0;
    const totalTiempoTexto = formatMinutosAHoras(totalMinutos);
    const avgTiempoTexto = formatMinutosAHoras(avgMinutos);
    /* =====================
       MÉTRICAS
    ===================== */
    const mantenimientos = contarMantenimientos(visitas);
    const extras = contarExtras(visitas);
    const visitasPorTipo = contarTiposVisita(visitas);
    /* =====================
       VISITAS POR TÉCNICO
    ===================== */
    const visitasPorTecnicoMap = {};
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
            deletedAt: null,
            OR: [
                {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
                {
                    empresaId,
                },
            ],
        },
        select: {
            id_equipo: true,
            serial: true,
            marca: true,
            modelo: true,
            procesador: true,
            ram: true,
            disco: true,
            estado: true,
            solicitante: {
                select: {
                    nombre: true,
                    email: true,
                },
            },
            detalle: {
                select: {
                    so: true,
                },
            },
        },
        orderBy: {
            id_equipo: "asc",
        },
    });
    const inventarioDetalle = equipos.map((equipo, index) => ({
        codigo: index + 1,
        usuario: equipo.solicitante?.nombre ?? "",
        correo: equipo.solicitante?.email ?? "",
        estadoEquipo: equipo.estado ?? "",
        serial: equipo.serial ?? "",
        marca: equipo.marca ?? "",
        modelo: equipo.modelo ?? "",
        cpu: equipo.procesador ?? "",
        ram: equipo.ram ?? "",
        disco: equipo.disco ?? "",
        sistemaOperativo: equipo.detalle?.so ?? "",
    }));
    const inventarioPorMarcaMap = new Map();
    for (const equipo of equipos) {
        const marca = equipo.marca?.trim() || "Sin marca";
        inventarioPorMarcaMap.set(marca, (inventarioPorMarcaMap.get(marca) ?? 0) + 1);
    }
    const inventarioPorMarca = Array.from(inventarioPorMarcaMap.entries())
        .map(([marca, cantidad]) => ({
        marca,
        cantidad,
    }))
        .sort((a, b) => b.cantidad - a.cantidad);
    /* =====================
    TICKETS
 ===================== */
    const orgName = normalizeOrgName(empresa.nombre);
    const org = orgName
        ? await prisma.ticketOrg.findUnique({
            where: { name: orgName },
            select: { id: true },
        })
        : null;
    /**
     * Tickets históricos Freshdesk.
     * Se buscan por varias vías:
     * - ticketOrgId
     * - empresaId directo
     * - solicitante relacionado a la empresa
     */
    const ticketsFreshdeskRaw = await prisma.freshdeskTicket.findMany({
        where: {
            createdAt: { gte: start, lt: end },
            OR: [
                ...(org ? [{ ticketOrgId: org.id }] : []),
                { empresaId },
                {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
            ],
        },
        select: {
            id: true,
            subject: true,
            type: true,
            status: true,
            priority: true,
            createdAt: true,
            empresaId: true,
            solicitanteId: true,
            ticketRequester: {
                select: {
                    name: true,
                    email: true,
                },
            },
            solicitante: {
                select: {
                    nombre: true,
                    email: true,
                    empresaId: true,
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });
    /**
     * Tickets nuevos RIDS.
     * Se buscan por:
     * - empresaId directo
     * - requester/solicitante relacionado a la empresa
     */
    const ticketsRidsRaw = await prisma.ticket.findMany({
        where: {
            deletedAt: null,
            createdAt: { gte: start, lt: end },
            OR: [
                { empresaId },
                {
                    requester: {
                        is: {
                            empresaId,
                        },
                    },
                },
            ],
        },
        select: {
            id: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
            empresaId: true,
            requester: {
                select: {
                    nombre: true,
                    email: true,
                    empresaId: true,
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });
    /**
     * Normalizamos ambos orígenes a una estructura compatible
     * con el resto del reporte.
     */
    const ticketsDetalle = [
        ...ticketsFreshdeskRaw.map((t) => ({
            id: String(t.id),
            origen: "FRESHDESK",
            subject: t.subject,
            type: t.type ?? "Sin tipo",
            status: String(t.status),
            priority: String(t.priority),
            createdAt: t.createdAt,
            empresaId: t.empresaId ?? t.solicitante?.empresaId ?? null,
            ticketRequester: {
                name: t.ticketRequester?.name ??
                    t.solicitante?.nombre ??
                    "Sin nombre",
                email: t.ticketRequester?.email ??
                    t.solicitante?.email ??
                    null,
            },
        })),
        ...ticketsRidsRaw.map((t) => ({
            id: String(t.id),
            origen: "RIDS",
            subject: t.subject,
            type: "Ticket RIDS",
            status: String(t.status),
            priority: String(t.priority),
            createdAt: t.createdAt,
            empresaId: t.empresaId ?? t.requester?.empresaId ?? null,
            ticketRequester: {
                name: t.requester?.nombre ?? "Sin nombre",
                email: t.requester?.email ?? null,
            },
        })),
    ];
    const topUsuariosGeneral = obtenerTopUsuariosGeneral(visitasDetalle, ticketsDetalle);
    /* =====================
       TOP USUARIOS TICKETS
    ===================== */
    const usuarioMap = {};
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
    const mantStatusMap = {};
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
    const mantPorTecnicoMap = {};
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
    const mantPorDiaMap = {};
    for (const m of mantenciones) {
        const fecha = new Date(m.inicio).toISOString().slice(0, 10);
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
    const mantPorSolicitanteMap = {};
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
        resumen: `Durante el periodo ${ym}, se realizaron ${visitasCount} visitas técnicas con una duración promedio de ${avgTiempoTexto} por intervención.`,
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
                totalMinutos,
                avgMinutos,
                totalTiempoTexto,
                avgTiempoTexto,
            },
            equipos: {
                count: equipos.length
            },
            tickets: {
                total: ticketsDetalle.length
            },
            mantenciones: {
                total: mantenciones.length
            },
            licencias: {
                total: totalLicenciasUsuario,
                totalUsuariosConLicencia,
            },
        },
        visitas: {
            total: visitasCount,
            totalMinutos,
            avgMinutos,
            totalTiempoTexto,
            avgTiempoTexto,
            detalle: visitasDetalle,
            porTipo: visitasPorTipo,
            porTecnico: visitasPorTecnico,
        },
        mantenimientos,
        extras,
        inventario: {
            total: equipos.length,
            porMarca: inventarioPorMarca,
            detalle: inventarioDetalle,
            // Opcional: compatibilidad si otra parte del código aún usa inventario.equipos
            equipos: inventarioDetalle,
        },
        tickets: {
            detalle: ticketsDetalle,
            total: ticketsDetalle.length,
            topUsuarios,
            topUsuariosGeneral
        },
        licencias: {
            total: totalLicenciasUsuario,
            totalUsuariosConLicencia,
            porTipo: licenciasPorTipo,
            usuarios: usuariosConLicencias,
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
//# sourceMappingURL=reportEmpresa.service.js.map