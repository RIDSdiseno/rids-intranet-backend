// src/service/baseapi/cobranza/cobranza-automatico.service.ts

import { prisma } from "../../../lib/prisma.js";

import {
    consultarVentasRcvBaseApi,
} from "../baseapi-rcv.service.js";

import {
    consultarDtePorFolioBaseApi,
} from "../baseapi-dte.service.js";

import {
    obtenerEstadosDocumentosCobranza,
    type EmpresaKey,
} from "./cobranza-estado.service.js";

/* =========================================================
   TYPES
========================================================= */

export type TipoRecordatorioCobranza =
    | "POR_VENCER_7_DIAS"
    | "POR_VENCER_3_DIAS"
    | "VENCE_HOY"
    | "VENCIDA_3_DIAS"
    | "VENCIDA_7_DIAS"
    | "VENCIDA_15_DIAS"
    | "VENCIDA_30_DIAS"
    | `POR_VENCER_${number}_DIAS`
    | `VENCIDA_${number}_DIAS`;

export type CandidatoRecordatorioCobranza = {
    empresaKey: EmpresaKey;

    tipoRcv: "ventas";

    tipoDoc: string;
    folio: string;

    rutContraparte: string;
    razonSocial: string | null;

    montoTotal: number;

    fechaVencimiento: string;
    diasDiferencia: number;

    estadoPago:
    | "PENDIENTE"
    | "VENCIDA";

    tipoRecordatorio:
    TipoRecordatorioCobranza;

    yaEnviado: boolean;

    periodoOrigen: string;
};

export type ResultadoCobranzaEmpresa = {
    empresa: EmpresaKey;

    configurada: boolean;
    activa: boolean;
    envioAutomatico: boolean;

    documentosAnalizados: number;

    confirmadosOmitidos: number;
    sinFechaVencimiento: number;
    sinIdentificacion: number;

    candidatos: number;
    yaEnviados: number;
    pendientesEnvio: number;

    detalle: CandidatoRecordatorioCobranza[];

    error?: string;
};

export type ResultadoCobranzaAutomatica = {
    modo: "SIMULACION";

    generadoAt: Date;

    mesesAnalizados: number;

    empresas: ResultadoCobranzaEmpresa[];

    totalDocumentos: number;
    totalCandidatos: number;
    totalYaEnviados: number;
    totalPendientesEnvio: number;
};

/* =========================================================
   LOGS / TIMING
========================================================= */

function logTiempo(
    etiqueta: string,
    inicio: number
) {
    const duracionMs =
        Date.now() -
        inicio;

    const duracionSeg =
        Number(
            (
                duracionMs /
                1000
            ).toFixed(2)
        );

    console.log(
        `[COBRANZA AUTO] ⏱ ${etiqueta}`,
        {
            duracionMs,
            duracionSeg,
        }
    );

    return {
        duracionMs,
        duracionSeg,
    };
}

/* =========================================================
   HELPERS DOCUMENTOS
========================================================= */

function getDocumentosVentas(
    data: any
): any[] {
    if (Array.isArray(data)) {
        return data;
    }

    if (
        Array.isArray(
            data?.detalleVentas
        )
    ) {
        return data.detalleVentas;
    }

    if (
        Array.isArray(
            data?.ventas
        )
    ) {
        return data.ventas;
    }

    if (
        Array.isArray(
            data?.documentos
        )
    ) {
        return data.documentos;
    }

    if (
        Array.isArray(
            data?.items
        )
    ) {
        return data.items;
    }

    if (
        Array.isArray(
            data?.data?.datos
        )
    ) {
        return data.data.datos;
    }

    if (
        Array.isArray(
            data?.data?.detalleVentas
        )
    ) {
        return data.data.detalleVentas;
    }

    if (
        Array.isArray(
            data?.data?.ventas
        )
    ) {
        return data.data.ventas;
    }

    if (
        Array.isArray(
            data?.data?.documentos
        )
    ) {
        return data.data.documentos;
    }

    return [];
}

function normalizeRut(
    value: unknown
): string {
    return String(
        value ?? ""
    )
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .trim();
}

