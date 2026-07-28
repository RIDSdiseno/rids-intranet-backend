// src/service/baseapi/baseapi-rcv-conciliacion.service.ts
import { prisma } from "../../lib/prisma.js";
import {
    consultarComprasRcvBaseApi,
    consultarVentasRcvBaseApi,
} from "./baseapi-rcv.service.js";
import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";
import { mapRcvToConciliacionInput } from "./rcv-concilacion.mapper.js";
import { enviarCorreoConciliacionRcv } from "./baseapi-rcv-conciliacion-mail.service.js";

type TipoRcv = "ventas" | "compras";

export async function listarConciliacionRcv(params: {
    empresa: EmpresaBaseApiKey;
    mes: string;
    ano: string;
    tipo: TipoRcv;
    forceRefresh?: boolean;
}) {
    const { empresa, mes, ano, tipo, forceRefresh = false } = params;

    const resultadoRcv =
        tipo === "ventas"
            ? await consultarVentasRcvBaseApi({ empresa, mes, ano, forceRefresh })
            : await consultarComprasRcvBaseApi({ empresa, mes, ano, forceRefresh });

    const docs =
        resultadoRcv?.data?.data?.datos ??
        resultadoRcv?.data?.datos ??
        [];

    const normalizados = docs.map((doc: any) =>
        mapRcvToConciliacionInput({
            doc,
            empresaKey: empresa,
            tipoRcv: tipo,
        })
    );

    const conciliaciones = await prisma.rcvConciliacion.findMany({
        where: {
            empresaKey: empresa,
            tipoRcv: tipo,
        },
    });

    const mapConciliacion = new Map(
        conciliaciones.map((c) => [
            `${c.empresaKey}-${c.tipoRcv}-${c.tipoDoc}-${c.rutContraparte}-${c.folio}`,
            c,
        ])
    );

    const data = normalizados.map((doc: any) => {
        const key = `${doc.empresaKey}-${doc.tipoRcv}-${doc.tipoDoc}-${doc.rutContraparte}-${doc.folio}`;
        const conciliacion = mapConciliacion.get(key);

        return {
            ...doc,
            idConciliacion: conciliacion?.id ?? null,
            estadoConciliacion:
                conciliacion?.estadoConciliacion ?? "NO_CONCILIADA",
            formaPago: conciliacion?.formaPago ?? null,
            observacion: conciliacion?.observacion ?? null,
            responsable: conciliacion?.responsable ?? null,
            conciliadoAt: conciliacion?.conciliadoAt ?? null,
        };
    });

    return {
        cached: resultadoRcv.cached,
        cacheUpdatedAt: resultadoRcv.cacheUpdatedAt,
        data,
        meta: {
            total: data.length,
            conciliadas: data.filter((d: any) => d.estadoConciliacion === "CONCILIADA").length,
            noConciliadas: data.filter((d: any) => d.estadoConciliacion === "NO_CONCILIADA").length,
            observadas: data.filter((d: any) => d.estadoConciliacion === "OBSERVADA").length,
        },
    };
}

export async function conciliarDocumentoRcv(params: {
    empresa: EmpresaBaseApiKey;
    tipoRcv: TipoRcv;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial?: string | null;
    fechaDocto?: Date | null;
    montoNeto?: number;
    montoIva?: number;
    montoTotal?: number;
    estadoRcv?: string | null;
    origenRcv?: string | null;
    formaPago?: string | null;
    observacion?: string | null;
    conciliadoAt?: Date | null;
    responsable?: string | null;
    enviarCorreo?: boolean;
    correoDestino?: string[] | null;
}) {
    const {
        empresa,
        tipoRcv,
        tipoDoc,
        folio,
        rutContraparte,
        razonSocial,
        fechaDocto,
        montoNeto = 0,
        montoIva = 0,
        montoTotal = 0,
        estadoRcv,
        origenRcv,
        formaPago,
        observacion,
        conciliadoAt,
        responsable,
        enviarCorreo = false,
        correoDestino,
    } = params;

    const razonSocialDb = razonSocial ?? null;
    const fechaDoctoDb = fechaDocto ?? null;
    const estadoRcvDb = estadoRcv ?? null;
    const origenRcvDb = origenRcv ?? null;
    const formaPagoDb = formaPago ?? null;
    const observacionDb = observacion ?? null;
    const responsableDb = responsable ?? null;
    const conciliadoAtDb = conciliadoAt ?? new Date();

    const conciliacion = await prisma.rcvConciliacion.upsert({
        where: {
            empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                empresaKey: empresa,
                tipoRcv,
                tipoDoc,
                rutContraparte,
                folio,
            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte,
            razonSocial: razonSocialDb,
            fechaDocto: fechaDoctoDb,
            montoNeto,
            montoIva,
            montoTotal,
            estadoRcv: estadoRcvDb,
            origenRcv: origenRcvDb,
            estadoConciliacion: "CONCILIADA",
            formaPago: formaPagoDb,
            observacion: observacionDb,
            responsable: responsableDb,
            conciliadoAt: conciliadoAtDb,
        },
        update: {
            razonSocial: razonSocialDb,
            fechaDocto: fechaDoctoDb,
            montoNeto,
            montoIva,
            montoTotal,
            estadoRcv: estadoRcvDb,
            origenRcv: origenRcvDb,
            estadoConciliacion: "CONCILIADA",
            formaPago: formaPagoDb,
            observacion: observacionDb,
            responsable: responsableDb,
            conciliadoAt: conciliadoAtDb,
        },
    });

    if (enviarCorreo && correoDestino) {
        try {
            await enviarCorreoConciliacionRcv({
                to: correoDestino,
                conciliacion,
            });
        } catch (error) {
            console.error("No se pudo enviar correo de conciliación:", {
                correoDestino,
                conciliacionId: conciliacion.id,
                error,
            });
        }
    }

    return conciliacion;
}

