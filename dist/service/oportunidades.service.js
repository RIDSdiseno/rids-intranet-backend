// src/service/oportunidades.service.ts
import { Prisma, EtapaOportunidadVenta, PrioridadOportunidadVenta, MonedaGestioo, EstadoDesarrolloPropuesta, TipoServicioOportunidad, RiesgoTecnicoOportunidad, } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
/* ======================================================
   ⚠️  Errores de negocio
====================================================== */
export class OportunidadNoEncontradaError extends Error {
    constructor(message = "Oportunidad de venta no encontrada.") {
        super(message);
        this.name = "OportunidadNoEncontradaError";
    }
}
export class EtapaOportunidadInvalidaError extends Error {
    constructor(message = "La etapa indicada no es válida.") {
        super(message);
        this.name = "EtapaOportunidadInvalidaError";
    }
}
export class CierreOportunidadInvalidoError extends Error {
    constructor(message = "Los datos de cierre de la oportunidad no son válidos.") {
        super(message);
        this.name = "CierreOportunidadInvalidoError";
    }
}
export class ResponsableOportunidadInvalidoError extends Error {
    constructor(message = "El responsable comercial indicado no es válido.") {
        super(message);
        this.name = "ResponsableOportunidadInvalidoError";
    }
}
export class EntidadOportunidadInvalidaError extends Error {
    constructor(message = "La entidad/cliente indicado no es válido.") {
        super(message);
        this.name = "EntidadOportunidadInvalidaError";
    }
}
export class OrdenOportunidadInvalidoError extends Error {
    constructor(message = "El valor de orden indicado no es válido.") {
        super(message);
        this.name = "OrdenOportunidadInvalidoError";
    }
}
export class CotizacionOportunidadRequeridaError extends Error {
    constructor(message = "Debe preparar y enviar una cotización antes de avanzar a negociación.") {
        super(message);
        this.name = "CotizacionOportunidadRequeridaError";
    }
}
export class CotizacionYaVinculadaError extends Error {
    constructor(message = "La cotización ya está vinculada a otra oportunidad.") {
        super(message);
        this.name = "CotizacionYaVinculadaError";
    }
}
export class CotizacionNoEncontradaError extends Error {
    constructor(message = "Cotización no encontrada.") {
        super(message);
        this.name = "CotizacionNoEncontradaError";
    }
}
export class CotizacionNoVinculadaError extends Error {
    constructor(message = "La cotización indicada no está vinculada a esta oportunidad.") {
        super(message);
        this.name = "CotizacionNoVinculadaError";
    }
}
export class DesvinculacionCotizacionInvalidaError extends Error {
    constructor(message = "No se puede desvincular la cotización sin dejar la oportunidad en un estado inválido.") {
        super(message);
        this.name = "DesvinculacionCotizacionInvalidaError";
    }
}
/* =========================================================
   Reglas de negocio — etapas y cotizaciones
========================================================= */
// Etapas en las que la oportunidad puede existir sin ninguna cotización vinculada.
const ETAPAS_SIN_COTIZACION_REQUERIDA = new Set([
    EtapaOportunidadVenta.NUEVA,
    EtapaOportunidadVenta.COTIZACION_PREPARACION,
]);
// Etapas destino que exigen al menos una cotización VINCULADA (en cualquier estado).
// No se exige que esté "Aprobada": la intranet de RIDS no tiene ninguna acción para
// cambiar el estado de una cotización a Aprobada, así que exigirlo bloqueaba el avance
// sin darle al usuario forma de resolverlo. El seguimiento de reenvíos/negociación se
// registra en el Funnel mismo (Seguimientos, campos de etapa), no en el estado de la cotización.
const ETAPAS_QUE_REQUIEREN_COTIZACION_VINCULADA = new Set([
    EtapaOportunidadVenta.COTIZACION_ENVIADA,
    EtapaOportunidadVenta.NEGOCIACION,
    EtapaOportunidadVenta.GANADA,
]);
/* =========================================================
   Generación de código correlativo (OP-YYYY-NNNNNN)
   No existía un generador correlativo previo en el proyecto.
   Estrategia: buscar el máximo código del año actual y sumar 1,
   con reintento ante conflicto de unicidad (condición de carrera).
========================================================= */
async function generarCodigoOportunidad(tx) {
    const year = new Date().getFullYear();
    const prefix = `OP-${year}-`;
    const ultimo = await tx.oportunidadVenta.findFirst({
        where: { codigo: { startsWith: prefix } },
        orderBy: { codigo: "desc" },
        select: { codigo: true },
    });
    let siguiente = 1;
    if (ultimo?.codigo) {
        const parsed = Number(ultimo.codigo.slice(prefix.length));
        if (Number.isFinite(parsed))
            siguiente = parsed + 1;
    }
    return `${prefix}${String(siguiente).padStart(6, "0")}`;
}
function isUniqueConstraintError(err) {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
/* =========================================================
   Validación de cotización vinculada según etapa destino
========================================================= */
async function validarCotizacionParaEtapa(tx, oportunidadId, etapaDestino) {
    if (!ETAPAS_QUE_REQUIEREN_COTIZACION_VINCULADA.has(etapaDestino))
        return;
    const cantidad = await tx.cotizacionGestioo.count({
        where: { oportunidadVentaId: oportunidadId },
    });
    if (cantidad === 0) {
        throw new CotizacionOportunidadRequeridaError();
    }
}
/* =========================================================
   Reordenamiento: recalcula órdenes enteros consecutivos
   dentro de una etapa/columna.
========================================================= */
async function recalcularOrdenColumna(tx, etapa, idMovida, posicionDestino) {
    const hermanas = await tx.oportunidadVenta.findMany({
        where: { etapa, activo: true, id: { not: idMovida } },
        orderBy: { orden: "asc" },
        select: { id: true, orden: true },
    });
    const posicion = Math.max(0, Math.min(posicionDestino, hermanas.length));
    const listaFinal = [...hermanas];
    listaFinal.splice(posicion, 0, { id: idMovida, orden: -1 });
    for (let i = 0; i < listaFinal.length; i++) {
        const item = listaFinal[i];
        if (item && item.orden !== i) {
            await tx.oportunidadVenta.update({ where: { id: item.id }, data: { orden: i } });
        }
    }
}
async function siguienteOrdenEtapa(tx, etapa) {
    const max = await tx.oportunidadVenta.aggregate({
        where: { etapa, activo: true },
        _max: { orden: true },
    });
    return (max._max.orden ?? -1) + 1;
}
/* =========================================================
   Crear oportunidad
========================================================= */
export async function crearOportunidad(actorId, payload) {
    const responsableId = payload.responsableId ?? actorId;
    const responsable = await prisma.tecnico.findUnique({
        where: { id_tecnico: responsableId },
        select: { id_tecnico: true, status: true },
    });
    if (!responsable)
        throw new ResponsableOportunidadInvalidoError();
    if (!responsable.status) {
        throw new ResponsableOportunidadInvalidoError("El responsable comercial indicado está inactivo.");
    }
    if (payload.entidadId) {
        const entidad = await prisma.entidadGestioo.findUnique({
            where: { id: payload.entidadId },
            select: { id: true },
        });
        if (!entidad)
            throw new EntidadOportunidadInvalidaError();
    }
    const MAX_INTENTOS = 5;
    let intento = 0;
    while (true) {
        intento++;
        try {
            return await prisma.$transaction(async (tx) => {
                const codigo = await generarCodigoOportunidad(tx);
                const orden = await siguienteOrdenEtapa(tx, EtapaOportunidadVenta.NUEVA);
                const oportunidad = await tx.oportunidadVenta.create({
                    data: {
                        codigo,
                        titulo: payload.titulo,
                        entidadId: payload.entidadId ?? null,
                        proyecto: payload.proyecto ?? null,
                        contactoNombre: payload.contactoNombre ?? null,
                        contactoEmail: payload.contactoEmail || null,
                        contactoTelefono: payload.contactoTelefono ?? null,
                        responsableId,
                        ...(payload.prioridad !== undefined && { prioridad: payload.prioridad }),
                        montoEstimado: payload.montoEstimado ?? null,
                        ...(payload.moneda !== undefined && { moneda: payload.moneda }),
                        probabilidadCierre: payload.probabilidadCierre ?? null,
                        fechaProbableCierre: payload.fechaProbableCierre ?? null,
                        proximaAccion: payload.proximaAccion ?? null,
                        fechaProximaAccion: payload.fechaProximaAccion ?? null,
                        observaciones: payload.observaciones ?? null,
                        ...(payload.estadoDesarrolloPropuesta !== undefined && {
                            estadoDesarrolloPropuesta: payload.estadoDesarrolloPropuesta,
                        }),
                        ...(payload.tipoServicio !== undefined && { tipoServicio: payload.tipoServicio }),
                        tipoServicioOtro: payload.tipoServicioOtro ?? null,
                        informacionPendiente: payload.informacionPendiente ?? null,
                        ...(payload.riesgoTecnico !== undefined && { riesgoTecnico: payload.riesgoTecnico }),
                        condicionesEspeciales: payload.condicionesEspeciales ?? null,
                        fechaComprometidaEnvio: payload.fechaComprometidaEnvio ?? null,
                        comentariosInternos: payload.comentariosInternos ?? null,
                        montoPropuesto: payload.montoPropuesto ?? null,
                        fechaEnvioPropuesta: payload.fechaEnvioPropuesta ?? null,
                        fechaVencimientoPropuesta: payload.fechaVencimientoPropuesta ?? null,
                        comentariosCliente: payload.comentariosCliente ?? null,
                        objeciones: payload.objeciones ?? null,
                        versionPropuesta: payload.versionPropuesta ?? null,
                        contrapropuestas: payload.contrapropuestas ?? null,
                        ajustesSolicitados: payload.ajustesSolicitados ?? null,
                        orden,
                    },
                });
                await tx.historialEtapaOportunidadVenta.create({
                    data: {
                        oportunidadId: oportunidad.id,
                        etapaAnterior: null,
                        etapaNueva: EtapaOportunidadVenta.NUEVA,
                        actorId,
                    },
                });
                return oportunidad;
            });
        }
        catch (err) {
            if (isUniqueConstraintError(err) && intento < MAX_INTENTOS)
                continue;
            throw err;
        }
    }
}
/* =========================================================
   Listado paginado (filtros básicos)
========================================================= */
export async function listarOportunidades(filtros) {
    const where = { activo: true };
    if (filtros.etapa)
        where.etapa = filtros.etapa;
    if (filtros.responsableId)
        where.responsableId = filtros.responsableId;
    if (filtros.entidadId)
        where.entidadId = filtros.entidadId;
    if (filtros.prioridad)
        where.prioridad = filtros.prioridad;
    if (filtros.texto) {
        where.OR = [
            { titulo: { contains: filtros.texto, mode: "insensitive" } },
            { proyecto: { contains: filtros.texto, mode: "insensitive" } },
            { contactoNombre: { contains: filtros.texto, mode: "insensitive" } },
            { codigo: { contains: filtros.texto, mode: "insensitive" } },
        ];
    }
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? 20;
    const [total, data] = await Promise.all([
        prisma.oportunidadVenta.count({ where }),
        prisma.oportunidadVenta.findMany({
            where,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
            include: {
                entidad: { select: { id: true, nombre: true } },
                responsable: { select: { id_tecnico: true, nombre: true, email: true } },
                _count: { select: { cotizaciones: true } },
            },
        }),
    ]);
    return {
        data,
        meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
}
/* =========================================================
   Listado del tablero Kanban (funnel) — datos livianos
========================================================= */
export async function obtenerFunnel() {
    const oportunidades = await prisma.oportunidadVenta.findMany({
        where: { activo: true },
        orderBy: [{ etapa: "asc" }, { orden: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            codigo: true,
            titulo: true,
            etapa: true,
            prioridad: true,
            montoEstimado: true,
            moneda: true,
            orden: true,
            proyecto: true,
            proximaAccion: true,
            fechaProximaAccion: true,
            fechaProbableCierre: true,
            fechaCierre: true,
            fechaUltimoContacto: true,
            entidad: { select: { id: true, nombre: true } },
            responsable: { select: { id_tecnico: true, nombre: true } },
            cotizaciones: {
                select: { id: true, estado: true, createdAt: true },
                orderBy: { createdAt: "desc" },
            },
        },
    });
    return oportunidades.map(({ cotizaciones, ...resto }) => ({
        ...resto,
        cantidadCotizaciones: cotizaciones.length,
        cotizacionPrincipal: cotizaciones[0]
            ? { id: cotizaciones[0].id, estado: cotizaciones[0].estado }
            : null,
    }));
}
/* =========================================================
   Dashboard del funnel — KPIs, ranking, forecast, riesgo comercial.
   Inspirado en el dashboard de Beck, adaptado a lo que existe en RIDS
   (sin unidadNegocio/tipoCliente; se usa tipoServicio y el origen de la
   entidad en su lugar). Todo se calcula en memoria sobre un findMany
   filtrado (volumen de RIDS es bajo, no justifica agregación en SQL).
========================================================= */
const ETAPAS_ACTIVAS = new Set([
    EtapaOportunidadVenta.NUEVA,
    EtapaOportunidadVenta.COTIZACION_PREPARACION,
    EtapaOportunidadVenta.COTIZACION_ENVIADA,
    EtapaOportunidadVenta.NEGOCIACION,
]);
const ETAPAS_FUNNEL_CONVERSION = [
    EtapaOportunidadVenta.NUEVA,
    EtapaOportunidadVenta.COTIZACION_PREPARACION,
    EtapaOportunidadVenta.COTIZACION_ENVIADA,
    EtapaOportunidadVenta.NEGOCIACION,
    EtapaOportunidadVenta.GANADA,
];
function numero(valor) {
    if (valor == null)
        return 0;
    return typeof valor === "number" ? valor : Number(valor);
}
function inicioDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
}
function finDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(23, 59, 59, 999);
    return d;
}
export async function obtenerDashboardFunnel(filtros) {
    const where = { activo: true };
    if (filtros.responsableId)
        where.responsableId = filtros.responsableId;
    if (filtros.etapa)
        where.etapa = filtros.etapa;
    if (filtros.tipoServicio)
        where.tipoServicio = filtros.tipoServicio;
    if (filtros.entidadId)
        where.entidadId = filtros.entidadId;
    if (filtros.origen)
        where.entidad = { origen: filtros.origen };
    if (filtros.texto) {
        where.OR = [
            { titulo: { contains: filtros.texto, mode: "insensitive" } },
            { proyecto: { contains: filtros.texto, mode: "insensitive" } },
            { codigo: { contains: filtros.texto, mode: "insensitive" } },
        ];
    }
    if (filtros.fechaDesde || filtros.fechaHasta) {
        const campo = filtros.tipoFecha === "cierre"
            ? "fechaCierre"
            : filtros.tipoFecha === "probableCierre"
                ? "fechaProbableCierre"
                : "createdAt";
        where[campo] = {
            ...(filtros.fechaDesde && { gte: inicioDeDia(filtros.fechaDesde) }),
            ...(filtros.fechaHasta && { lte: finDeDia(filtros.fechaHasta) }),
        };
    }
    const oportunidades = await prisma.oportunidadVenta.findMany({
        where,
        select: {
            id: true,
            codigo: true,
            titulo: true,
            etapa: true,
            montoEstimado: true,
            montoFinal: true,
            probabilidadCierre: true,
            fechaProbableCierre: true,
            proximaAccion: true,
            fechaProximaAccion: true,
            fechaCierre: true,
            fechaUltimoContacto: true,
            motivoPerdida: true,
            motivoPostergacion: true,
            tipoServicio: true,
            updatedAt: true,
            createdAt: true,
            responsableId: true,
            responsable: { select: { id_tecnico: true, nombre: true } },
            entidad: { select: { id: true, nombre: true } },
        },
    });
    const diasSinSeguimiento = Math.max(1, filtros.diasSinSeguimiento ?? 7);
    const limiteSinSeguimiento = new Date();
    limiteSinSeguimiento.setDate(limiteSinSeguimiento.getDate() - diasSinSeguimiento);
    const hoy = new Date();
    const inicioHoy = inicioDeDia(hoy);
    const finHoy = finDeDia(hoy);
    const manana = new Date(inicioHoy);
    manana.setDate(manana.getDate() + 1);
    const activas = oportunidades.filter((o) => ETAPAS_ACTIVAS.has(o.etapa));
    const ganadas = oportunidades.filter((o) => o.etapa === "GANADA");
    const perdidas = oportunidades.filter((o) => o.etapa === "PERDIDA");
    const postergadas = oportunidades.filter((o) => o.etapa === "POSTERGADA");
    const pipelineTotal = activas.reduce((acc, o) => acc + numero(o.montoEstimado), 0);
    const montoGanado = ganadas.reduce((acc, o) => acc + numero(o.montoFinal ?? o.montoEstimado), 0);
    const montoPerdido = perdidas.reduce((acc, o) => acc + numero(o.montoEstimado), 0);
    const tasaCierre = ganadas.length + perdidas.length > 0
        ? Math.round((ganadas.length / (ganadas.length + perdidas.length)) * 10000) / 100
        : 0;
    const sinSeguimientoActivas = activas.filter((o) => o.updatedAt < limiteSinSeguimiento);
    const accionesVencidasActivas = activas.filter((o) => o.fechaProximaAccion != null && o.fechaProximaAccion < inicioHoy);
    const proximasAcciones = {
        vencidas: accionesVencidasActivas.length,
        hoy: activas.filter((o) => o.fechaProximaAccion != null && o.fechaProximaAccion >= inicioHoy && o.fechaProximaAccion <= finHoy).length,
        proximos7: activas.filter((o) => {
            if (!o.fechaProximaAccion)
                return false;
            const limite7 = new Date(inicioHoy);
            limite7.setDate(limite7.getDate() + 7);
            return o.fechaProximaAccion >= manana && o.fechaProximaAccion <= finDeDia(limite7);
        }).length,
    };
    // Reactivaciones reales: oportunidades que en algún momento salieron de
    // Perdida/Postergada hacia una etapa activa (no un flag manual como en Beck).
    const idsFiltrados = oportunidades.map((o) => o.id);
    const clientesReactivados = idsFiltrados.length > 0
        ? await prisma.historialEtapaOportunidadVenta.count({
            where: {
                oportunidadId: { in: idsFiltrados },
                etapaAnterior: { in: ["PERDIDA", "POSTERGADA"] },
                etapaNueva: { notIn: ["PERDIDA", "POSTERGADA"] },
            },
        })
        : 0;
    const porEtapaMap = new Map();
    for (const o of oportunidades) {
        const actual = porEtapaMap.get(o.etapa) ?? { cantidad: 0, monto: 0 };
        actual.cantidad += 1;
        actual.monto += numero(o.montoEstimado);
        porEtapaMap.set(o.etapa, actual);
    }
    const porEtapa = Array.from(porEtapaMap.entries()).map(([etapa, valores]) => ({ etapa, ...valores }));
    const rankingMap = new Map();
    for (const o of oportunidades) {
        const actual = rankingMap.get(o.responsableId) ?? {
            responsableId: o.responsableId,
            responsable: o.responsable?.nombre ?? "Sin asignar",
            total: 0,
            activas: 0,
            ganadas: 0,
            perdidas: 0,
            postergadas: 0,
            montoTotal: 0,
            montoGanado: 0,
        };
        actual.total += 1;
        if (ETAPAS_ACTIVAS.has(o.etapa))
            actual.activas += 1;
        if (o.etapa === "GANADA") {
            actual.ganadas += 1;
            actual.montoGanado += numero(o.montoFinal ?? o.montoEstimado);
        }
        if (o.etapa === "PERDIDA")
            actual.perdidas += 1;
        if (o.etapa === "POSTERGADA")
            actual.postergadas += 1;
        actual.montoTotal += numero(o.montoEstimado);
        rankingMap.set(o.responsableId, actual);
    }
    const rankingResponsables = Array.from(rankingMap.values()).sort((a, b) => b.montoTotal - a.montoTotal);
    const sinSeguimiento = {
        cantidad: sinSeguimientoActivas.length,
        items: [...sinSeguimientoActivas]
            .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
            .slice(0, 20)
            .map((o) => ({
            id: o.id,
            codigo: o.codigo,
            titulo: o.titulo,
            proyecto: null,
            entidad: o.entidad?.nombre ?? null,
            responsable: o.responsable?.nombre ?? null,
            etapa: o.etapa,
            ultimaActividad: o.updatedAt,
            proximaAccion: o.proximaAccion,
            valor: numero(o.montoEstimado),
        })),
    };
    // ---- Análisis avanzado (sobre activas, igual que "Pipeline avanzado" de Beck) ----
    function agruparPorMonto(items, clave) {
        const mapa = new Map();
        for (const o of items) {
            const k = clave(o);
            const actual = mapa.get(k) ?? { cantidad: 0, monto: 0 };
            actual.cantidad += 1;
            actual.monto += numero(o.montoEstimado);
            mapa.set(k, actual);
        }
        return mapa;
    }
    const porTipoServicioMap = agruparPorMonto(activas, (o) => o.tipoServicio ?? "SIN_ESPECIFICAR");
    const porTipoServicio = Array.from(porTipoServicioMap.entries()).map(([tipoServicio, v]) => ({
        tipoServicio,
        ...v,
    }));
    const porClienteMap = agruparPorMonto(activas, (o) => o.entidad?.nombre ?? "Sin cliente");
    const topClientes = Array.from(porClienteMap.entries())
        .map(([cliente, v]) => ({ cliente, ...v }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 10);
    function calcularForecast(dias) {
        const limite = finDeDia(new Date(inicioHoy.getTime() + dias * 24 * 60 * 60 * 1000));
        const enRango = activas.filter((o) => o.fechaProbableCierre != null && o.fechaProbableCierre >= inicioHoy && o.fechaProbableCierre <= limite);
        const montoTotal = enRango.reduce((acc, o) => acc + numero(o.montoEstimado), 0);
        const montoPonderado = enRango.reduce((acc, o) => acc + numero(o.montoEstimado) * ((o.probabilidadCierre ?? 50) / 100), 0);
        return { cantidad: enRango.length, montoTotal, montoPonderado: Math.round(montoPonderado) };
    }
    const forecast = { d30: calcularForecast(30), d60: calcularForecast(60), d90: calcularForecast(90) };
    function agruparMotivos(items, extractor) {
        const mapa = new Map();
        for (const o of items) {
            const motivo = extractor(o)?.trim() || "SIN_MOTIVO";
            mapa.set(motivo, (mapa.get(motivo) ?? 0) + 1);
        }
        return Array.from(mapa.entries())
            .map(([motivo, cantidad]) => ({ motivo, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }
    const motivos = {
        perdida: agruparMotivos(perdidas, (o) => o.motivoPerdida),
        postergacion: agruparMotivos(postergadas, (o) => o.motivoPostergacion),
    };
    const sinProximaAccionActivas = activas.filter((o) => !o.proximaAccion?.trim() || !o.fechaProximaAccion);
    const riesgo = {
        detenidas: sinSeguimiento,
        sinProximaAccion: {
            cantidad: sinProximaAccionActivas.length,
            items: [...sinProximaAccionActivas]
                .sort((a, b) => numero(b.montoEstimado) - numero(a.montoEstimado))
                .slice(0, 10)
                .map((o) => ({
                id: o.id,
                codigo: o.codigo,
                titulo: o.titulo,
                entidad: o.entidad?.nombre ?? null,
                responsable: o.responsable?.nombre ?? null,
                etapa: o.etapa,
                valor: numero(o.montoEstimado),
            })),
        },
    };
    // Conversión acumulada por etapa (asume que cada oportunidad refleja su
    // etapa más avanzada alcanzada; PERDIDA/POSTERGADA quedan fuera de la
    // cadena de conversión, igual que en Beck).
    const cantidadPorEtapaFunnel = ETAPAS_FUNNEL_CONVERSION.map((etapa) => porEtapaMap.get(etapa)?.cantidad ?? 0);
    const totalFunnel = cantidadPorEtapaFunnel.reduce((a, b) => a + b, 0);
    const conversionPorEtapa = ETAPAS_FUNNEL_CONVERSION.map((etapa, i) => {
        const cantidadDesde = cantidadPorEtapaFunnel.slice(i).reduce((a, b) => a + b, 0);
        const cantidadHasta = cantidadPorEtapaFunnel.slice(i + 1).reduce((a, b) => a + b, 0);
        const cantidad = cantidadPorEtapaFunnel[i] ?? 0;
        return {
            etapa,
            cantidad,
            porcentajeDelTotal: totalFunnel > 0 ? Math.round((cantidad / totalFunnel) * 10000) / 100 : 0,
            tasaConversionSiguiente: cantidadDesde > 0 ? Math.round((cantidadHasta / cantidadDesde) * 10000) / 100 : 0,
        };
    });
    return {
        kpis: {
            total: oportunidades.length,
            activas: activas.length,
            ganadas: ganadas.length,
            perdidas: perdidas.length,
            postergadas: postergadas.length,
            pipelineTotal,
            montoGanado,
            montoPerdido,
            tasaCierre,
            clientesReactivados,
            sinSeguimiento: sinSeguimientoActivas.length,
            accionesVencidas: accionesVencidasActivas.length,
        },
        proximasAcciones,
        porEtapa,
        rankingResponsables,
        sinSeguimiento,
        avanzado: {
            porTipoServicio,
            topClientes,
            forecast,
            motivos,
            riesgo,
            conversionPorEtapa,
        },
    };
}
/* =========================================================
   Detalle completo
========================================================= */
export async function obtenerOportunidadPorId(id) {
    const oportunidad = await prisma.oportunidadVenta.findUnique({
        where: { id },
        include: {
            entidad: true,
            responsable: { select: { id_tecnico: true, nombre: true, email: true, rol: true } },
            seguimientos: {
                orderBy: { createdAt: "desc" },
                include: { autor: { select: { id_tecnico: true, nombre: true } } },
            },
            historialEtapas: {
                orderBy: { createdAt: "desc" },
                include: { actor: { select: { id_tecnico: true, nombre: true } } },
            },
            cotizaciones: {
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    estado: true,
                    total: true,
                    moneda: true,
                    createdAt: true,
                    entidad: { select: { id: true, nombre: true } },
                },
            },
        },
    });
    if (!oportunidad)
        throw new OportunidadNoEncontradaError();
    const auditoria = await prisma.auditLog.findMany({
        where: { entity: "OportunidadVenta", entityId: String(id) },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    return { ...oportunidad, auditoria };
}
async function obtenerOportunidadActivaOrThrow(tx, id) {
    const oportunidad = await tx.oportunidadVenta.findFirst({ where: { id, activo: true } });
    if (!oportunidad)
        throw new OportunidadNoEncontradaError();
    return oportunidad;
}
/* =========================================================
   Editar oportunidad (campos generales, no etapa/orden/cierre)
========================================================= */
export async function editarOportunidad(id, payload) {
    return prisma.$transaction(async (tx) => {
        await obtenerOportunidadActivaOrThrow(tx, id);
        if (payload.responsableId !== undefined) {
            const responsable = await tx.tecnico.findUnique({
                where: { id_tecnico: payload.responsableId },
                select: { id_tecnico: true, status: true },
            });
            if (!responsable)
                throw new ResponsableOportunidadInvalidoError();
            if (!responsable.status) {
                throw new ResponsableOportunidadInvalidoError("El responsable comercial indicado está inactivo.");
            }
        }
        if (payload.entidadId) {
            const entidad = await tx.entidadGestioo.findUnique({
                where: { id: payload.entidadId },
                select: { id: true },
            });
            if (!entidad)
                throw new EntidadOportunidadInvalidaError();
        }
        return tx.oportunidadVenta.update({
            where: { id },
            data: {
                ...(payload.titulo !== undefined && { titulo: payload.titulo }),
                ...(payload.responsableId !== undefined && { responsableId: payload.responsableId }),
                ...(payload.entidadId !== undefined && { entidadId: payload.entidadId }),
                ...(payload.proyecto !== undefined && { proyecto: payload.proyecto }),
                ...(payload.contactoNombre !== undefined && { contactoNombre: payload.contactoNombre }),
                ...(payload.contactoEmail !== undefined && { contactoEmail: payload.contactoEmail || null }),
                ...(payload.contactoTelefono !== undefined && { contactoTelefono: payload.contactoTelefono }),
                ...(payload.prioridad !== undefined && { prioridad: payload.prioridad }),
                ...(payload.montoEstimado !== undefined && { montoEstimado: payload.montoEstimado }),
                ...(payload.moneda !== undefined && { moneda: payload.moneda }),
                ...(payload.probabilidadCierre !== undefined && { probabilidadCierre: payload.probabilidadCierre }),
                ...(payload.fechaProbableCierre !== undefined && { fechaProbableCierre: payload.fechaProbableCierre }),
                ...(payload.proximaAccion !== undefined && { proximaAccion: payload.proximaAccion }),
                ...(payload.fechaProximaAccion !== undefined && { fechaProximaAccion: payload.fechaProximaAccion }),
                ...(payload.fechaUltimoContacto !== undefined && { fechaUltimoContacto: payload.fechaUltimoContacto }),
                ...(payload.observaciones !== undefined && { observaciones: payload.observaciones }),
                ...(payload.estadoDesarrolloPropuesta !== undefined && {
                    estadoDesarrolloPropuesta: payload.estadoDesarrolloPropuesta,
                }),
                ...(payload.tipoServicio !== undefined && { tipoServicio: payload.tipoServicio }),
                ...(payload.tipoServicioOtro !== undefined && { tipoServicioOtro: payload.tipoServicioOtro }),
                ...(payload.informacionPendiente !== undefined && { informacionPendiente: payload.informacionPendiente }),
                ...(payload.riesgoTecnico !== undefined && { riesgoTecnico: payload.riesgoTecnico }),
                ...(payload.condicionesEspeciales !== undefined && { condicionesEspeciales: payload.condicionesEspeciales }),
                ...(payload.fechaComprometidaEnvio !== undefined && {
                    fechaComprometidaEnvio: payload.fechaComprometidaEnvio,
                }),
                ...(payload.comentariosInternos !== undefined && { comentariosInternos: payload.comentariosInternos }),
                ...(payload.montoPropuesto !== undefined && { montoPropuesto: payload.montoPropuesto }),
                ...(payload.fechaEnvioPropuesta !== undefined && { fechaEnvioPropuesta: payload.fechaEnvioPropuesta }),
                ...(payload.fechaVencimientoPropuesta !== undefined && {
                    fechaVencimientoPropuesta: payload.fechaVencimientoPropuesta,
                }),
                ...(payload.comentariosCliente !== undefined && { comentariosCliente: payload.comentariosCliente }),
                ...(payload.objeciones !== undefined && { objeciones: payload.objeciones }),
                ...(payload.versionPropuesta !== undefined && { versionPropuesta: payload.versionPropuesta }),
                ...(payload.contrapropuestas !== undefined && { contrapropuestas: payload.contrapropuestas }),
                ...(payload.ajustesSolicitados !== undefined && { ajustesSolicitados: payload.ajustesSolicitados }),
            },
        });
    });
}
/* =========================================================
   Cambio de etapa (transaccional)
========================================================= */
export async function cambiarEtapaOportunidad(id, actorId, payload) {
    return prisma.$transaction(async (tx) => {
        const oportunidad = await obtenerOportunidadActivaOrThrow(tx, id);
        const etapaAnterior = oportunidad.etapa;
        const etapaNueva = payload.etapa;
        // Validar cotización vinculada, incluso si se "salta" columnas.
        await validarCotizacionParaEtapa(tx, id, etapaNueva);
        const data = { etapa: etapaNueva };
        if (etapaNueva === EtapaOportunidadVenta.GANADA) {
            // El schema Zod (cambiarEtapaSchema) ya exige fechaCierre para GANADA.
            data.fechaCierre = payload.fechaCierre;
            data.montoFinal = payload.montoFinal ?? null;
            data.motivoPerdida = null;
            data.motivoPostergacion = null;
            data.fechaReactivacion = null;
        }
        else if (etapaNueva === EtapaOportunidadVenta.PERDIDA) {
            // El schema Zod ya exige motivoPerdida y fechaCierre para PERDIDA.
            data.fechaCierre = payload.fechaCierre;
            data.motivoPerdida = payload.motivoPerdida;
            data.motivoPostergacion = null;
            data.fechaReactivacion = null;
            data.montoFinal = null;
        }
        else if (etapaNueva === EtapaOportunidadVenta.POSTERGADA) {
            data.fechaCierre = null;
            data.motivoPerdida = null;
            data.motivoPostergacion = payload.motivoPostergacion;
            data.fechaReactivacion = payload.fechaReactivacion;
            data.montoFinal = null;
        }
        else {
            data.fechaCierre = null;
            data.motivoPerdida = null;
            data.motivoPostergacion = null;
            data.fechaReactivacion = null;
            data.montoFinal = null;
        }
        // Si la etapa efectivamente cambia, la tarjeta se ubica al final de la columna destino.
        if (etapaNueva !== etapaAnterior) {
            data.orden = await siguienteOrdenEtapa(tx, etapaNueva);
        }
        const actualizado = await tx.oportunidadVenta.update({ where: { id }, data });
        if (etapaNueva !== etapaAnterior) {
            await tx.historialEtapaOportunidadVenta.create({
                data: {
                    oportunidadId: id,
                    etapaAnterior,
                    etapaNueva,
                    actorId,
                },
            });
        }
        return actualizado;
    });
}
/* =========================================================
   Reordenar dentro de la misma columna (sin historial)
========================================================= */
export async function reordenarOportunidad(id, nuevoOrden) {
    if (nuevoOrden < 0)
        throw new OrdenOportunidadInvalidoError();
    return prisma.$transaction(async (tx) => {
        const oportunidad = await obtenerOportunidadActivaOrThrow(tx, id);
        await recalcularOrdenColumna(tx, oportunidad.etapa, id, nuevoOrden);
        return tx.oportunidadVenta.findUnique({ where: { id } });
    });
}
/* =========================================================
   Soft delete
========================================================= */
export async function desactivarOportunidad(id) {
    return prisma.$transaction(async (tx) => {
        await obtenerOportunidadActivaOrThrow(tx, id);
        return tx.oportunidadVenta.update({
            where: { id },
            data: { activo: false, desactivadoAt: new Date() },
        });
    });
}
/* =========================================================
   Seguimientos comerciales
========================================================= */
export async function crearSeguimiento(oportunidadId, actorId, payload) {
    return prisma.$transaction(async (tx) => {
        await obtenerOportunidadActivaOrThrow(tx, oportunidadId);
        const fechaContacto = payload.fechaContacto ?? new Date();
        const seguimiento = await tx.seguimientoOportunidadVenta.create({
            data: {
                oportunidadId,
                autorId: actorId,
                comentario: payload.comentario,
                fechaContacto,
                proximaAccion: payload.proximaAccion ?? null,
                fechaProximaAccion: payload.fechaProximaAccion ?? null,
            },
        });
        await tx.oportunidadVenta.update({
            where: { id: oportunidadId },
            data: {
                fechaUltimoContacto: fechaContacto,
                ...(payload.proximaAccion !== undefined && { proximaAccion: payload.proximaAccion }),
                ...(payload.fechaProximaAccion !== undefined && { fechaProximaAccion: payload.fechaProximaAccion }),
            },
        });
        return seguimiento;
    });
}
export async function listarSeguimientos(oportunidadId) {
    const existe = await prisma.oportunidadVenta.findUnique({ where: { id: oportunidadId }, select: { id: true } });
    if (!existe)
        throw new OportunidadNoEncontradaError();
    return prisma.seguimientoOportunidadVenta.findMany({
        where: { oportunidadId },
        orderBy: { createdAt: "desc" },
        include: { autor: { select: { id_tecnico: true, nombre: true } } },
    });
}
/* =========================================================
   Historial combinado (cambios de etapa + auditoría genérica)
========================================================= */
export async function obtenerHistorial(oportunidadId) {
    const existe = await prisma.oportunidadVenta.findUnique({ where: { id: oportunidadId }, select: { id: true } });
    if (!existe)
        throw new OportunidadNoEncontradaError();
    const [cambiosEtapa, auditoria] = await Promise.all([
        prisma.historialEtapaOportunidadVenta.findMany({
            where: { oportunidadId },
            orderBy: { createdAt: "desc" },
            include: { actor: { select: { id_tecnico: true, nombre: true } } },
        }),
        prisma.auditLog.findMany({
            where: { entity: "OportunidadVenta", entityId: String(oportunidadId) },
            orderBy: { createdAt: "desc" },
            take: 100,
        }),
    ]);
    return { cambiosEtapa, auditoria };
}
/* =========================================================
   Cotizaciones vinculadas
========================================================= */
export async function listarCotizacionesOportunidad(oportunidadId) {
    const existe = await prisma.oportunidadVenta.findUnique({ where: { id: oportunidadId }, select: { id: true } });
    if (!existe)
        throw new OportunidadNoEncontradaError();
    return prisma.cotizacionGestioo.findMany({
        where: { oportunidadVentaId: oportunidadId },
        orderBy: { createdAt: "desc" },
        include: { entidad: { select: { id: true, nombre: true } } },
    });
}
export async function vincularCotizacion(oportunidadId, cotizacionId) {
    return prisma.$transaction(async (tx) => {
        await obtenerOportunidadActivaOrThrow(tx, oportunidadId);
        const cotizacion = await tx.cotizacionGestioo.findUnique({
            where: { id: cotizacionId },
            select: { id: true, oportunidadVentaId: true },
        });
        if (!cotizacion)
            throw new CotizacionNoEncontradaError();
        if (cotizacion.oportunidadVentaId && cotizacion.oportunidadVentaId !== oportunidadId) {
            throw new CotizacionYaVinculadaError();
        }
        if (cotizacion.oportunidadVentaId === oportunidadId) {
            return cotizacion; // ya estaba vinculada — operación idempotente
        }
        return tx.cotizacionGestioo.update({
            where: { id: cotizacionId },
            data: { oportunidadVentaId: oportunidadId },
        });
    });
}
export async function desvincularCotizacion(oportunidadId, cotizacionId) {
    return prisma.$transaction(async (tx) => {
        const oportunidad = await obtenerOportunidadActivaOrThrow(tx, oportunidadId);
        const cotizacion = await tx.cotizacionGestioo.findUnique({
            where: { id: cotizacionId },
            select: { id: true, oportunidadVentaId: true },
        });
        if (!cotizacion || cotizacion.oportunidadVentaId !== oportunidadId) {
            throw new CotizacionNoVinculadaError();
        }
        // COTIZACION_ENVIADA/NEGOCIACION/GANADA no pueden quedar sin ninguna cotización
        // vinculada después de la desvinculación.
        if (ETAPAS_QUE_REQUIEREN_COTIZACION_VINCULADA.has(oportunidad.etapa)) {
            const restantes = await tx.cotizacionGestioo.count({
                where: { oportunidadVentaId: oportunidadId, id: { not: cotizacionId } },
            });
            if (restantes === 0) {
                throw new DesvinculacionCotizacionInvalidaError();
            }
        }
        return tx.cotizacionGestioo.update({
            where: { id: cotizacionId },
            data: { oportunidadVentaId: null },
        });
    });
}
/* =========================================================
   Sincronización automática: cotización aprobada/facturada → funnel
   ---------------------------------------------------------
   Punto de integración: se invoca desde
   src/controllers/controllers-cotizaciones/cotizaciones.controller.ts
   (updateCotizacion), justo después de persistir un cambio de
   `estado` hacia APROBADA o FACTURADA en una cotización que tiene
   `oportunidadVentaId` asignado.
   No se engancha al log `CotizacionEnviada` porque ese modelo es
   genérico (no siempre trae `cotizacionId`) y no representa de forma
   confiable el estado comercial real de la cotización.
   Es intencionalmente tolerante a fallos: nunca debe romper el flujo
   de edición de cotizaciones existente.
========================================================= */
export async function sincronizarOportunidadPorCotizacionAprobada(cotizacionId, actorId) {
    try {
        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: cotizacionId },
            select: { oportunidadVentaId: true },
        });
        if (!cotizacion?.oportunidadVentaId)
            return;
        await prisma.$transaction(async (tx) => {
            const oportunidad = await tx.oportunidadVenta.findFirst({
                where: { id: cotizacion.oportunidadVentaId, activo: true },
            });
            if (!oportunidad)
                return;
            if (!ETAPAS_SIN_COTIZACION_REQUERIDA.has(oportunidad.etapa))
                return; // no retrocede etapas avanzadas
            // La cotización quedó aprobada/facturada: equivale a que ya está lista/enviada.
            const orden = await siguienteOrdenEtapa(tx, EtapaOportunidadVenta.COTIZACION_ENVIADA);
            await tx.oportunidadVenta.update({
                where: { id: oportunidad.id },
                data: { etapa: EtapaOportunidadVenta.COTIZACION_ENVIADA, orden },
            });
            await tx.historialEtapaOportunidadVenta.create({
                data: {
                    oportunidadId: oportunidad.id,
                    etapaAnterior: oportunidad.etapa,
                    etapaNueva: EtapaOportunidadVenta.COTIZACION_ENVIADA,
                    actorId,
                },
            });
        });
    }
    catch (err) {
        console.error("[oportunidades] Error sincronizando oportunidad tras aprobar cotización:", err);
    }
}
//# sourceMappingURL=oportunidades.service.js.map