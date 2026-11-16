// src/service/mercado-publico/mercado-publico-hitos.service.ts
/* =========================================================
   HITOS DE LICITACIONES (Mercado Público)

   Fechas clave de cada licitación, leídas desde el detalle
   por código de la API. Base de los avisos de licitaciones
   (módulo propio: no usa Recordatorio ni el resumen de pendientes).

   - Hitos origen API: los crea/actualiza/desactiva esta sincronización.
   - Hitos origen MANUAL: nunca se tocan aquí.
   ========================================================= */

import {
    EstadoOportunidadMercadoPublico,
    EtapaOportunidadVenta,
    Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    fechaChile,
} from "../../utils/fecha-chile.js";

import {
    consultarLicitacionDetalle,
    type MercadoPublicoLicitacionApi,
} from "./mercado-publico-api.service.js";

/* =========================================================
   TIPOS DE HITO
   ========================================================= */

export const TIPOS_HITO_LICITACION = [
    "FINAL_PREGUNTAS",
    "PUBLICACION_RESPUESTAS",
    "VISITA_TERRENO",
    "ENTREGA_ANTECEDENTES",
    "SOPORTE_FISICO",
    "CIERRE",
    "APERTURA_TECNICA",
    "APERTURA_ECONOMICA",
    "ADJUDICACION",
    "FIRMA_CONTRATO",
    "OTRO",
] as const;

export type TipoHitoLicitacion =
    (typeof TIPOS_HITO_LICITACION)[number];

export const ETIQUETA_HITO: Record<TipoHitoLicitacion, string> = {
    FINAL_PREGUNTAS: "Cierre de preguntas",
    PUBLICACION_RESPUESTAS: "Publicación de respuestas",
    VISITA_TERRENO: "Visita a terreno",
    ENTREGA_ANTECEDENTES: "Entrega de antecedentes",
    SOPORTE_FISICO: "Entrega en soporte físico",
    CIERRE: "Cierre de ofertas",
    APERTURA_TECNICA: "Apertura técnica",
    APERTURA_ECONOMICA: "Apertura económica",
    ADJUDICACION: "Adjudicación",
    FIRMA_CONTRATO: "Firma de contrato",
    OTRO: "Otro",
};

/*
 * Claves de rawJson.Fechas confirmadas con 1016414-23-LE26.
 * FechaInicio (inicio de preguntas), FechaCreacion, FechaPublicacion,
 * FechaTiempoEvaluacion y FechasUsuario no generan hito.
 * Para ADJUDICACION se usa la real y, si no existe, la estimada.
 */
const FUENTES_HITO: ReadonlyArray<{
    tipo: Exclude<TipoHitoLicitacion, "OTRO">;
    claves: readonly string[];
}> = [
        { tipo: "FINAL_PREGUNTAS", claves: ["FechaFinal"] },
        { tipo: "PUBLICACION_RESPUESTAS", claves: ["FechaPubRespuestas"] },
        { tipo: "VISITA_TERRENO", claves: ["FechaVisitaTerreno"] },
        { tipo: "ENTREGA_ANTECEDENTES", claves: ["FechaEntregaAntecedentes"] },
        { tipo: "SOPORTE_FISICO", claves: ["FechaSoporteFisico"] },
        { tipo: "CIERRE", claves: ["FechaCierre"] },
        { tipo: "APERTURA_TECNICA", claves: ["FechaActoAperturaTecnica"] },
        { tipo: "APERTURA_ECONOMICA", claves: ["FechaActoAperturaEconomica"] },
        { tipo: "ADJUDICACION", claves: ["FechaAdjudicacion", "FechaEstimadaAdjudicacion"] },
        { tipo: "FIRMA_CONTRATO", claves: ["FechaEstimadaFirma"] },
    ];

/*
 * CodigoEstado de Mercado Público en los que la licitación ya no
 * cambia: 7 desierta, 8 adjudicada, 18 revocada.
 * (19 suspendida sigue sincronizándose: puede reanudarse.)
 */
export const CODIGOS_ESTADO_FINALES: readonly number[] = [7, 8, 18];

/* =========================================================
   VIGENCIA (calculada, no cambia `estado`)

   Una licitación está "cerrada" si ya pasó su fechaCierre o si
   Mercado Público informa 6 cerrada / 7 desierta / 8 adjudicada /
   18 revocada. Si el organismo prorroga el cierre, al sincronizar
   vuelve sola a "vigentes".
   ========================================================= */