function getRutDocumento(
    doc: any
): string {
    return normalizeRut(
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

function getRazonSocialDocumento(
    doc: any
): string | null {
    const value =
        doc?.["Razon Social"] ??
        doc?.["Razón Social"] ??
        doc?.razonSocial ??
        doc?.razon_social ??
        doc?.razonSocialReceptor ??
        null;

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text =
        String(
            value
        ).trim();

    return text || null;
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

function toNumberCL(
    value: unknown
): number {
    if (
        typeof value ===
        "number"
    ) {
        return Number.isFinite(
            value
        )
            ? value
            : 0;
    }

    const raw =
        String(
            value ??
            ""
        )
            .trim()
            .replace(
                /\$/g,
                ""
            )
            .replace(
                /\s/g,
                ""
            );

    if (!raw) {
        return 0;
    }

    const normalized =
        raw
            .replace(
                /\./g,
                ""
            )
            .replace(
                ",",
                "."
            );

    const number =
        Number(
            normalized
        );

    return Number.isFinite(
        number
    )
        ? number
        : 0;
}

function getMontoTotal(
    doc: any
): number {
    return toNumberCL(
        doc?.["Monto total"] ??
        doc?.["Monto Total"] ??
        doc?.montoTotal ??
        doc?.total ??
        0
    );
}

/* =========================================================
   HELPERS DTE / VENCIMIENTO
========================================================= */

/*
 * Tipos de documentos que pueden participar directamente
 * en el flujo de cobranza.
 *
 * 33 = Factura Electrónica
 * 34 = Factura Exenta Electrónica
 * 56 = Nota de Débito Electrónica
 *
 * 61 = Nota de Crédito Electrónica
 * NO se cobra directamente.
 */
const TIPOS_DTE_COBRABLES =
    new Set([
        "33",
        "34",
        "56",
    ]);

function esDocumentoCobrable(
    doc: any
): boolean {
    return TIPOS_DTE_COBRABLES.has(
        getTipoDoc(
            doc
        )
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

/*
 * Normaliza una fecha proveniente de Prisma/BaseAPI
 * al formato YYYY-MM-DD que ya entiende
 * cobranza-estado.service.ts.
 */
function fechaToIsoDateOnly(
    value: unknown
): string | null {
    if (!value) {
        return null;
    }

    if (
        value instanceof Date
    ) {
        if (
            Number.isNaN(
                value.getTime()
            )
        ) {
            return null;
        }

        const ano =
            value.getFullYear();

        const mes =
            String(
                value.getMonth() +
                1
            ).padStart(
                2,
                "0"
            );

        const dia =
            String(
                value.getDate()
            ).padStart(
                2,
                "0"
            );

        return `${ano}-${mes}-${dia}`;
    }

    const raw =
        String(
            value
        ).trim();

    if (!raw) {
        return null;
    }

    const matchIso =
        /^(\d{4})-(\d{2})-(\d{2})/.exec(
            raw
        );

    if (
        matchIso
    ) {
        return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
    }

    const parsed =
        new Date(
            raw
        );

    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {
        return null;
    }

    const ano =
        parsed.getFullYear();

    const mes =
        String(
            parsed.getMonth() +
            1
        ).padStart(
            2,
            "0"
        );

    const dia =
        String(
            parsed.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${ano}-${mes}-${dia}`;
}

function getFechaVencimientoDesdeRespuestaDte(
    resultado: any
): string | null {
    const value =
        resultado?.data
            ?.data
            ?.documento
            ?.fecha_vencimiento ??
        resultado?.data
            ?.documento
            ?.fecha_vencimiento ??
        null;

    return fechaToIsoDateOnly(
        value
    );
}

/* =========================================================
   PERIODOS
========================================================= */

type PeriodoCobranza = {
    ano: string;
    mes: string;
    periodo: string;
};

function getPeriodosAnteriores(
    cantidadMeses: number,
    referencia =
        new Date()
): PeriodoCobranza[] {
    const periodos:
        PeriodoCobranza[] =
        [];

    for (
        let i = 0;
        i <
        cantidadMeses;
        i++
    ) {
        const fecha =
            new Date(
                referencia.getFullYear(),
                referencia.getMonth() -
                i,
                1
            );

        const ano =
            String(
                fecha.getFullYear()
            );

        const mes =
            String(
                fecha.getMonth() +
                1
            ).padStart(
                2,
                "0"
            );

        periodos.push({
            ano,
            mes,
            periodo:
                `${ano}-${mes}`,
        });
    }

    return periodos;
}

/* =========================================================
   REGLAS
========================================================= */

function getTipoRecordatorio(
    diasDiferencia: number,
    diasPorVencer: number[],
    diasVencidos: number[]
): TipoRecordatorioCobranza | null {
    if (
        diasDiferencia <
        0
    ) {
        if (
            !diasPorVencer.includes(
                diasDiferencia
            )
        ) {
            return null;
        }

        const dias =
            Math.abs(
                diasDiferencia
            );

        if (
            dias ===
            7
        ) {
            return "POR_VENCER_7_DIAS";
        }

        if (
            dias ===
            3
        ) {
            return "POR_VENCER_3_DIAS";
        }

        return `POR_VENCER_${dias}_DIAS`;
    }

    if (
        diasDiferencia ===
        0
    ) {
        if (
            !diasVencidos.includes(
                0
            )
        ) {
            return null;
        }

        return "VENCE_HOY";
    }

    if (
        !diasVencidos.includes(
            diasDiferencia
        )
    ) {
        return null;
    }

    if (
        diasDiferencia ===
        3
    ) {
        return "VENCIDA_3_DIAS";
    }

    if (
        diasDiferencia ===
        7
    ) {
        return "VENCIDA_7_DIAS";
    }

    if (
        diasDiferencia ===
        15
    ) {
        return "VENCIDA_15_DIAS";
    }

    if (
        diasDiferencia ===
        30
    ) {
        return "VENCIDA_30_DIAS";
    }

    return `VENCIDA_${diasDiferencia}_DIAS`;
}

/* =========================================================
   CARGAR DOCUMENTOS
========================================================= */

async function cargarDocumentosEmpresa(
    empresa: EmpresaKey,
    mesesAnalizar: number
) {
    const inicioCarga =
        Date.now();

    const periodos =
        getPeriodosAnteriores(
            mesesAnalizar
        );

    const documentos:
        any[] = [];

    const CONCURRENCIA =
        3;

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} cargará ${periodos.length} períodos`
    );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} períodos:`,
        periodos.map(
            (p) =>
                p.periodo
        )
    );

    for (
        let i = 0;
        i <
        periodos.length;
        i +=
        CONCURRENCIA
    ) {
        const inicioGrupo =
            Date.now();

        const grupo =
            periodos.slice(
                i,
                i +
                CONCURRENCIA
            );

        console.log(
            `[COBRANZA AUTO] ${empresa.toUpperCase()} procesando grupo`,
            {
                desde:
                    i,
                hasta:
                    i +
                    grupo.length -
                    1,
                periodos:
                    grupo.map(
                        (
                            periodo
                        ) =>
                            periodo.periodo
                    ),
            }
        );

        const resultadosGrupo =
            await Promise.all(
                grupo.map(
                    async (
                        periodo
                    ) => {
                        const inicioPeriodo =
                            Date.now();

                        console.log(
                            `[COBRANZA AUTO] 🔄 ${empresa.toUpperCase()} ${periodo.periodo} iniciando consulta`
                        );

                        try {
                            const resultado =
                                await consultarVentasRcvBaseApi({
                                    empresa,
                                    mes:
                                        periodo.mes,
                                    ano:
                                        periodo.ano,
                                    forceRefresh:
                                        false,
                                });

                            const docs =
                                getDocumentosVentas(
                                    resultado.data
                                );

                            const duracionMs =
                                Date.now() -
                                inicioPeriodo;

                            const duracionSeg =
                                Number(
                                    (
                                        duracionMs /
                                        1000
                                    ).toFixed(
                                        2
                                    )
                                );

                            console.log(
                                `[COBRANZA AUTO] ✅ ${empresa.toUpperCase()} ${periodo.periodo}`,
                                {
                                    documentos:
                                        docs.length,

                                    cached:
                                        resultado.cached,

                                    cacheUpdatedAt:
                                        resultado.cacheUpdatedAt,

                                    duracionMs,

                                    duracionSeg,
                                }
                            );

                            return docs.map(
                                (
                                    doc
                                ) => ({
                                    ...doc,

                                    empresaOrigen:
                                        empresa,

                                    periodoCobranzaOrigen:
                                        periodo.periodo,
                                })
                            );
                        } catch (
                        error
                        ) {
                            const duracionMs =
                                Date.now() -
                                inicioPeriodo;

                            const duracionSeg =
                                Number(
                                    (
                                        duracionMs /
                                        1000
                                    ).toFixed(
                                        2
                                    )
                                );

                            const message =
                                error instanceof Error
                                    ? error.message
                                    : String(
                                        error
                                    );

                            console.error(
                                `[COBRANZA AUTO] ❌ ${empresa.toUpperCase()} ${periodo.periodo}`,
                                {
                                    error:
                                        message,

                                    duracionMs,

                                    duracionSeg,
                                }
                            );

                            return [];
                        }
                    }
                )
            );

        for (
            const grupoDocs
            of resultadosGrupo
        ) {
            documentos.push(
                ...grupoDocs
            );
        }

        logTiempo(
            `${empresa.toUpperCase()} grupo ${grupo
                .map(
                    (p) =>
                        p.periodo
                )
                .join(
                    ", "
                )}`,
            inicioGrupo
        );
    }

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} carga completa`,
        {
            documentos:
                documentos.length,

            periodosProcesados:
                periodos.length,
        }
    );

    logTiempo(
        `Carga histórica ${empresa.toUpperCase()}`,
        inicioCarga
    );

    return documentos;
}

/* =========================================================
   COMPLETAR VENCIMIENTOS DESDE DTE
========================================================= */

async function completarVencimientosDesdeDte(
    empresa: EmpresaKey,
    evaluadosIniciales: Awaited<
        ReturnType<
            typeof obtenerEstadosDocumentosCobranza
        >
    >,
    consultaSiiActiva: boolean
) {
    const inicio =
        Date.now();

    /*
     * Primero seleccionamos solamente documentos que:
     *
     * - No están conciliados.
     * - No tienen fecha de vencimiento.
     * - Son documentos cobrables.
     * - Tienen tipo, folio y período.
     */

    const pendientes =
        evaluadosIniciales.filter(
            ({
                documento,
                estado,
            }) => {
                if (
                    estado.estadoPago ===
                    "CONFIRMADA"
                ) {
                    return false;
                }

                if (
                    estado.fechaVencimiento &&
                    estado.fechaVencimientoIso &&
                    estado.diasDiferencia !==
                    null
                ) {
                    return false;
                }

                if (
                    !esDocumentoCobrable(
                        documento
                    )
                ) {
                    return false;
                }

                const tipoDoc =
                    getTipoDoc(
                        documento
                    );

                const folio =
                    getFolio(
                        documento
                    );

                const periodo =
                    getPeriodoDocumento(
                        documento
                    );

                return Boolean(
                    tipoDoc &&
                    folio &&
                    periodo
                );
            }
        );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} documentos que requieren vencimiento DTE`,
        {
            total:
                pendientes.length,

            consultaSiiActiva,
        }
    );

    if (
        pendientes.length ===
        0
    ) {
        return;
    }

    /*
     * Procesamos pocos DTE simultáneamente para no
     * saturar BaseAPI/SII.
     */
    const CONCURRENCIA_DTE =
        3;

    for (
        let i = 0;
        i <
        pendientes.length;
        i +=
        CONCURRENCIA_DTE
    ) {
        const grupo =
            pendientes.slice(
                i,
                i +
                CONCURRENCIA_DTE
            );

        await Promise.all(
            grupo.map(
                async ({
                    documento,
                }) => {
                    const tipoDoc =
                        getTipoDoc(
                            documento
                        );

                    const folio =
                        getFolio(
                            documento
                        );

                    const periodo =
                        getPeriodoDocumento(
                            documento
                        );

                    const tipoDTE =
                        Number(
                            tipoDoc
                        );

                    const folioInt =
                        Number(
                            folio
                        );

                    if (
                        !Number.isFinite(
                            tipoDTE
                        ) ||
                        !Number.isFinite(
                            folioInt
                        )
                    ) {
                        return;
                    }

                    const inicioDte =
                        Date.now();

                    /*
                     * Primero buscamos directamente en FacturaDTE.
                     *
                     * Esto permite usar registros previamente
                     * cacheados incluso si consultaSiiActiva=false.
                     */
                    try {
                        const facturaCache =
                            await prisma.facturaDTE.findFirst({
                                where: {
                                    empresaAlias:
                                        empresa,

                                    tipoDTE,

                                    folio:
                                        folioInt,
                                },

                                select: {
                                    fechaVencimiento:
                                        true,
                                },
                            });

                        if (
                            facturaCache
                                ?.fechaVencimiento
                        ) {
                            const fecha =
                                fechaToIsoDateOnly(
                                    facturaCache
                                        .fechaVencimiento
                                );

                            if (
                                fecha
                            ) {
                                documento.fechaVencimiento =
                                    fecha;

                                console.log(
                                    `[COBRANZA AUTO] 🗓️ ${empresa.toUpperCase()} ${tipoDoc}-${folio} vencimiento desde FacturaDTE`,
                                    {
                                        fechaVencimiento:
                                            fecha,

                                        duracionMs:
                                            Date.now() -
                                            inicioDte,
                                    }
                                );

                                return;
                            }
                        }

                        /*
                         * Si la consulta SII automática está
                         * desactivada, no hacemos llamadas externas.
                         */
                        if (
                            !consultaSiiActiva
                        ) {
                            console.log(
                                `[COBRANZA AUTO] ⏭ ${empresa.toUpperCase()} ${tipoDoc}-${folio} sin vencimiento cacheado y consulta SII desactivada`
                            );

                            return;
                        }

                        console.log(
                            `[COBRANZA AUTO] 📡 ${empresa.toUpperCase()} buscando vencimiento DTE ${tipoDoc}-${folio}`,
                            {
                                periodo,
                            }
                        );

                        const resultadoDte =
                            await consultarDtePorFolioBaseApi({
                                empresa,

                                periodo,

                                folio,

                                tipoDTE,

                                forceRefresh:
                                    false,
                            });

                        const fecha =
                            getFechaVencimientoDesdeRespuestaDte(
                                resultadoDte
                            );

                        if (
                            fecha
                        ) {
                            /*
                             * Agregamos un alias reconocido por
                             * cobranza-estado.service.ts.
                             */
                            documento.fechaVencimiento =
                                fecha;

                            console.log(
                                `[COBRANZA AUTO] ✅ ${empresa.toUpperCase()} ${tipoDoc}-${folio} vencimiento obtenido`,
                                {
                                    fechaVencimiento:
                                        fecha,

                                    cached:
                                        resultadoDte
                                            ?.cached,

                                    duracionMs:
                                        Date.now() -
                                        inicioDte,
                                }
                            );

                            return;
                        }

                        console.warn(
                            `[COBRANZA AUTO] ⚠ ${empresa.toUpperCase()} ${tipoDoc}-${folio} DTE sin FchVenc`,
                            {
                                periodo,

                                cached:
                                    resultadoDte
                                        ?.cached,

                                duracionMs:
                                    Date.now() -
                                    inicioDte,
                            }
                        );
                    } catch (
                    error
                    ) {
                        console.error(
                            `[COBRANZA AUTO] ❌ Error obteniendo vencimiento DTE ${empresa.toUpperCase()} ${tipoDoc}-${folio}`,
                            {
                                periodo,

                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(
                                            error
                                        ),

                                duracionMs:
                                    Date.now() -
                                    inicioDte,
                            }
                        );
                    }
                }
            )
        );
    }

    logTiempo(
        `Completar vencimientos DTE ${empresa.toUpperCase()}`,
        inicio
    );
}

/* =========================================================
   CLAVE PARA CONTROL DE DUPLICADOS
========================================================= */

function getEnvioKey(
    params: {
        empresaKey: string;
        tipoRcv: string;
        tipoDoc: string;
        folio: string;
        rutContraparte: string;
        tipoRecordatorio: string;
    }
) {
    return [
        params.empresaKey,
        params.tipoRcv,
        params.tipoDoc,
        params.folio,
        params.rutContraparte,
        params.tipoRecordatorio,
    ]
        .map(
            (
                value
            ) =>
                String(
                    value ??
                    ""
                )
                    .trim()
                    .toLowerCase()
        )
        .join(
            "|"
        );
}

/* =========================================================
   PROCESAR EMPRESA
========================================================= */

async function procesarEmpresaCobranza(
    empresa: EmpresaKey,
    mesesAnalizar: number
): Promise<ResultadoCobranzaEmpresa> {
    const inicioEmpresa =
        Date.now();

    console.log(
        `[COBRANZA AUTO] ▶ Iniciando empresa ${empresa.toUpperCase()}`
    );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} meses a analizar: ${mesesAnalizar}`
    );

    /*
     * 1. Cargar configuración
     */

    const inicioConfig =
        Date.now();

    const config =
        await prisma.rcvCobranzaConfig.findUnique({
            where: {
                empresaKey:
                    empresa,
            },
        });

    logTiempo(
        `Lectura configuración ${empresa.toUpperCase()}`,
        inicioConfig
    );

    if (!config) {
        console.warn(
            `[COBRANZA AUTO] ⚠ ${empresa.toUpperCase()} sin configuración`
        );

        logTiempo(
            `Empresa ${empresa.toUpperCase()}`,
            inicioEmpresa
        );

        return {
            empresa,

            configurada:
                false,

            activa:
                false,

            envioAutomatico:
                false,

            documentosAnalizados:
                0,

            confirmadosOmitidos:
                0,

            sinFechaVencimiento:
                0,

            sinIdentificacion:
                0,

            candidatos:
                0,

            yaEnviados:
                0,

            pendientesEnvio:
                0,

            detalle:
                [],

            error:
                "No existe configuración RcvCobranzaConfig para esta empresa",
        };
    }

    console.log(
        `[COBRANZA AUTO] Config ${empresa.toUpperCase()}`,
        {
            activo:
                config.activo,

            consultaSiiActiva:
                config.consultaSiiActiva,

            envioAutomatico:
                config.envioAutomatico,

            diasPorVencer:
                config.diasPorVencer,

            diasVencidos:
                config.diasVencidos,

            horaConsultaSii:
                config.horaConsultaSii,

            horaCobranza:
                config.horaCobranza,

            adjuntarPdf:
                config.adjuntarPdf,
        }
    );

    if (
        !config.activo
    ) {
        console.log(
            `[COBRANZA AUTO] ⏭ ${empresa.toUpperCase()} automatización desactivada`
        );

        logTiempo(
            `Empresa ${empresa.toUpperCase()}`,
            inicioEmpresa
        );

        return {
            empresa,

            configurada:
                true,

            activa:
                false,

            envioAutomatico:
                config.envioAutomatico,

            documentosAnalizados:
                0,

            confirmadosOmitidos:
                0,

            sinFechaVencimiento:
                0,

            sinIdentificacion:
                0,

            candidatos:
                0,

            yaEnviados:
                0,

            pendientesEnvio:
                0,

            detalle:
                [],
        };
    }

    /*
     * 2. Cargar documentos históricos
     */

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} iniciando carga histórica`
    );

    const documentos =
        await cargarDocumentosEmpresa(
            empresa,
            mesesAnalizar
        );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} documentos cargados`,
        {
            total:
                documentos.length,
        }
    );

    /*
     * 3. Evaluar estados de forma batch
     */

    /*
 * 3. Primera evaluación de estados.
 *
 * Aquí obtenemos:
 *
 * - conciliaciones
 * - vencimientos manuales
 * - fechas que eventualmente vengan en el documento
 */

    const inicioEstados =
        Date.now();

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} evaluando estados batch inicial`
    );

    let evaluados =
        await obtenerEstadosDocumentosCobranza(
            documentos,
            "ventas",
            empresa
        );

    logTiempo(
        `Evaluación estados inicial ${empresa.toUpperCase()}`,
        inicioEstados
    );

    /*
     * 3.1 Completar las fechas faltantes desde FacturaDTE/DTE.
     */

    await completarVencimientosDesdeDte(
        empresa,
        evaluados,
        config.consultaSiiActiva
    );

    /*
     * 3.2 Reevaluar porque algunos documentos ahora
     * contienen fechaVencimiento obtenida desde DTE.
     */

    const inicioReevaluacion =
        Date.now();

    evaluados =
        await obtenerEstadosDocumentosCobranza(
            documentos,
            "ventas",
            empresa
        );

    logTiempo(
        `Reevaluación estados ${empresa.toUpperCase()}`,
        inicioReevaluacion
    );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} documentos evaluados`,
        {
            total:
                evaluados.length,
        }
    );

    /*
     * 4. Cargar recordatorios existentes
     */

    const inicioEnvios =
        Date.now();

    const enviosExistentes =
        await prisma.rcvRecordatorioEnvio.findMany({
            where: {
                empresaKey:
                    empresa,

                tipoRcv:
                    "ventas",
            },

            select: {
                empresaKey:
                    true,

                tipoRcv:
                    true,

                tipoDoc:
                    true,

                folio:
                    true,

                rutContraparte:
                    true,

                tipoRecordatorio:
                    true,
            },
        });

    logTiempo(
        `Carga recordatorios existentes ${empresa.toUpperCase()}`,
        inicioEnvios
    );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} recordatorios existentes`,
        {
            total:
                enviosExistentes.length,
        }
    );

    const enviosMap =
        new Set(
            enviosExistentes.map(
                (
                    item
                ) =>
                    getEnvioKey(
                        item
                    )
            )
        );

    /*
     * 5. Estadísticas
     */

    let confirmadosOmitidos =
        0;

    let sinFechaVencimiento =
        0;

    let sinIdentificacion =
        0;

    let yaEnviados =
        0;

    const candidatos:
        CandidatoRecordatorioCobranza[] =
        [];

    /*
     * 6. Evaluar reglas
     */

    const inicioReglas =
        Date.now();

    for (
        const {
            documento,
            estado,
        }
        of evaluados
    ) {
        if (
            estado.estadoPago ===
            "CONFIRMADA"
        ) {
            confirmadosOmitidos++;

            continue;
        }

        const tipoDoc =
            getTipoDoc(
                documento
            );

        const folio =
            getFolio(
                documento
            );

        const rutContraparte =
            getRutDocumento(
                documento
            );

        /*
 * Por ahora solamente procesamos documentos
 * directamente cobrables.
 *
 * Las Notas de Crédito (61) se manejarán
 * posteriormente contra el documento referenciado.
 */
        if (
            !esDocumentoCobrable(
                documento
            )
        ) {
            continue;
        }

        if (
            !tipoDoc ||
            !folio ||
            !rutContraparte
        ) {
            sinIdentificacion++;

            continue;
        }

        if (
            !estado.fechaVencimiento ||
            !estado.fechaVencimientoIso ||
            estado.diasDiferencia ===
            null
        ) {
            console.warn(
                "[COBRANZA AUTO] ⚠ Documento finalmente sin fecha de vencimiento",
                {
                    empresa,

                    tipoDoc,

                    folio,

                    rut:
                        rutContraparte,

                    razonSocial:
                        getRazonSocialDocumento(
                            documento
                        ),

                    periodo:
                        documento
                            ?.periodoCobranzaOrigen,

                    tipoCobrable:
                        esDocumentoCobrable(
                            documento
                        ),
                }
            );

            sinFechaVencimiento++;

            continue;
        }

        const tipoRecordatorio =
            getTipoRecordatorio(
                estado.diasDiferencia,
                config.diasPorVencer,
                config.diasVencidos
            );

        if (
            !tipoRecordatorio
        ) {
            continue;
        }

        const key =
            getEnvioKey({
                empresaKey:
                    empresa,

                tipoRcv:
                    "ventas",

                tipoDoc,

                folio,

                rutContraparte,

                tipoRecordatorio,
            });

        const yaEnviado =
            enviosMap.has(
                key
            );

        if (
            yaEnviado
        ) {
            yaEnviados++;
        }

        candidatos.push({
            empresaKey:
                empresa,

            tipoRcv:
                "ventas",

            tipoDoc,

            folio,

            rutContraparte,

            razonSocial:
                getRazonSocialDocumento(
                    documento
                ),

            montoTotal:
                getMontoTotal(
                    documento
                ),

            fechaVencimiento:
                estado.fechaVencimientoIso,

            diasDiferencia:
                estado.diasDiferencia,

            estadoPago:
                estado.estadoPago,

            tipoRecordatorio,

            yaEnviado,

            periodoOrigen:
                String(
                    documento
                        ?.periodoCobranzaOrigen ??
                    ""
                ),
        });
    }

    logTiempo(
        `Evaluación reglas ${empresa.toUpperCase()}`,
        inicioReglas
    );

    const pendientesEnvio =
        candidatos.filter(
            (
                item
            ) =>
                !item.yaEnviado
        ).length;

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} resumen`,
        {
            documentosAnalizados:
                documentos.length,

            confirmadosOmitidos,

            sinFechaVencimiento,

            sinIdentificacion,

            candidatos:
                candidatos.length,

            yaEnviados,

            pendientesEnvio,
        }
    );

    logTiempo(
        `Empresa ${empresa.toUpperCase()}`,
        inicioEmpresa
    );

    return {
        empresa,

        configurada:
            true,

        activa:
            config.activo,

        envioAutomatico:
            config.envioAutomatico,

        documentosAnalizados:
            documentos.length,

        confirmadosOmitidos,

        sinFechaVencimiento,

        sinIdentificacion,

        candidatos:
            candidatos.length,

        yaEnviados,

        pendientesEnvio,

        detalle:
            candidatos,
    };
}

