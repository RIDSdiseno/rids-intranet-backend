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

import {
    obtenerAplicacionesNotasCredito,
} from "./cobranza-notas-credito.service.js";

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

export type DestinatarioCobranza = {
    contactoId: number;

    nombre: string;

    email: string;

    cargo: string | null;

    principal: boolean;
};

export type CandidatoRecordatorioCobranza = {
    empresaKey: EmpresaKey;

    tipoRcv: "ventas";

    tipoDoc: string;
    folio: string;

    rutContraparte: string;
    razonSocial: string | null;

    montoTotal: number;

    montoOriginal:
    number;

    montoNotasCredito:
    number;

    montoPendiente:
    number;

    notasCreditoAplicadas:
    {
        folio:
        string;

        montoTotal:
        number;

        codigoRef:
        string | null;

        razonRef:
        string | null;
    }[];

    fechaVencimiento: string;
    diasDiferencia: number;

    origenVencimiento:
    | "MANUAL"
    | "DTE_CACHE"
    | "DTE"
    | "DIAS_CREDITO"
    | "RCV"
    | "DESCONOCIDO";

    diasCredito:
    number | null;

    estadoPago:
    | "PENDIENTE"
    | "VENCIDA";

    tipoRecordatorio:
    TipoRecordatorioCobranza;

    yaEnviado: boolean;

    recordatoriosPendientes: number;

    recordatoriosEnviados: number;

    recordatoriosError: number;

    periodoOrigen: string;

    empresaClienteId: number | null;

    empresaClienteNombre: string | null;

    destinatarios: DestinatarioCobranza[];

    tieneDestinatarioCobranza: boolean;
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

    candidatosConDestinatario: number;

    candidatosSinDestinatario: number;

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

function getFechaDocumentoRaw(
    doc: any
): unknown {
    return (
        doc?.["Fecha Docto"] ??
        doc?.["Fecha Documento"] ??
        doc?.fechaDocto ??
        doc?.fechaDocumento ??
        doc?.fechaEmision ??
        null
    );
}

/*
 * Convierte una fecha a YYYY-MM-DD sin depender
 * de la zona horaria del servidor.
 *
 * Soporta especialmente:
 * DD/MM/YYYY
 * YYYY-MM-DD
 */
function parseFechaDocumentoIso(
    value: unknown
): string | null {
    if (!value) {
        return null;
    }

    const raw =
        String(
            value
        ).trim();

    if (!raw) {
        return null;
    }

    const iso =
        /^(\d{4})-(\d{2})-(\d{2})/.exec(
            raw
        );

    if (iso) {
        const ano =
            Number(
                iso[1]
            );

        const mes =
            Number(
                iso[2]
            );

        const dia =
            Number(
                iso[3]
            );

        if (
            !ano ||
            !mes ||
            !dia
        ) {
            return null;
        }

        return [
            String(
                ano
            ).padStart(
                4,
                "0"
            ),
            String(
                mes
            ).padStart(
                2,
                "0"
            ),
            String(
                dia
            ).padStart(
                2,
                "0"
            ),
        ].join("-");
    }

    const chilena =
        /^(\d{2})\/(\d{2})\/(\d{4})/.exec(
            raw
        );

    if (chilena) {
        const dia =
            Number(
                chilena[1]
            );

        const mes =
            Number(
                chilena[2]
            );

        const ano =
            Number(
                chilena[3]
            );

        const fecha =
            new Date(
                Date.UTC(
                    ano,
                    mes - 1,
                    dia
                )
            );

        if (
            fecha.getUTCFullYear() !==
            ano ||
            fecha.getUTCMonth() !==
            mes - 1 ||
            fecha.getUTCDate() !==
            dia
        ) {
            return null;
        }

        return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }

    return null;
}

function isoDateOnlyToUtcDate(
    fechaIso: string
): Date | null {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            fechaIso
        );

    if (
        !match
    ) {
        return null;
    }

    const ano =
        Number(
            match[1]
        );

    const mes =
        Number(
            match[2]
        );

    const dia =
        Number(
            match[3]
        );

    const fecha =
        new Date(
            Date.UTC(
                ano,
                mes - 1,
                dia
            )
        );

    if (
        fecha.getUTCFullYear() !==
        ano ||
        fecha.getUTCMonth() !==
        mes - 1 ||
        fecha.getUTCDate() !==
        dia
    ) {
        return null;
    }

    return fecha;
}