export const CODIGOS_ESTADO_CERRADA: readonly number[] = [6, ...CODIGOS_ESTADO_FINALES];

export const VIGENCIAS_MERCADO_PUBLICO = ["vigentes", "cerradas", "todas"] as const;

export type VigenciaMercadoPublico = (typeof VIGENCIAS_MERCADO_PUBLICO)[number];

export function whereVigenciaLicitacion(
    vigencia: VigenciaMercadoPublico,
    ahora: Date = new Date()
): Prisma.OportunidadMercadoPublicoWhereInput {

    if (vigencia === "vigentes") {
        return {
            AND: [
                { OR: [{ fechaCierre: null }, { fechaCierre: { gte: ahora } }] },
                { OR: [{ codigoEstado: null }, { codigoEstado: { notIn: [...CODIGOS_ESTADO_CERRADA] } }] },
            ],
        };
    }

    if (vigencia === "cerradas") {
        return {
            OR: [
                { fechaCierre: { lt: ahora } },
                { codigoEstado: { in: [...CODIGOS_ESTADO_CERRADA] } },
            ],
        };
    }

    return {};
}

const MAX_SINCRONIZACIONES_POR_EJECUCION = 40;

const PAUSA_ENTRE_CONSULTAS_MS = 1200;

/* =========================================================
   ERRORES
   ========================================================= */

export class LicitacionNoEncontradaError extends Error {
    constructor(message = "Licitación de Mercado Público no encontrada.") {
        super(message);
        this.name = "LicitacionNoEncontradaError";
    }
}

export class DetalleLicitacionNoDisponibleError extends Error {
    constructor(codigo: string) {
        super(`Mercado Público no devolvió el detalle de ${codigo}.`);
        this.name = "DetalleLicitacionNoDisponibleError";
    }
}