export async function desconciliarDocumentoRcv(params: {
    empresa: EmpresaBaseApiKey;
    tipoRcv: TipoRcv;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
}) {
    const { empresa, tipoRcv, tipoDoc, folio, rutContraparte } = params;

    return prisma.rcvConciliacion.upsert({
        where: {
            empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                empresaKey: empresa,
                tipoRcv,
                tipoDoc,
                rutContraparte,
                folio,
            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte,
            estadoConciliacion: "NO_CONCILIADA",
            conciliadoAt: null,
        },
        update: {
            estadoConciliacion: "NO_CONCILIADA",
            formaPago: null,
            observacion: null,
            responsable: null,
            conciliadoAt: null,
        },
    });
}

export async function observarDocumentoRcv(params: {
    empresa: EmpresaBaseApiKey;
    tipoRcv: TipoRcv;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    observacion: string;
    responsable?: string | null;
}) {
    const {
        empresa,
        tipoRcv,
        tipoDoc,
        folio,
        rutContraparte,
        observacion,
        responsable,
    } = params;

    const responsableDb = responsable ?? null;

    return prisma.rcvConciliacion.upsert({
        where: {
            empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                empresaKey: empresa,
                tipoRcv,
                tipoDoc,
                rutContraparte,
                folio,
            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte,
            estadoConciliacion: "OBSERVADA",
            observacion,
            responsable: responsableDb,
        },
        update: {
            estadoConciliacion: "OBSERVADA",
            observacion,
            responsable: responsableDb,
        },
    });
}

function normalizarRut(value: string): string {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toLowerCase();
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type PuntualidadEstado = "SIN_HISTORIAL" | "BUEN_PAGADOR" | "IRREGULAR" | "RIESGO_MORA";

export async function getPuntualidadCliente(params: {
    empresa: EmpresaBaseApiKey;
    rutContraparte: string;
}): Promise<{
    estado: PuntualidadEstado;
    score: number | null;
    totalConciliadas: number;
    conVencimientoRegistrado: number;
    aTiempo: number;
    atrasadas: number;
    promedioDiasAtraso: number;
}> {
    const { empresa, rutContraparte } = params;
    const rutNormalizado = normalizarRut(rutContraparte);

    const vacio = {
        estado: "SIN_HISTORIAL" as PuntualidadEstado,
        score: null,
        totalConciliadas: 0,
        conVencimientoRegistrado: 0,
        aTiempo: 0,
        atrasadas: 0,
        promedioDiasAtraso: 0,
    };

    if (!rutNormalizado) return vacio;

    const conciliaciones = await prisma.rcvConciliacion.findMany({
        where: { empresaKey: empresa, tipoRcv: "ventas", estadoConciliacion: "CONCILIADA" },
    });

    const delCliente = conciliaciones.filter(
        (c) => normalizarRut(c.rutContraparte) === rutNormalizado && c.conciliadoAt
    );

    if (delCliente.length === 0) return vacio;

    const overrides = await prisma.rcvVencimiento.findMany({
        where: {
            empresaKey: empresa,
            OR: delCliente.map((c) => ({ tipoDoc: c.tipoDoc, folio: c.folio })),
        },
    });
    const overrideMap = new Map(overrides.map((o) => [`${o.tipoDoc}|${o.folio}`, o.fechaVencimiento]));

    let aTiempo = 0;
    let atrasadas = 0;
    let sumaDiasAtraso = 0;

    for (const c of delCliente) {
        const vencimiento = overrideMap.get(`${c.tipoDoc}|${c.folio}`);
        if (!vencimiento || !c.conciliadoAt) continue;

        const diasAtraso = Math.round((c.conciliadoAt.getTime() - vencimiento.getTime()) / MS_POR_DIA);
        if (diasAtraso > 0) {
            atrasadas += 1;
            sumaDiasAtraso += diasAtraso;
        } else {
            aTiempo += 1;
        }
    }

    const conVencimientoRegistrado = aTiempo + atrasadas;

    if (conVencimientoRegistrado < 3) {
        return {
            ...vacio,
            totalConciliadas: delCliente.length,
            conVencimientoRegistrado,
            aTiempo,
            atrasadas,
        };
    }

    const pctATiempo = (aTiempo / conVencimientoRegistrado) * 100;
    const promedioDiasAtraso = atrasadas > 0 ? Math.round(sumaDiasAtraso / atrasadas) : 0;
    const score = Math.max(0, Math.min(100, Math.round(pctATiempo - promedioDiasAtraso * 0.5)));

    let estado: PuntualidadEstado;
    if (score >= 80) estado = "BUEN_PAGADOR";
    else if (score >= 50) estado = "IRREGULAR";
    else estado = "RIESGO_MORA";

    return {
        estado,
        score,
        totalConciliadas: delCliente.length,
        conVencimientoRegistrado,
        aTiempo,
        atrasadas,
        promedioDiasAtraso,
    };
}