function sumarDiasFechaIso(
    fechaIso: string,
    dias: number
): string | null {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            fechaIso
        );

    if (!match) {
        return null;
    }

    const ano =
        Number(
            match[1]
        );

    const mes =
        Number(
            match[2]
        );

    const dia =
        Number(
            match[3]
        );

    if (
        !Number.isFinite(
            dias
        )
    ) {
        return null;
    }

    const fecha =
        new Date(
            Date.UTC(
                ano,
                mes - 1,
                dia
            )
        );

    fecha.setUTCDate(
        fecha.getUTCDate() +
        dias
    );

    return [
        fecha
            .getUTCFullYear(),
        String(
            fecha.getUTCMonth() +
            1
        ).padStart(
            2,
            "0"
        ),
        String(
            fecha.getUTCDate()
        ).padStart(
            2,
            "0"
        ),
    ].join("-");
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
            value.getUTCFullYear();

        const mes =
            String(
                value.getUTCMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const dia =
            String(
                value.getUTCDate()
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
    /*
     * =====================================================
     * CATCH-UP DE RECORDATORIOS
     * =====================================================
     *
     * En lugar de exigir que diasDiferencia coincida
     * exactamente con uno de los días configurados,
     * buscamos la etapa MÁS RECIENTE que ya debería
     * haberse ejecutado.
     *
     * Ejemplo:
     *
     * diasPorVencer = [-7, -3]
     *
     * diasDiferencia = -5
     * → corresponde etapa -7
     *
     * diasDiferencia = -2
     * → corresponde etapa -3
     *
     *
     * diasVencidos = [0, 3, 7, 15, 30]
     *
     * diasDiferencia = 4
     * → corresponde etapa +3
     *
     * diasDiferencia = 10
     * → corresponde etapa +7
     *
     * Esto permite recuperar automáticamente
     * recordatorios que no fueron preparados
     * exactamente el día configurado.
     */

    if (
        !Number.isFinite(
            diasDiferencia
        )
    ) {
        return null;
    }

    /*
     * =====================================================
     * 1. FACTURA AÚN NO VENCIDA
     * =====================================================
     */

    if (
        diasDiferencia <
        0
    ) {
        /*
         * Nos quedamos únicamente con etapas negativas
         * válidas y eliminamos posibles duplicados.
         */
        const etapasPorVencer =
            [
                ...new Set(
                    diasPorVencer.filter(
                        (
                            dias
                        ) =>
                            Number.isFinite(
                                dias
                            ) &&
                            dias <
                            0
                    )
                ),
            ];

        /*
         * Una etapa ya es aplicable cuando:
         *
         * etapa <= diasDiferencia
         *
         * Ejemplo:
         *
         * hoy = -5
         *
         * -7 <= -5  → sí
         * -3 <= -5  → no
         *
         * Por lo tanto corresponde -7.
         */
        const etapasAplicables =
            etapasPorVencer.filter(
                (
                    etapa
                ) =>
                    etapa <=
                    diasDiferencia
            );

        if (
            etapasAplicables.length ===
            0
        ) {
            return null;
        }

        /*
         * Elegimos la etapa más cercana al día actual.
         *
         * [-7, -3]
         *
         * si ambas son aplicables:
         * Math.max(...) = -3
         */
        const etapa =
            Math.max(
                ...etapasAplicables
            );

        const dias =
            Math.abs(
                etapa
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

    /*
 * =====================================================
 * 2. FACTURA VENCE EXACTAMENTE HOY
 * =====================================================
 */

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

    /*
     * =====================================================
     * 3. FACTURA YA VENCIDA
     * =====================================================
     *
     * IMPORTANTE:
     *
     * El día 0 ("VENCE_HOY") no participa del catch-up
     * una vez que la factura ya está vencida.
     *
     * Ejemplo:
     *
     * diasVencidos = [0, 3, 7, 15, 30]
     *
     * +1 → ninguna etapa
     * +2 → ninguna etapa
     * +3 → VENCIDA_3_DIAS
     * +4 → VENCIDA_3_DIAS (catch-up)
     * +8 → VENCIDA_7_DIAS (catch-up)
     */

    const etapasVencidas =
        [
            ...new Set(
                diasVencidos.filter(
                    (
                        dias
                    ) =>
                        Number.isFinite(
                            dias
                        ) &&
                        dias >
                        0
                )
            ),
        ];

    /*
     * Seleccionamos únicamente las etapas vencidas
     * que ya deberían haberse ejecutado.
     */
    const etapasAplicables =
        etapasVencidas.filter(
            (
                etapa
            ) =>
                etapa <=
                diasDiferencia
        );

    if (
        etapasAplicables.length ===
        0
    ) {
        return null;
    }

    /*
     * Nos quedamos con la etapa más reciente.
     */
    const etapa =
        Math.max(
            ...etapasAplicables
        );

    if (
        etapa ===
        3
    ) {
        return "VENCIDA_3_DIAS";
    }

    if (
        etapa ===
        7
    ) {
        return "VENCIDA_7_DIAS";
    }

    if (
        etapa ===
        15
    ) {
        return "VENCIDA_15_DIAS";
    }

    if (
        etapa ===
        30
    ) {
        return "VENCIDA_30_DIAS";
    }

    return `VENCIDA_${etapa}_DIAS`;
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
   COMPLETAR VENCIMIENTOS
========================================================= */

async function completarVencimientosCobranza(
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
     * Solo documentos que todavía no tienen vencimiento,
     * no están conciliados y son cobrables.
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

                return Boolean(
                    tipoDoc &&
                    folio
                );
            }
        );

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} documentos que requieren resolver vencimiento`,
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
     * =====================================================
     * 1. Cargar FacturaDTE cacheadas EN BATCH
     * =====================================================
     */

    const tiposDte =
        [
            ...new Set(
                pendientes
                    .map(
                        ({
                            documento,
                        }) =>
                            Number(
                                getTipoDoc(
                                    documento
                                )
                            )
                    )
                    .filter(
                        Number.isFinite
                    )
            ),
        ];

    const folios =
        [
            ...new Set(
                pendientes
                    .map(
                        ({
                            documento,
                        }) =>
                            Number(
                                getFolio(
                                    documento
                                )
                            )
                    )
                    .filter(
                        Number.isFinite
                    )
            ),
        ];

    const facturasCache =
        tiposDte.length >
            0 &&
            folios.length >
            0
            ? await prisma.facturaDTE.findMany({
                where: {
                    empresaAlias:
                        empresa,

                    tipoDTE: {
                        in:
                            tiposDte,
                    },

                    folio: {
                        in:
                            folios,
                    },
                },

                select: {
                    tipoDTE:
                        true,

                    folio:
                        true,

                    fechaVencimiento:
                        true,
                },
            })
            : [];

    const facturaCacheMap =
        new Map<
            string,
            {
                existe: boolean;
                fechaVencimiento:
                Date | null;
            }
        >();

    for (
        const factura
        of facturasCache
    ) {
        facturaCacheMap.set(
            `${factura.tipoDTE}|${factura.folio}`,
            {
                existe:
                    true,

                fechaVencimiento:
                    factura.fechaVencimiento,
            }
        );
    }

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} FacturaDTE cacheadas`,
        {
            total:
                facturasCache.length,

            conVencimiento:
                facturasCache.filter(
                    (item) =>
                        Boolean(
                            item.fechaVencimiento
                        )
                ).length,
        }
    );

    /*
     * =====================================================
     * 2. Cargar días de crédito de clientes EN BATCH
     * =====================================================
     *
     * Se cargan solamente registros que tengan diasCredito.
     *
     * Luego normalizamos el RUT en memoria para que:
     *
     * 77.581.503-5
     * 77581503-5
     * 775815035
     *
     * sean considerados el mismo RUT.
     */

    const detallesEmpresa =
        await prisma.detalleEmpresa.findMany({
            where: {
                diasCredito: {
                    not:
                        null,
                },
            },

            select: {
                rut:
                    true,

                diasCredito:
                    true,
            },
        });

    const diasCreditoPorRut =
        new Map<
            string,
            number
        >();

    for (
        const detalle
        of detallesEmpresa
    ) {
        if (
            detalle.diasCredito ===
            null
        ) {
            continue;
        }

        diasCreditoPorRut.set(
            normalizeRut(
                detalle.rut
            ),
            detalle.diasCredito
        );
    }

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} clientes con días de crédito configurados`,
        {
            total:
                diasCreditoPorRut.size,
        }
    );

    /*
     * Documentos que aún no podemos resolver
     * después de revisar cache + días de crédito.
     */
    const pendientesConsultaDte:
        typeof pendientes =
        [];

    /*
     * =====================================================
     * 3. Resolver:
     *
     *    FacturaDTE cache
     *             ↓
     *    diasCredito
     *             ↓
     *    pendiente consulta externa
     * =====================================================
     */

    let resueltosDesdeDteCache = 0;

    let resueltosDesdeDiasCredito = 0;

    let dteCacheadoSinVencimiento = 0;

    for (
        const item
        of pendientes
    ) {
        const {
            documento,
        } =
            item;

        const tipoDoc =
            getTipoDoc(
                documento
            );

        const folio =
            getFolio(
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

        /*
         * -----------------------------------------------
         * A. FacturaDTE cacheada con FchVenc
         * -----------------------------------------------
         */

        const facturaDteCache =
            facturaCacheMap.get(
                `${tipoDTE}|${folioInt}`
            );

        if (
            facturaDteCache
                ?.fechaVencimiento
        ) {
            const fecha =
                fechaToIsoDateOnly(
                    facturaDteCache
                        .fechaVencimiento
                );

            if (
                fecha
            ) {
                documento.fechaVencimiento =
                    fecha;

                documento.origenVencimientoCobranza =
                    "DTE_CACHE";

                resueltosDesdeDteCache++;

                console.log(
                    `[COBRANZA AUTO] 🗓️ ${empresa.toUpperCase()} ${tipoDoc}-${folio} vencimiento desde FacturaDTE`,
                    {
                        fechaVencimiento:
                            fecha,
                    }
                );

                continue;
            }
        }

        /*
         * -----------------------------------------------
         * B. Días de crédito del cliente
         * -----------------------------------------------
         */

        const rut =
            getRutDocumento(
                documento
            );

        const diasCredito =
            diasCreditoPorRut.get(
                rut
            );

        if (
            diasCredito !==
            undefined &&
            diasCredito !==
            null &&
            diasCredito >=
            0
        ) {
            const fechaDocumento =
                parseFechaDocumentoIso(
                    getFechaDocumentoRaw(
                        documento
                    )
                );

            if (
                fechaDocumento
            ) {
                const fechaVencimiento =
                    sumarDiasFechaIso(
                        fechaDocumento,
                        diasCredito
                    );

                if (
                    fechaVencimiento
                ) {
                    documento.fechaVencimiento =
                        fechaVencimiento;

                    documento.origenVencimientoCobranza =
                        "DIAS_CREDITO";

                    documento.diasCreditoCobranza =
                        diasCredito;

                    resueltosDesdeDiasCredito++;

                    console.log(
                        `[COBRANZA AUTO] 📅 ${empresa.toUpperCase()} ${tipoDoc}-${folio} vencimiento calculado por días de crédito`,
                        {
                            rut,
                            fechaDocumento,
                            diasCredito,
                            fechaVencimiento,
                        }
                    );

                    continue;
                }
            } else {
                console.warn(
                    `[COBRANZA AUTO] ⚠ ${empresa.toUpperCase()} ${tipoDoc}-${folio} tiene días de crédito pero Fecha Docto inválida`,
                    {
                        rut,

                        diasCredito,

                        fechaDocumentoRaw:
                            getFechaDocumentoRaw(
                                documento
                            ),
                    }
                );
            }
        }

        /*
 * Si el DTE ya está cacheado y sabemos que no
 * contiene FchVenc, no tiene sentido volver a
 * pasar por consultarDtePorFolioBaseApi().
 */
        if (
            facturaDteCache?.existe
        ) {
            dteCacheadoSinVencimiento++;

            console.log(
                `[COBRANZA AUTO] ⏭ ${empresa.toUpperCase()} ${tipoDoc}-${folio} DTE ya cacheado sin FchVenc y cliente sin días de crédito`
            );

            continue;
        }

        /*
         * No pudimos resolverlo con información local.
         */
        pendientesConsultaDte.push(
            item
        );
    }

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} resolución local de vencimientos`,
        {
            totalInicial:
                pendientes.length,

            desdeDteCache:
                resueltosDesdeDteCache,

            desdeDiasCredito:
                resueltosDesdeDiasCredito,

            dteCacheadoSinVencimiento,

            pendientesConsultaDte:
                pendientesConsultaDte.length,

            totalConVencimientoResuelto:
                resueltosDesdeDteCache +
                resueltosDesdeDiasCredito,
        }
    );

    /*
     * =====================================================
     * 4. Si consulta SII está desactivada, terminamos.
     * =====================================================
     */

    if (
        !consultaSiiActiva ||
        pendientesConsultaDte.length ===
        0
    ) {
        if (
            !consultaSiiActiva &&
            pendientesConsultaDte.length >
            0
        ) {
            console.log(
                `[COBRANZA AUTO] ⏭ ${empresa.toUpperCase()} ${pendientesConsultaDte.length} documentos quedaron sin vencimiento y consulta SII está desactivada`
            );
        }

        logTiempo(
            `Completar vencimientos ${empresa.toUpperCase()}`,
            inicio
        );

        return;
    }

    /*
     * =====================================================
     * 5. Último fallback:
     *    consultar DTE BaseAPI.
     *
     * Solamente para documentos que:
     *
     * - no tenían override manual
     * - no tenían FchVenc cacheado
     * - no tenían diasCredito configurado/utilizable
     * =====================================================
     */

    console.log(
        `[COBRANZA AUTO] ${empresa.toUpperCase()} documentos que requieren consulta DTE externa`,
        {
            total:
                pendientesConsultaDte.length,
        }
    );

    const CONCURRENCIA_DTE =
        3;

    for (
        let i = 0;
        i <
        pendientesConsultaDte.length;
        i +=
        CONCURRENCIA_DTE
    ) {
        const grupo =
            pendientesConsultaDte.slice(
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
                        ) ||
                        !periodo
                    ) {
                        return;
                    }

                    const inicioDte =
                        Date.now();

                    try {
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
                            documento.fechaVencimiento =
                                fecha;

                            documento.origenVencimientoCobranza =
                                "DTE";

                            console.log(
                                `[COBRANZA AUTO] ✅ ${empresa.toUpperCase()} ${tipoDoc}-${folio} vencimiento obtenido desde DTE`,
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
        `Completar vencimientos ${empresa.toUpperCase()}`,
        inicio
    );
}

