// src/service/baseapi/baseapi-rcv-concilacion.service.ts
import { prisma } from "../../lib/prisma.js";
import {
    consultarComprasRcvBaseApi,
    consultarVentasRcvBaseApi,
} from "./baseapi-rcv.service.js";
import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";
import { mapRcvToConciliacionInput } from "./rcv-concilacion.mapper.js";

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
    responsable?: string | null;
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
        responsable,
    } = params;

    const razonSocialDb = razonSocial ?? null;
    const fechaDoctoDb = fechaDocto ?? null;
    const estadoRcvDb = estadoRcv ?? null;
    const origenRcvDb = origenRcv ?? null;
    const formaPagoDb = formaPago ?? null;
    const observacionDb = observacion ?? null;
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
            conciliadoAt: new Date(),
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
            conciliadoAt: new Date(),
        },
    });
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