/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function aJson(valor: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

function fechasDelDetalle(
    detalle: MercadoPublicoLicitacionApi
): Record<string, unknown> {
    const fechas = detalle.Fechas;
    return fechas && typeof fechas === "object"
        ? (fechas as Record<string, unknown>)
        : {};
}

/** Hitos que informa el detalle de la API (solo los que traen fecha válida). */
export function extraerHitosDeDetalle(
    detalle: MercadoPublicoLicitacionApi
): Array<{ tipo: Exclude<TipoHitoLicitacion, "OTRO">; fecha: Date }> {

    const fechas = fechasDelDetalle(detalle);
    const hitos: Array<{ tipo: Exclude<TipoHitoLicitacion, "OTRO">; fecha: Date }> = [];

    for (const fuente of FUENTES_HITO) {
        let fecha: Date | null = null;

        for (const clave of fuente.claves) {
            fecha = fechaChile(fechas[clave]);
            if (fecha) break;
        }

        /* El listado básico trae FechaCierre en la raíz. */
        if (!fecha && fuente.tipo === "CIERRE") {
            fecha = fechaChile(detalle.FechaCierre);
        }

        if (fecha) {
            hitos.push({ tipo: fuente.tipo, fecha });
        }
    }

    return hitos;
}

/* =========================================================
   SINCRONIZAR UNA LICITACIÓN
   ========================================================= */

export type ResultadoSincronizacionHitos = {
    id: number;
    codigoExterno: string;
    creados: number;
    actualizados: number;
    desactivados: number;
    sinCambios: number;
    /** Distinto de null si la API informa un CodigoEstado diferente al guardado. */
    cambioEstado: {
        anterior: number | null;
        nuevo: number;
        texto: string | null;
    } | null;
};

/**
 * Consulta el detalle (o usa el entregado) y deja los hitos API
 * iguales a lo que informa Mercado Público. Actualiza también
 * estado, fechaCierre, fechaPublicacion y rawJson de la licitación.
 */
export async function sincronizarHitosLicitacion(
    id: number,
    detallePrevio?: MercadoPublicoLicitacionApi | null
): Promise<ResultadoSincronizacionHitos> {

    const licitacion = await prisma.oportunidadMercadoPublico.findUnique({
        where: { id },
        select: { id: true, codigoExterno: true, codigoEstado: true },
    });

    if (!licitacion) {
        throw new LicitacionNoEncontradaError();
    }

    const detalle =
        detallePrevio ??
        (await consultarLicitacionDetalle(licitacion.codigoExterno));

    if (!detalle) {
        throw new DetalleLicitacionNoDisponibleError(licitacion.codigoExterno);
    }

    const informados = new Map(
        extraerHitosDeDetalle(detalle).map((h) => [h.tipo, h.fecha] as const)
    );

    const codigoEstado =
        typeof detalle.CodigoEstado === "number" ? detalle.CodigoEstado : null;

    const estadoTexto =
        typeof detalle.Estado === "string" && detalle.Estado.trim()
            ? detalle.Estado.trim()
            : null;

    const fechaCierre = informados.get("CIERRE") ?? null;

    const fechaPublicacion = fechaChile(fechasDelDetalle(detalle)["FechaPublicacion"]);

    const resultado: ResultadoSincronizacionHitos = {
        id: licitacion.id,
        codigoExterno: licitacion.codigoExterno,
        creados: 0,
        actualizados: 0,
        desactivados: 0,
        sinCambios: 0,
        cambioEstado:
            codigoEstado !== null && codigoEstado !== licitacion.codigoEstado
                ? { anterior: licitacion.codigoEstado, nuevo: codigoEstado, texto: estadoTexto }
                : null,
    };

    await prisma.$transaction(async (tx) => {

        const existentes = await tx.licitacionHito.findMany({
            where: { oportunidadMercadoPublicoId: id, origen: "API" },
            orderBy: { id: "asc" },
        });

        const porTipo = new Map<string, (typeof existentes)[number]>();
        for (const h of existentes) {
            if (!porTipo.has(h.tipo)) porTipo.set(h.tipo, h);
        }

        for (const fuente of FUENTES_HITO) {
            const fecha = informados.get(fuente.tipo) ?? null;
            const actual = porTipo.get(fuente.tipo);

            if (fecha && !actual) {
                await tx.licitacionHito.create({
                    data: {
                        oportunidadMercadoPublicoId: id,
                        tipo: fuente.tipo,
                        fecha,
                        origen: "API",
                    },
                });
                resultado.creados++;
                continue;
            }

            if (fecha && actual) {
                if (actual.fecha.getTime() !== fecha.getTime() || !actual.activo) {
                    await tx.licitacionHito.update({
                        where: { id: actual.id },
                        data: { fecha, activo: true },
                    });
                    resultado.actualizados++;
                } else {
                    resultado.sinCambios++;
                }
                continue;
            }

            /* La API ya no informa el hito: se desactiva (no se borra). */
            if (!fecha && actual?.activo) {
                await tx.licitacionHito.update({
                    where: { id: actual.id },
                    data: { activo: false },
                });
                resultado.desactivados++;
            }
        }

        await tx.oportunidadMercadoPublico.update({
            where: { id },
            data: {
                ...(codigoEstado !== null && { codigoEstado }),
                ...(estadoTexto !== null && { estadoMercadoPublico: estadoTexto }),
                ...(fechaCierre && { fechaCierre }),
                ...(fechaPublicacion && { fechaPublicacion }),
                rawJson: aJson(detalle),
                sincronizadoAt: new Date(),
            },
        });
    });

    return resultado;
}

/* =========================================================
   SINCRONIZAR LICITACIONES VIGENTES (para el cron diario)
   ========================================================= */

/*
 * Vigentes = INTERESANTE, o CONVERTIDA con oportunidad activa que no
 * esté GANADA/PERDIDA; en ambos casos sin estado final en Mercado Público.
 * Se procesan primero las sincronizadas hace más tiempo.
 */
export function whereLicitacionesVigentes(): Prisma.OportunidadMercadoPublicoWhereInput {
    return {
        AND: [
            {
                OR: [
                    /* INTERESANTE: solo hasta su cierre (después no hay nada que avisar). */
                    {
                        estado: EstadoOportunidadMercadoPublico.INTERESANTE,
                        OR: [{ fechaCierre: null }, { fechaCierre: { gte: new Date() } }],
                    },
                    {
                        estado: EstadoOportunidadMercadoPublico.CONVERTIDA,
                        oportunidadVenta: {
                            is: {
                                activo: true,
                                etapa: {
                                    notIn: [
                                        EtapaOportunidadVenta.GANADA,
                                        EtapaOportunidadVenta.PERDIDA,
                                    ],
                                },
                            },
                        },
                    },
                ],
            },
            {
                OR: [
                    { codigoEstado: null },
                    { codigoEstado: { notIn: [...CODIGOS_ESTADO_FINALES] } },
                ],
            },
        ],
    };
}

/** Sincroniza una lista de licitaciones con pausa entre consultas. */
async function sincronizarLote(
    candidatas: Array<{ id: number; codigoExterno: string }>
) {

    const resultados: ResultadoSincronizacionHitos[] = [];
    const errores: Array<{ codigoExterno: string; error: string }> = [];

    for (let i = 0; i < candidatas.length; i++) {
        const c = candidatas[i];
        if (!c) continue;

        if (i > 0) await sleep(PAUSA_ENTRE_CONSULTAS_MS);

        try {
            resultados.push(await sincronizarHitosLicitacion(c.id));
        } catch (error) {
            errores.push({
                codigoExterno: c.codigoExterno,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return {
        candidatas: candidatas.length,
        sincronizadas: resultados.length,
        hitosCreados: resultados.reduce((a, r) => a + r.creados, 0),
        hitosActualizados: resultados.reduce((a, r) => a + r.actualizados, 0),
        hitosDesactivados: resultados.reduce((a, r) => a + r.desactivados, 0),
        cambiosEstado: resultados
            .filter((r) => r.cambioEstado)
            .map((r) => ({ id: r.id, codigoExterno: r.codigoExterno, ...r.cambioEstado })),
        errores,
    };
}

export async function sincronizarHitosLicitacionesVigentes() {

    const candidatas = await prisma.oportunidadMercadoPublico.findMany({
        where: whereLicitacionesVigentes(),
        orderBy: { sincronizadoAt: "asc" },
        take: MAX_SINCRONIZACIONES_POR_EJECUCION,
        select: { id: true, codigoExterno: true },
    });

    return sincronizarLote(candidatas);
}

/* =========================================================
   NUEVAS (sin revisar) POR CERRAR
   ========================================================= */

/** Días hacia adelante en que una NUEVA se considera "por cerrar". */
export const DIAS_NUEVAS_POR_CERRAR = 8;

const MAX_NUEVAS_POR_EJECUCION = 40;

/** Una NUEVA ya sincronizada en las últimas 20 h no se vuelve a consultar. */
const HORAS_MIN_ENTRE_SYNC_NUEVAS = 20;

/**
 * NUEVA (sin revisar) con cierre pendiente y sin estado cerrado en
 * Mercado Público. Con `hastaDias`, solo las que cierran dentro de ese plazo.
 */
export function whereNuevasConCierrePendiente(
    ahora: Date = new Date(),
    hastaDias?: number
): Prisma.OportunidadMercadoPublicoWhereInput {
    return {
        estado: EstadoOportunidadMercadoPublico.NUEVA,
        fechaCierre: {
            gte: ahora,
            ...(hastaDias !== undefined && {
                lte: new Date(ahora.getTime() + hastaDias * 86_400_000),
            }),
        },
        OR: [
            { codigoEstado: null },
            { codigoEstado: { notIn: [...CODIGOS_ESTADO_CERRADA] } },
        ],
    };
}

/**
 * Refresca hitos (prórrogas) de las NUEVA que cierran en los próximos
 * DIAS_NUEVAS_POR_CERRAR días, las más próximas primero.
 */
export async function sincronizarHitosNuevasPorCerrar() {

    const ahora = new Date();

    const candidatas = await prisma.oportunidadMercadoPublico.findMany({
        where: {
            ...whereNuevasConCierrePendiente(ahora, DIAS_NUEVAS_POR_CERRAR),
            sincronizadoAt: {
                lt: new Date(ahora.getTime() - HORAS_MIN_ENTRE_SYNC_NUEVAS * 3_600_000),
            },
        },
        orderBy: { fechaCierre: "asc" },
        take: MAX_NUEVAS_POR_EJECUCION,
        select: { id: true, codigoExterno: true },
    });

    return sincronizarLote(candidatas);
}

/* =========================================================
   LISTAR HITOS DE UNA LICITACIÓN
   ========================================================= */

export async function listarHitosLicitacion(id: number) {

    const existe = await prisma.oportunidadMercadoPublico.findUnique({
        where: { id },
        select: { id: true },
    });

    if (!existe) {
        throw new LicitacionNoEncontradaError();
    }

    return prisma.licitacionHito.findMany({
        where: { oportunidadMercadoPublicoId: id },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
}