/* =========================================================
   RESOLVER DESTINATARIOS DE COBRANZA
========================================================= */

async function resolverDestinatariosCobranza(
    candidatos:
        CandidatoRecordatorioCobranza[]
) {
    if (
        candidatos.length ===
        0
    ) {
        return;
    }

    const inicio =
        Date.now();

    /*
     * Consultamos desde Empresa y no desde DetalleEmpresa.
     *
     * Esto evita que un DetalleEmpresa huérfano
     * provoque:
     *
     * "Field empresa is required to return data,
     * got null instead"
     *
     * especialmente porque usamos:
     *
     * relationMode = "prisma"
     */

    const empresasClientes =
        await prisma.empresa.findMany({
            where: {
                detalleEmpresa: {
                    isNot:
                        null,
                },
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                isActive:
                    true,

                recibeCobranza:
                    true,

                detalleEmpresa: {
                    select: {
                        rut:
                            true,
                    },
                },

                contactoEmpresas: {
                    where: {
                        recibeCobranza:
                            true,
                    },

                    select: {
                        id:
                            true,

                        nombre:
                            true,

                        cargo:
                            true,

                        email:
                            true,

                        principal:
                            true,
                    },
                },
            },
        });

    /*
     * Indexar empresas por RUT normalizado.
     */
    const empresasPorRut =
        new Map<
            string,
            (typeof empresasClientes)[number]
        >();

    for (
        const empresaCliente
        of empresasClientes
    ) {
        const rut =
            normalizeRut(
                empresaCliente
                    .detalleEmpresa
                    ?.rut
            );

        if (
            !rut
        ) {
            continue;
        }

        empresasPorRut.set(
            rut,
            empresaCliente
        );
    }

    console.log(
        "[COBRANZA AUTO] Empresas CRM disponibles para cobranza",
        {
            total:
                empresasPorRut.size,
        }
    );

    let conDestinatario =
        0;

    let sinDestinatario =
        0;

    for (
        const candidato
        of candidatos
    ) {
        const rut =
            normalizeRut(
                candidato
                    .rutContraparte
            );

        const empresaCliente =
            empresasPorRut.get(
                rut
            );

        /*
         * -----------------------------------------------
         * A. No existe empresa CRM para ese RUT
         * -----------------------------------------------
         */
        if (
            !empresaCliente
        ) {
            candidato.empresaClienteId =
                null;

            candidato.empresaClienteNombre =
                null;

            candidato.destinatarios =
                [];

            candidato.tieneDestinatarioCobranza =
                false;

            sinDestinatario++;

            console.warn(
                "[COBRANZA AUTO] ⚠ Candidato sin empresa CRM asociada",
                {
                    rut,

                    razonSocial:
                        candidato
                            .razonSocial,

                    tipoDoc:
                        candidato
                            .tipoDoc,

                    folio:
                        candidato
                            .folio,
                }
            );

            continue;
        }

        candidato.empresaClienteId =
            empresaCliente
                .id_empresa;

        candidato.empresaClienteNombre =
            empresaCliente
                .nombre;

        /*
         * -----------------------------------------------
         * B. Empresa desactivada
         * -----------------------------------------------
         */
        if (
            !empresaCliente
                .isActive
        ) {
            candidato.destinatarios =
                [];

            candidato.tieneDestinatarioCobranza =
                false;

            sinDestinatario++;

            console.warn(
                "[COBRANZA AUTO] ⏭ Empresa cliente inactiva, no se usará para cobranza",
                {
                    empresaId:
                        empresaCliente
                            .id_empresa,

                    empresa:
                        empresaCliente
                            .nombre,

                    rut,

                    folio:
                        candidato
                            .folio,
                }
            );

            continue;
        }

        /*
         * -----------------------------------------------
         * C. Cobranza deshabilitada para la empresa
         * -----------------------------------------------
         */
        if (
            !empresaCliente
                .recibeCobranza
        ) {
            candidato.destinatarios =
                [];

            candidato.tieneDestinatarioCobranza =
                false;

            sinDestinatario++;

            console.warn(
                "[COBRANZA AUTO] ⏭ Empresa con cobranza deshabilitada",
                {
                    empresaId:
                        empresaCliente
                            .id_empresa,

                    empresa:
                        empresaCliente
                            .nombre,

                    rut,

                    folio:
                        candidato
                            .folio,
                }
            );

            continue;
        }

        /*
         * -----------------------------------------------
         * D. Preparar contactos de cobranza
         * -----------------------------------------------
         *
         * La consulta Prisma ya dejó solamente:
         *
         * recibeCobranza = true
         */

        const emailsUsados =
            new Set<string>();

        const destinatarios:
            DestinatarioCobranza[] =
            [];

        for (
            const contacto
            of empresaCliente
                .contactoEmpresas
        ) {
            const email =
                String(
                    contacto.email ??
                    ""
                )
                    .trim()
                    .toLowerCase();

            /*
             * Contacto sin email.
             */
            if (
                !email
            ) {
                continue;
            }

            /*
             * Evitar destinatarios repetidos.
             */
            if (
                emailsUsados.has(
                    email
                )
            ) {
                continue;
            }

            emailsUsados.add(
                email
            );

            destinatarios.push({
                contactoId:
                    contacto.id,

                nombre:
                    contacto.nombre,

                email,

                cargo:
                    contacto.cargo ??
                    null,

                principal:
                    contacto.principal,
            });
        }

        /*
         * Contacto principal primero.
         */
        destinatarios.sort(
            (
                a,
                b
            ) =>
                Number(
                    b.principal
                ) -
                Number(
                    a.principal
                )
        );

        candidato.destinatarios =
            destinatarios;

        candidato.tieneDestinatarioCobranza =
            destinatarios.length >
            0;

        /*
         * -----------------------------------------------
         * E. Resultado
         * -----------------------------------------------
         */
        if (
            candidato
                .tieneDestinatarioCobranza
        ) {
            conDestinatario++;

            console.log(
                "[COBRANZA AUTO] 📧 Destinatarios resueltos",
                {
                    empresaId:
                        candidato
                            .empresaClienteId,

                    empresa:
                        candidato
                            .empresaClienteNombre,

                    rut,

                    tipoDoc:
                        candidato
                            .tipoDoc,

                    folio:
                        candidato
                            .folio,

                    destinatarios:
                        destinatarios.map(
                            (
                                destinatario
                            ) => ({
                                contactoId:
                                    destinatario
                                        .contactoId,

                                nombre:
                                    destinatario
                                        .nombre,

                                email:
                                    destinatario
                                        .email,

                                principal:
                                    destinatario
                                        .principal,
                            })
                        ),
                }
            );
        } else {
            sinDestinatario++;

            console.warn(
                "[COBRANZA AUTO] ⚠ Empresa habilitada para cobranza pero sin contactos destinatarios válidos",
                {
                    empresaId:
                        candidato
                            .empresaClienteId,

                    empresa:
                        candidato
                            .empresaClienteNombre,

                    rut,

                    tipoDoc:
                        candidato
                            .tipoDoc,

                    folio:
                        candidato
                            .folio,
                }
            );
        }
    }

    console.log(
        "[COBRANZA AUTO] Resolución destinatarios finalizada",
        {
            candidatos:
                candidatos.length,

            conDestinatario,

            sinDestinatario,
        }
    );

    logTiempo(
        "Resolución destinatarios cobranza",
        inicio
    );
}

