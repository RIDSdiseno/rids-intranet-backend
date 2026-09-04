// src/service/baseapi/cobranza/cobranza-notas-credito.service.ts
import {
    prisma,
} from "../../../lib/prisma.js";

import {
    consultarDtePorFolioBaseApi,
    parseDteXmlForDb,
} from "../baseapi-dte.service.js";

import type {
    EmpresaKey,
} from "./cobranza-estado.service.js";

export type NotaCreditoAplicada = {
    folio:
    string;

    montoTotal:
    number;

    codigoRef:
    string | null;

    razonRef:
    string | null;
};

export type AplicacionNotaCredito = {
    tipoDoc:
    string;

    folio:
    string;

    rutContraparte:
    string;

    anulaCompletamente:
    boolean;

    montoNotasCredito:
    number;

    notasCredito:
    NotaCreditoAplicada[];
};

export type ResultadoAplicacionesNotasCredito = {
    aplicaciones:
    Map<
        string,
        AplicacionNotaCredito
    >;

    /*
     * Claves de Notas de Débito que únicamente
     * revierten/anulan una Nota de Crédito.
     *
     * Formato:
     *
     * folioNd|rutContraparte
     */
    notasDebitoSoloReversa:
    Set<string>;
};

function normalizarRut(
    value: unknown
): string {
    return String(
        value ?? ""
    )
        .replace(
            /[^0-9kK]/g,
            ""
        )
        .toUpperCase()
        .trim();
}

function getTipoDoc(
    doc: any
): string {
    return String(
        doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        ""
    ).trim();
}

function getFolio(
    doc: any
): string {
    return String(
        doc?.["Folio"] ??
        doc?.folio ??
        doc?.Nro ??
        doc?.numero ??
        ""
    ).trim();
}

function getRutDocumento(
    doc: any
): string {
    return normalizarRut(
        doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rut ??
        doc?.RUT ??
        ""
    );
}

function getPeriodoDocumento(
    doc: any
): string {
    return String(
        doc?.periodoCobranzaOrigen ??
        ""
    ).trim();
}

function getMontoTotal(
    doc: any
): number {
    const value =
        doc?.["Monto total"] ??
        doc?.["Monto Total"] ??
        doc?.montoTotal ??
        doc?.total ??
        0;

    if (
        typeof value ===
        "number"
    ) {
        return Number.isFinite(
            value
        )
            ? Math.round(
                value
            )
            : 0;
    }

    const raw =
        String(
            value ??
            ""
        )
            .replace(
                /\$/g,
                ""
            )
            .replace(
                /\./g,
                ""
            )
            .replace(
                ",",
                "."
            )
            .trim();

    const numero =
        Number(
            raw
        );

    return Number.isFinite(
        numero
    )
        ? Math.round(
            numero
        )
        : 0;
}

function getFacturaKey(
    tipoDoc: string,
    folio: string,
    rutContraparte: string
) {
    return [
        tipoDoc,
        folio,
        normalizarRut(
            rutContraparte
        ),
    ].join("|");
}

function getDocumentoRutKey(
    folio: string,
    rutContraparte: string
) {
    return [
        String(
            folio
        ).trim(),

        normalizarRut(
            rutContraparte
        ),
    ].join("|");
}

export async function obtenerAplicacionesNotasCredito(
    params: {
        empresa:
        EmpresaKey;

        documentos:
        any[];

        consultaSiiActiva:
        boolean;
    }
): Promise<
    ResultadoAplicacionesNotasCredito
