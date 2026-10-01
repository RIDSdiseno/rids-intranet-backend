// src/service/baseapi/baseapi-rcv-conciliacion.service.ts
import { prisma } from "../../lib/prisma.js";
import {
    consultarComprasRcvBaseApi,
    consultarVentasRcvBaseApi,
} from "./baseapi-rcv.service.js";
import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";
import {
    mapRcvToConciliacionInput,
    normalizarRutRcv,
} from "./rcv-concilacion.mapper.js";
import { enviarCorreoConciliacionRcv } from "./baseapi-rcv-conciliacion-mail.service.js";

import {
    calcularResumenPuntualidad,
    evaluarDocumentoPuntualidad,
} from "./finanzas/puntualidad-cliente.service.js";

import type {
    EstadoPuntualidadCliente,
} from "./finanzas/puntualidad-cliente.service.js";

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

    const mapConciliacion =
        new Map(
            conciliaciones.map(
                (
                    c
                ) => [
                        [
                            c.empresaKey,
                            c.tipoRcv,
                            c.tipoDoc,
                            normalizarRutRcv(
                                c.rutContraparte
                            ),
                            c.folio,
                        ].join("|"),

                        c,
                    ]
            )
        );

    const data = normalizados.map((doc: any) => {
        const key =
            [
                doc.empresaKey,
                doc.tipoRcv,
                doc.tipoDoc,

                normalizarRutRcv(
                    doc.rutContraparte
                ),

                doc.folio,
            ].join("|");
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

    const rutContraparteDb =
        normalizarRutRcv(
            rutContraparte
        );

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
                empresaKey:
                    empresa,

                tipoRcv,

                tipoDoc,

                rutContraparte: rutContraparteDb,

                folio,
            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte: rutContraparteDb,
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

    if (
        enviarCorreo &&
        correoDestino &&
        correoDestino.length >
        0
    ) {
        void enviarCorreoConciliacionRcv({
            to:
                correoDestino,

            conciliacion,
        })
            .then(
                () => {
                    console.log(
                        "[CONCILIACION MAIL] ✅ Correo de conciliación procesado",
                        {
                            conciliacionId:
                                conciliacion.id,

                            empresa:
                                conciliacion.empresaKey,

                            tipoRcv:
                                conciliacion.tipoRcv,

                            folio:
                                conciliacion.folio,

                            destinatarios:
                                correoDestino,
                        }
                    );
                }
            )
            .catch(
                (
                    error
                ) => {
                    console.error(
                        "[CONCILIACION MAIL] ❌ No se pudo enviar correo de conciliación",
                        {
                            conciliacionId:
                                conciliacion.id,

                            empresa:
                                conciliacion.empresaKey,

                            tipoRcv:
                                conciliacion.tipoRcv,

                            folio:
                                conciliacion.folio,

                            destinatarios:
                                correoDestino,

                            error,
                        }
                    );
                }
            );
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

    const rutContraparteDb =
        normalizarRutRcv(
            rutContraparte
        );

    return prisma.rcvConciliacion.upsert({
        where: {
            empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                empresaKey:
                    empresa,

                tipoRcv,

                tipoDoc,

                rutContraparte:
                    rutContraparteDb,

                folio,
            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte: rutContraparteDb,
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

    const rutContraparteDb =
        normalizarRutRcv(
            rutContraparte
        );

    const responsableDb = responsable ?? null;

    return prisma.rcvConciliacion.upsert({
        where: {
            empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                empresaKey: empresa,
                tipoRcv,
                tipoDoc,
                rutContraparte: rutContraparteDb,
                folio,

            },
        },
        create: {
            empresaKey: empresa,
            tipoRcv,
            tipoDoc,
            folio,
            rutContraparte: rutContraparteDb,
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

export type PuntualidadEstado =
    EstadoPuntualidadCliente;

export async function getPuntualidadCliente(
    params: {
        empresa:
        EmpresaBaseApiKey;

        rutContraparte:
        string;
    }
): Promise<{
    estado:
    PuntualidadEstado;

    score:
    number | null;

    totalConciliadas:
    number;

    conVencimientoRegistrado:
    number;

    aTiempo:
    number;

    atrasadas:
    number;

    porcentajeATiempo:
    number;

    promedioDiasAtraso:
    number;

    documentosInvalidos:
    number;
}> {
    const {
        empresa,
        rutContraparte,
    } = params;

    const rutNormalizado =
        normalizarRutRcv(
            rutContraparte
        );

    const vacio = {
        estado:
            "SIN_HISTORIAL" as PuntualidadEstado,

        score:
            null,

        totalConciliadas:
            0,

        conVencimientoRegistrado:
            0,

        aTiempo:
            0,

        atrasadas:
            0,

        promedioDiasAtraso:
            0,

        porcentajeATiempo:
            0,

        documentosInvalidos:
            0,
    };

    if (
        !rutNormalizado
    ) {
        return vacio;
    }

    /*
     * Ahora filtramos directamente por RUT
     * en PostgreSQL.
     */
    const delCliente =
        await prisma
            .rcvConciliacion
            .findMany({
                where: {
                    empresaKey:
                        empresa,

                    tipoRcv:
                        "ventas",

                    estadoConciliacion:
                        "CONCILIADA",

                    rutContraparte:
                        rutNormalizado,

                    conciliadoAt: {
                        not:
                            null,
                    },
                },

                select: {
                    tipoDoc:
                        true,

                    folio:
                        true,

                    fechaDocto:
                        true,

                    conciliadoAt:
                        true,
                },
            });

    if (
        delCliente.length ===
        0
    ) {
        return vacio;
    }

    const vencimientos =
        await prisma
            .rcvVencimiento
            .findMany({
                where: {
                    empresaKey:
                        empresa,

                    OR:
                        delCliente.map(
                            item => ({
                                tipoDoc:
                                    item.tipoDoc,

                                folio:
                                    item.folio,
                            })
                        ),
                },

                select: {
                    tipoDoc:
                        true,

                    folio:
                        true,

                    fechaVencimiento:
                        true,
                },
            });

    const vencimientoMap =
        new Map(
            vencimientos.map(
                item => [
                    `${item.tipoDoc}|${item.folio}`,
                    item.fechaVencimiento,
                ]
            )
        );

    let totalEvaluados =
        0;

    let aTiempo =
        0;

    let atrasadas =
        0;

    let sumaDiasAtraso =
        0;

    let sumaPuntajes =
        0;

    let documentosInvalidos =
        0;

    for (
        const conciliacion
        of delCliente
    ) {
        if (
            !conciliacion.conciliadoAt
        ) {
            continue;
        }

        const vencimiento =
            vencimientoMap.get(
                `${conciliacion.tipoDoc}|${conciliacion.folio}`
            );

        if (
            !vencimiento
        ) {
            continue;
        }

        const evaluacion =
            evaluarDocumentoPuntualidad({
                fechaDocto:
                    conciliacion.fechaDocto,

                fechaVencimiento:
                    vencimiento,

                fechaPago:
                    conciliacion.conciliadoAt,
            });

        if (
            !evaluacion.valido
        ) {
            documentosInvalidos++;

            continue;
        }

        totalEvaluados++;

        sumaPuntajes +=
            evaluacion.puntaje;

        if (
            evaluacion.diasAtraso >
            0
        ) {
            atrasadas++;

            sumaDiasAtraso +=
                evaluacion.diasAtraso;
        } else {
            aTiempo++;
        }
    }

    const resultado =
        calcularResumenPuntualidad({
            totalEvaluados,

            aTiempo,

            atrasadas,

            sumaDiasAtraso,

            sumaPuntajes,

            documentosInvalidos,
        });

    return {
        estado:
            resultado.estado,

        score:
            resultado.score,

        totalConciliadas:
            delCliente.length,

        conVencimientoRegistrado:
            resultado.totalEvaluados,

        aTiempo:
            resultado.aTiempo,

        atrasadas:
            resultado.atrasadas,

        porcentajeATiempo:
            resultado.porcentajeATiempo,

        promedioDiasAtraso:
            resultado.promedioDiasAtraso,

        documentosInvalidos:
            resultado.documentosInvalidos,
    };
}