async function cargarEstadoRecordatorios(
    empresa: EmpresaKey,

    candidatos:
        CandidatoRecordatorioCobranza[]
) {
    const registros =
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

                cicloVencimiento:
                    true,

                tipoRecordatorio:
                    true,

                emailDestino:
                    true,

                estado:
                    true,

                enviadoAt:
                    true,
            },
        });

    const registrosMap =
        new Map(
            registros.map(
                (
                    registro
                ) => [
                        getEnvioKey(
                            registro
                        ),

                        registro,
                    ]
            )
        );

    for (
        const candidato
        of candidatos
    ) {
        let pendientes =
            0;

        let enviados =
            0;

        let errores =
            0;

        for (
            const destinatario
            of candidato
                .destinatarios
        ) {
            const key =
                getEnvioKey({
                    empresaKey:
                        candidato
                            .empresaKey,

                    tipoRcv:
                        candidato
                            .tipoRcv,

                    tipoDoc:
                        candidato
                            .tipoDoc,

                    folio:
                        candidato
                            .folio,

                    rutContraparte:
                        candidato
                            .rutContraparte,

                    cicloVencimiento:
                        candidato
                            .fechaVencimiento,

                    tipoRecordatorio:
                        candidato
                            .tipoRecordatorio,

                    emailDestino:
                        destinatario
                            .email,
                });

            const registro =
                registrosMap.get(
                    key
                );

            if (
                !registro
            ) {
                continue;
            }

            if (
                registro.estado ===
                "ENVIADO" ||
                registro.enviadoAt
            ) {
                enviados++;

                continue;
            }

            if (
                registro.estado ===
                "ERROR"
            ) {
                errores++;

                continue;
            }

            pendientes++;
        }

        candidato.recordatoriosPendientes =
            pendientes;

        candidato.recordatoriosEnviados =
            enviados;

        candidato.recordatoriosError =
            errores;

        /*
         * Una factura se considera totalmente enviada
         * solamente si TODOS sus destinatarios válidos
         * tienen el recordatorio enviado.
         */
        candidato.yaEnviado =
            candidato
                .destinatarios
                .length >
            0 &&
            enviados ===
            candidato
                .destinatarios
                .length;
    }
}