> {
    const {
        empresa,
        documentos,
        consultaSiiActiva,
    } =
        params;

    /*
     * Las NC ya vienen dentro del RCV histórico.
     */
    const notasCreditoRcv =
        documentos.filter(
            (
                documento
            ) =>
                getTipoDoc(
                    documento
                ) ===
                "61"
        );

    /*
 * Notas de Débito presentes en el mismo
 * RCV histórico.
 */
    const notasDebitoRcv =
        documentos.filter(
            (
                documento
            ) =>
                getTipoDoc(
                    documento
                ) ===
                "56"
        );

    console.log(
        `[COBRANZA NC] ${empresa.toUpperCase()} notas de débito encontradas en RCV`,
        {
            total:
                notasDebitoRcv.length,
        }
    );

    console.log(
        `[COBRANZA NC] ${empresa.toUpperCase()} notas de crédito encontradas en RCV`,
        {
            total:
                notasCreditoRcv.length,
        }
    );

    const aplicaciones =
        new Map<
            string,
            AplicacionNotaCredito
        >();

    /*
 * NC que fueron anuladas posteriormente
 * mediante una Nota de Débito.
 *
 * Clave:
 * folioNc|rutContraparte
 */
    const notasCreditoAnuladas =
        new Set<string>();

    /*
     * ND que solamente representan la reversa
     * de una NC y por ello no deben cobrarse
     * como deuda independiente.
     *
     * Clave:
     * folioNd|rutContraparte
     */
    const notasDebitoSoloReversa =
        new Set<string>();

    /*
 * =====================================================
 * 1. DETECTAR ND QUE ANULAN UNA NOTA DE CRÉDITO
 * =====================================================
 *
 * Ejemplo real:
 *
 * ND 56-4
 *   ↓
 * referencia 61-124
 * CodRef = 1
 *
 * Significa:
 *
 * la NC 124 queda anulada
 * y la ND 4 NO representa deuda adicional.
 */

    for (
        const notaDebitoRcv
        of notasDebitoRcv
    ) {
        const folioNd =
            getFolio(
                notaDebitoRcv
            );

        const rutContraparte =
            getRutDocumento(
                notaDebitoRcv
            );

        const periodo =
            getPeriodoDocumento(
                notaDebitoRcv
            );

        if (
            !folioNd ||
            !rutContraparte ||
            !periodo
        ) {
            continue;
        }

        const folioNdNumber =
            Number(
                folioNd
            );

        if (
            !Number.isFinite(
                folioNdNumber
            )
        ) {
            continue;
        }

        /*
         * Primero intentamos utilizar FacturaDTE
         * ya cacheada.
         */
        let notaDebitoCache =
            await prisma.facturaDTE.findFirst({
                where: {
                    empresaAlias:
                        empresa,

                    tipoDTE:
                        56,

                    folio:
                        folioNdNumber,
                },

                select: {
                    folio:
                        true,

                    rutReceptor:
                        true,

                    xmlRaw:
                        true,
                },
            });

        /*
         * Si todavía no está cacheada, intentamos
         * recuperarla desde BaseAPI.
         */
        if (
            (
                !notaDebitoCache ||
                !notaDebitoCache.xmlRaw
            ) &&
            consultaSiiActiva
        ) {
            try {
                await consultarDtePorFolioBaseApi({
                    empresa,

                    periodo,

                    folio:
                        folioNd,

                    tipoDTE:
                        56,

                    forceRefresh:
                        false,
                });

                notaDebitoCache =
                    await prisma.facturaDTE.findFirst({
                        where: {
                            empresaAlias:
                                empresa,

                            tipoDTE:
                                56,

                            folio:
                                folioNdNumber,
                        },

                        select: {
                            folio:
                                true,

                            rutReceptor:
                                true,

                            xmlRaw:
                                true,
                        },
                    });
            } catch (
            error
            ) {
                console.warn(
                    "[COBRANZA NC] ⚠ No se pudo obtener DTE de Nota de Débito",
                    {
                        empresa,

                        folio:
                            folioNd,

                        periodo,

                        error:
                            error instanceof Error
                                ? error.message
                                : String(
                                    error
                                ),
                    }
                );

                continue;
            }
        }

        if (
            !notaDebitoCache
                ?.xmlRaw
        ) {
            console.warn(
                "[COBRANZA NC] ⚠ Nota de Débito sin XML disponible",
                {
                    empresa,

                    folio:
                        folioNd,
                }
            );

            continue;
        }

        let parsedNd;

        try {
            parsedNd =
                parseDteXmlForDb(
                    notaDebitoCache
                        .xmlRaw
                );

        } catch (
        error
        ) {
            console.warn(
                "[COBRANZA NC] ⚠ XML de Nota de Débito inválido",
                {
                    empresa,

                    folio:
                        folioNd,

                    error:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),
                }
            );

            continue;
        }

        const referenciasValidas =
            parsedNd.referencias.filter(
                (
                    referencia
                ) => {
                    const tipoDocRef =
                        String(
                            referencia
                                .tipoDocRef ??
                            ""
                        ).trim();

                    const folioRef =
                        String(
                            referencia
                                .folioRef ??
                            ""
                        ).trim();

                    return Boolean(
                        tipoDocRef &&
                        folioRef
                    );
                }
            );

        const referenciasReversaNc =
            referenciasValidas.filter(
                (
                    referencia
                ) => {
                    const tipoDocRef =
                        String(
                            referencia
                                .tipoDocRef ??
                            ""
                        ).trim();

                    const codigoRef =
                        String(
                            referencia
                                .codigoRef ??
                            ""
                        ).trim();

                    return (
                        tipoDocRef ===
                        "61" &&
                        codigoRef ===
                        "1"
                    );
                }
            );

        const esSoloReversaNc =
            referenciasValidas.length >
            0 &&
            referenciasReversaNc.length ===
            referenciasValidas.length;

        for (
            const referencia
            of referenciasReversaNc
        ) {
            const folioRef =
                String(
                    referencia
                        .folioRef ??
                    ""
                ).trim();

            if (
                !folioRef
            ) {
                continue;
            }

            notasCreditoAnuladas.add(
                getDocumentoRutKey(
                    folioRef,
                    rutContraparte
                )
            );

            console.log(
                "[COBRANZA NC] ↩️ Nota de Crédito anulada por Nota de Débito",
                {
                    empresa,

                    folioNd,

                    folioNc:
                        folioRef,

                    rutContraparte,

                    codigoRef:
                        "1",

                    razonRef:
                        referencia
                            .razonRef ??
                        null,
                }
            );
        }

        /*
 * La ND solamente se considera "solo reversa"
 * cuando TODAS sus referencias válidas corresponden
 * a NC tipo 61 con CodRef = 1.
 */
        if (
            esSoloReversaNc
        ) {
            notasDebitoSoloReversa.add(
                getDocumentoRutKey(
                    folioNd,
                    rutContraparte
                )
            );

            console.log(
                "[COBRANZA NC] ↩️ Nota de Débito identificada como reversa exclusiva de NC",
                {
                    empresa,

                    folioNd,

                    rutContraparte,

                    referencias:
                        referenciasReversaNc.length,
                }
            );
        }

    }

    for (
        const notaRcv
        of notasCreditoRcv
    ) {
        const folioNc =
            getFolio(
                notaRcv
            );

        const rutContraparte =
            getRutDocumento(
                notaRcv
            );

        const periodo =
            getPeriodoDocumento(
                notaRcv
            );

        if (
            !folioNc ||
            !rutContraparte ||
            !periodo
        ) {
            continue;
        }

        /*
 * Si esta NC fue anulada posteriormente
 * por una Nota de Débito, ya no debe producir
 * ningún efecto sobre la factura original.
 */
        if (
            notasCreditoAnuladas.has(
                getDocumentoRutKey(
                    folioNc,
                    rutContraparte
                )
            )
        ) {
            console.log(
                "[COBRANZA NC] ⏭ Nota de Crédito omitida porque fue anulada por Nota de Débito",
                {
                    empresa,

                    folioNc,

                    rutContraparte,
                }
            );

            continue;
        }

        /*
         * Primero intentamos leer la NC ya cacheada.
         */
        let notaCache =
            await prisma.facturaDTE.findFirst({
                where: {
                    empresaAlias:
                        empresa,

                    tipoDTE:
                        61,

                    folio:
                        Number(
                            folioNc
                        ),
                },

                select: {
                    folio:
                        true,

                    montoTotal:
                        true,

                    rutReceptor:
                        true,

                    xmlRaw:
                        true,
                },
            });

        /*
         * Si no existe en cache y la consulta SII/BaseAPI
         * está habilitada, obtenemos el DTE de la NC.
         */
        if (
            (
                !notaCache ||
                !notaCache.xmlRaw
            ) &&
            consultaSiiActiva
        ) {
            try {
                await consultarDtePorFolioBaseApi({
                    empresa,

                    periodo,

                    folio:
                        folioNc,

                    tipoDTE:
                        61,

                    forceRefresh:
                        false,
                });

                notaCache =
                    await prisma.facturaDTE.findFirst({
                        where: {
                            empresaAlias:
                                empresa,

                            tipoDTE:
                                61,

                            folio:
                                Number(
                                    folioNc
                                ),
                        },

                        select: {
                            folio:
                                true,

                            montoTotal:
                                true,

                            rutReceptor:
                                true,

                            xmlRaw:
                                true,
                        },
                    });
            } catch (
            error
            ) {
                console.warn(
                    "[COBRANZA NC] ⚠ No se pudo obtener DTE de Nota de Crédito",
                    {
                        empresa,

                        folio:
                            folioNc,

                        periodo,

                        error:
                            error instanceof Error
                                ? error.message
                                : String(
                                    error
                                ),
                    }
                );

                continue;
            }
        }

        if (
            !notaCache
                ?.xmlRaw
        ) {
            console.warn(
                "[COBRANZA NC] ⚠ Nota de Crédito sin XML disponible",
                {
                    empresa,

                    folio:
                        folioNc,
                }
            );

            continue;
        }

        let parsed;

        try {
            parsed =
                parseDteXmlForDb(
                    notaCache.xmlRaw
                );
        } catch (
        error
        ) {
            console.warn(
                "[COBRANZA NC] ⚠ XML de Nota de Crédito inválido",
                {
                    empresa,

                    folio:
                        folioNc,

                    error:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),
                }
            );

            continue;
        }

        const montoNota =
            Math.max(
                0,
                notaCache.montoTotal ??
                getMontoTotal(
                    notaRcv
                )
            );

        for (
            const referencia
            of parsed.referencias
        ) {
            const tipoDocRef =
                String(
                    referencia.tipoDocRef ??
                    ""
                ).trim();

            const folioRef =
                String(
                    referencia.folioRef ??
                    ""
                ).trim();

            const codigoRef =
                referencia.codigoRef
                    ? String(
                        referencia.codigoRef
                    ).trim()
                    : null;

            /*
             * Solo documentos que cobranza puede manejar.
             */
            if (
                ![
                    "33",
                    "34",
                    "56",
                ].includes(
                    tipoDocRef
                )
            ) {
                continue;
            }

            if (
                !folioRef
            ) {
                continue;
            }

            /*
             * Código SII:
             *
             * 1 = anula documento
             * 2 = corrige texto → NO altera deuda
             * 3 = corrige montos
             */
            if (
                codigoRef ===
                "2"
            ) {
                console.log(
                    "[COBRANZA NC] ℹ️ NC de corrección de texto omitida para monto",
                    {
                        folioNc,

                        tipoDocRef,

                        folioRef,
                    }
                );

                continue;
            }

            if (
                codigoRef !==
                "1" &&
                codigoRef !==
                "3"
            ) {
                console.warn(
                    "[COBRANZA NC] ⚠ Código de referencia no soportado automáticamente",
                    {
                        folioNc,

                        tipoDocRef,

                        folioRef,

                        codigoRef,
                    }
                );

                continue;
            }

            const key =
                getFacturaKey(
                    tipoDocRef,
                    folioRef,
                    rutContraparte
                );

            const existente =
                aplicaciones.get(
                    key
                );

            const notaAplicada:
                NotaCreditoAplicada =
            {
                folio:
                    folioNc,

                montoTotal:
                    montoNota,

                codigoRef,

                razonRef:
                    referencia.razonRef ??
                    null,
            };

            if (
                existente
            ) {
                existente.notasCredito.push(
                    notaAplicada
                );

                if (
                    codigoRef ===
                    "1"
                ) {
                    existente.anulaCompletamente =
                        true;
                } else {
                    existente.montoNotasCredito +=
                        montoNota;
                }

                continue;
            }

            aplicaciones.set(
                key,
                {
                    tipoDoc:
                        tipoDocRef,

                    folio:
                        folioRef,

                    rutContraparte,

                    anulaCompletamente:
                        codigoRef ===
                        "1",

                    montoNotasCredito:
                        codigoRef ===
                            "3"
                            ? montoNota
                            : 0,

                    notasCredito: [
                        notaAplicada,
                    ],
                }
            );
        }
    }

    console.log(
        `[COBRANZA NC] ${empresa.toUpperCase()} aplicaciones de NC resueltas`,
        {
            facturasAfectadas:
                aplicaciones.size,

            notasCreditoAnuladas:
                notasCreditoAnuladas.size,

            notasDebitoSoloReversa:
                notasDebitoSoloReversa.size,
        }
    );

    return {
        aplicaciones,

        notasDebitoSoloReversa,
    };
}