/* =========================================================
   PROCESO PRINCIPAL
========================================================= */

export async function procesarCobranzaAutomatica(
    options?: {
        mesesAnalizar?: number;
        empresas?: EmpresaKey[];
    }
): Promise<ResultadoCobranzaAutomatica> {
    const inicioProceso =
        Date.now();

    const mesesAnalizar =
        Math.max(
            1,
            Math.min(
                Number(
                    options?.mesesAnalizar ??
                    12
                ),
                24
            )
        );

    const empresas =
        options?.empresas ??
        [
            "econnet",
            "rids",
        ];

    const resultados:
        ResultadoCobranzaEmpresa[] =
        [];

    console.log(
        "[COBRANZA AUTO] ========================================"
    );

    console.log(
        "[COBRANZA AUTO] INICIO PROCESO"
    );

    console.log(
        "[COBRANZA AUTO] ========================================"
    );

    console.log(
        "[COBRANZA AUTO] Configuración proceso",
        {
            mesesAnalizar,

            empresas,

            iniciadoAt:
                new Date()
                    .toISOString(),
        }
    );

    for (
        const empresa
        of empresas
    ) {
        try {
            console.log(
                "[COBRANZA AUTO] ----------------------------------------"
            );

            console.log(
                `[COBRANZA AUTO] Analizando ${empresa.toUpperCase()}`
            );

            const resultado =
                await procesarEmpresaCobranza(
                    empresa,
                    mesesAnalizar
                );

            resultados.push(
                resultado
            );

            console.log(
                `[COBRANZA AUTO] ${empresa.toUpperCase()} finalizado`,
                {
                    documentos:
                        resultado.documentosAnalizados,

                    candidatos:
                        resultado.candidatos,

                    yaEnviados:
                        resultado.yaEnviados,

                    pendientes:
                        resultado.pendientesEnvio,
                }
            );
        } catch (
        error
        ) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    );

            console.error(
                `[COBRANZA AUTO] ❌ Error procesando ${empresa.toUpperCase()}`,
                {
                    error:
                        message,
                }
            );

            resultados.push({
                empresa,

                configurada:
                    false,

                activa:
                    false,

                envioAutomatico:
                    false,

                documentosAnalizados:
                    0,

                confirmadosOmitidos:
                    0,

                sinFechaVencimiento:
                    0,

                sinIdentificacion:
                    0,

                candidatos:
                    0,

                yaEnviados:
                    0,

                pendientesEnvio:
                    0,

                detalle:
                    [],

                error:
                    message,
            });
        }
    }

    const totalDocumentos =
        resultados.reduce(
            (
                total,
                item
            ) =>
                total +
                item.documentosAnalizados,
            0
        );

    const totalCandidatos =
        resultados.reduce(
            (
                total,
                item
            ) =>
                total +
                item.candidatos,
            0
        );

    const totalYaEnviados =
        resultados.reduce(
            (
                total,
                item
            ) =>
                total +
                item.yaEnviados,
            0
        );

    const totalPendientesEnvio =
        resultados.reduce(
            (
                total,
                item
            ) =>
                total +
                item.pendientesEnvio,
            0
        );

    const resultadoFinal:
        ResultadoCobranzaAutomatica =
    {
        modo:
            "SIMULACION",

        generadoAt:
            new Date(),

        mesesAnalizados:
            mesesAnalizar,

        empresas:
            resultados,

        totalDocumentos,

        totalCandidatos,

        totalYaEnviados,

        totalPendientesEnvio,
    };

    console.log(
        "[COBRANZA AUTO] ========================================"
    );

    console.log(
        "[COBRANZA AUTO] RESUMEN FINAL",
        {
            totalDocumentos,

            totalCandidatos,

            totalYaEnviados,

            totalPendientesEnvio,

            generadoAt:
                resultadoFinal
                    .generadoAt
                    .toISOString(),
        }
    );

    logTiempo(
        "Proceso completo",
        inicioProceso
    );

    console.log(
        "[COBRANZA AUTO] ========================================"
    );

    console.log(
        "[COBRANZA AUTO] FIN PROCESO"
    );

    console.log(
        "[COBRANZA AUTO] ========================================"
    );

    return resultadoFinal;
}