/* =========================================================
   REGISTRAR RECORDATORIOS PENDIENTES
========================================================= */

async function registrarRecordatoriosPendientes(
    empresa: EmpresaKey,

    candidatos:
        CandidatoRecordatorioCobranza[]
) {
    const inicio =
        Date.now();

    /*
     * Solamente candidatos que tienen al menos
     * un destinatario válido.
     */
    const candidatosEnviables =
        candidatos.filter(
            (
                candidato
            ) =>
                candidato
                    .tieneDestinatarioCobranza &&
                candidato
                    .destinatarios
                    .length >
                0
        );

    if (
        candidatosEnviables.length ===
        0
    ) {
        console.log(
            `[COBRANZA AUTO] ${empresa.toUpperCase()} no hay recordatorios pendientes para registrar`
        );

        return {
            creados:
                0,

            existentes:
                0,
        };
    }

    /*
     * Construimos una fila por destinatario.
     */
    const registros =
        candidatosEnviables.flatMap(
            (
                candidato
            ) => {
                const fechaVencimiento =
                    isoDateOnlyToUtcDate(
                        candidato
                            .fechaVencimiento
                    );

                return candidato
                    .destinatarios
                    .map(
                        (
                            destinatario
                        ) => ({
                            empresaKey:
                                candidato
                                    .empresaKey,

                            tipoRcv:
                                candidato
                                    .tipoRcv,

                            tipoDoc:
                                candidato
                                    .tipoDoc,

                            folio:
                                candidato
                                    .folio,

                            rutContraparte:
                                candidato
                                    .rutContraparte,

                            razonSocial:
                                candidato
                                    .razonSocial,

                            tipoRecordatorio:
                                candidato
                                    .tipoRecordatorio,

                            cicloVencimiento:
                                candidato
                                    .fechaVencimiento,

                            emailDestino:
                                destinatario
                                    .email,

                            nombreDestino:
                                destinatario
                                    .nombre,

                            /*
                             * Todavía no estamos generando
                             * el asunto definitivo.
                             */
                            asunto:
                                null,

                            estado:
                                "PENDIENTE",

                            automatico:
                                true,

                            fechaVencimiento,

                            diasDiferencia:
                                candidato
                                    .diasDiferencia,

                            montoTotal:
                                Math.round(
                                    candidato
                                        .montoTotal
                                ),

                            intentos:
                                0,

                            ultimoIntentoAt:
                                null,

                            procesandoAt:
                                null,

                            enviadoAt:
                                null,

                            error:
                                null,
                        })
                    );
            }
        );

    /*
     * Consultamos cuáles ya existen.
     *
     * No usamos todavía createMany a ciegas para
     * poder entregar métricas claras.
     */
    const existentesDb =
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

                cicloVencimiento:
                    true,

                tipoRecordatorio:
                    true,

                emailDestino:
                    true,
            },
        });

    const existentesMap =
        new Set(
            existentesDb.map(
                (
                    item
                ) =>
                    getEnvioKey(
                        item
                    )
            )
        );

    const nuevos =
        registros.filter(
            (
                registro
            ) => {
                const key =
                    getEnvioKey(
                        registro
                    );

                return !existentesMap.has(
                    key
                );
            }
        );

    if (
        nuevos.length >
        0
    ) {
        await prisma.rcvRecordatorioEnvio.createMany({
            data:
                nuevos,

            /*
             * Protección adicional en PostgreSQL
             * frente a carreras / ejecuciones repetidas.
             */
            skipDuplicates:
                true,
        });
    }

    console.log(
        `[COBRANZA AUTO] 📝 ${empresa.toUpperCase()} recordatorios preparados`,
        {
            candidatosEnviables:
                candidatosEnviables.length,

            registrosEsperados:
                registros.length,

            nuevos:
                nuevos.length,

            existentes:
                registros.length -
                nuevos.length,

            /*
             * IMPORTANTE:
             * en esta etapa no se envía correo.
             */
            emailsEnviados:
                0,
        }
    );

    logTiempo(
        `Registrar recordatorios ${empresa.toUpperCase()}`,
        inicio
    );

    return {
        creados:
            nuevos.length,

        existentes:
            registros.length -
            nuevos.length,
    };
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
        cicloVencimiento: string;
        tipoRecordatorio: string;
        emailDestino: string;
    }
) {
    return [
        params.empresaKey,
        params.tipoRcv,
        params.tipoDoc,
        params.folio,
        params.rutContraparte,
        params.cicloVencimiento,
        params.tipoRecordatorio,
        params.emailDestino,
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
    mesesAnalizar: number,
    registrarPendientes = false
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

            candidatosConDestinatario:
                0,

            candidatosSinDestinatario:
                0,

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

            candidatosConDestinatario:
                0,

            candidatosSinDestinatario:
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

    await completarVencimientosCobranza(
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
 * 3.3 Resolver efectos documentales:
 *
 * - Notas de Crédito aplicadas
 * - Notas de Crédito anuladas por ND
 * - Notas de Débito que solamente revierten una NC
 */
    const resultadoNotasCredito =
        await obtenerAplicacionesNotasCredito({
            empresa,

            documentos,

            consultaSiiActiva:
                config
                    .consultaSiiActiva,
        });

    const notasCreditoPorFactura =
        resultadoNotasCredito
            .aplicaciones;

    const notasDebitoSoloReversa =
        resultadoNotasCredito
            .notasDebitoSoloReversa;
    /*
     * 4. Cargar recordatorios existentes
     */


    /*
     * 5. Estadísticas
     */

    let confirmadosOmitidos =
        0;

    let sinFechaVencimiento =
        0;

    let sinIdentificacion =
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
* Primero validar identificación mínima.
*/
        if (
            !tipoDoc ||
            !folio ||
            !rutContraparte
        ) {
            sinIdentificacion++;

            continue;
        }

        /*
 * Una Nota de Débito que únicamente anula/revierte
 * una Nota de Crédito no representa una deuda nueva.
 *
 * Ejemplo real:
 *
 * ND 56-4
 * → anula NC 61-124
 *
 * Por lo tanto:
 *
 * - NC 124 deja de afectar la factura 1245
 * - ND 4 no se cobra por separado
 */
        if (
            tipoDoc ===
            "56" &&
            notasDebitoSoloReversa.has(
                [
                    folio,
                    normalizeRut(
                        rutContraparte
                    ),
                ].join("|")
            )
        ) {
            console.log(
                "[COBRANZA AUTO] ⏭ Nota de Débito de reversa de NC no se cobra independientemente",
                {
                    empresa,

                    tipoDoc,

                    folio,

                    rutContraparte,
                }
            );

            continue;
        }

        const montoOriginal =
            getMontoTotal(
                documento
            );

        const notaCreditoKey =
            [
                tipoDoc,

                folio,

                rutContraparte,
            ].join("|");

        const aplicacionNotaCredito =
            notasCreditoPorFactura.get(
                notaCreditoKey
            );

        const montoNotasCredito =
            aplicacionNotaCredito
                ?.montoNotasCredito ??
            0;

        const anulaCompletamente =
            aplicacionNotaCredito
                ?.anulaCompletamente ??
            false;

        const montoPendiente =
            anulaCompletamente
                ? 0
                : Math.max(
                    0,
                    montoOriginal -
                    montoNotasCredito
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
            anulaCompletamente ||
            (
                montoOriginal >
                0 &&
                montoPendiente <=
                0
            )
        ) {
            console.log(
                "[COBRANZA AUTO] 🧾 Documento sin saldo por Nota de Crédito",
                {
                    empresa,

                    tipoDoc,

                    folio,

                    rutContraparte,

                    montoOriginal,

                    montoNotasCredito,

                    anulaCompletamente,

                    notasCredito:
                        aplicacionNotaCredito
                            ?.notasCredito ??
                        [],
                }
            );

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

        console.log(
            "[COBRANZA AUTO] 🎯 Etapa de cobranza resuelta",
            {
                empresa,

                tipoDoc,

                folio,

                diasDiferencia:
                    estado
                        .diasDiferencia,

                tipoRecordatorio,

                catchUp:
                    !(
                        config
                            .diasPorVencer
                            .includes(
                                estado
                                    .diasDiferencia
                            ) ||
                        config
                            .diasVencidos
                            .includes(
                                estado
                                    .diasDiferencia
                            )
                    ),
            }
        );

        candidatos.push({
            empresaKey:
                empresa,

            empresaClienteId:
                null,

            empresaClienteNombre:
                null,

            destinatarios:
                [],

            tieneDestinatarioCobranza:
                false,

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
                montoPendiente,

            montoOriginal,

            montoNotasCredito,

            montoPendiente,

            notasCreditoAplicadas:
                aplicacionNotaCredito
                    ?.notasCredito ??
                [],

            fechaVencimiento:
                estado.fechaVencimientoIso,

            diasDiferencia:
                estado.diasDiferencia,

            origenVencimiento:
                String(
                    documento
                        ?.origenVencimientoCobranza ??
                    estado.origenVencimiento ??
                    "DESCONOCIDO"
                ) as CandidatoRecordatorioCobranza["origenVencimiento"],

            diasCredito:
                typeof documento
                    ?.diasCreditoCobranza ===
                    "number"
                    ? documento
                        .diasCreditoCobranza
                    : null,

            estadoPago:
                estado.estadoPago,

            tipoRecordatorio,

            yaEnviado:
                false,

            recordatoriosPendientes:
                0,

            recordatoriosEnviados:
                0,

            recordatoriosError:
                0,

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

    /*
 * 7. Resolver destinatarios.
 *
 * Todavía estamos en SIMULACIÓN:
 * este bloque NO envía emails.
 */

    await resolverDestinatariosCobranza(
        candidatos
    );

    const candidatosConDestinatario =
        candidatos.filter(
            (
                candidato
            ) =>
                candidato
                    .tieneDestinatarioCobranza
        ).length;

    /*
 * Registrar en DB solamente cuando
 * explícitamente lo solicitamos.
 *
 * /simular seguirá siendo 100% lectura.
 */
    if (
        registrarPendientes
    ) {
        await registrarRecordatoriosPendientes(
            empresa,
            candidatos
        );
    }

    await cargarEstadoRecordatorios(
        empresa,
        candidatos
    );

    const yaEnviados =
        candidatos.filter(
            (
                candidato
            ) =>
                candidato
                    .yaEnviado
        ).length;

    const candidatosSinDestinatario =
        candidatos.length -
        candidatosConDestinatario;

    const pendientesEnvio =
        candidatos.filter(
            (
                candidato
            ) =>
                candidato
                    .tieneDestinatarioCobranza &&
                !candidato
                    .yaEnviado
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

            candidatosConDestinatario,

            candidatosSinDestinatario,
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

        candidatosConDestinatario,

        candidatosSinDestinatario,
    };
}

/* =========================================================
   PROCESO PRINCIPAL
========================================================= */

export async function procesarCobranzaAutomatica(
    options?: {
        mesesAnalizar?: number;
        empresas?: EmpresaKey[];

        registrarPendientes?: boolean;
    }
): Promise<ResultadoCobranzaAutomatica> {
    const inicioProceso =
        Date.now();

    const registrarPendientes =
        options
            ?.registrarPendientes ??
        false;

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
                    mesesAnalizar,
                    registrarPendientes
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

                candidatosConDestinatario:
                    0,

                candidatosSinDestinatario:
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