// src/service/baseapi/finanzas/finanzas-dashboard.service.ts
import { prisma } from "../../../lib/prisma.js";

import {
    anotarDocumentosCobranza,
    type EmpresaKey,
} from "../cobranza/cobranza-estado.service.js";

/* =========================================================
   TIPOS
========================================================= */

type MesDashboard = {
    mes: number;
    label: string;

    // Ventas
    facturadoBruto: number;
    facturadoNeto: number;

    // Compras
    comprasBruto: number;
    comprasNeto: number;
    documentosCompras: number;

    // Pagos / cobranza
    pagado: number;
    documentosPagados: number;

    porVencer: number;
    documentosPorVencer: number;

    vencido: number;
    documentosVencidos: number;

    recordatorios: number;
};

type FinanzasResumen = {
    montoFacturado: number;
    totalDocumentos: number;

    montoCompras: number;
    totalDocumentosCompras: number;

    montoPorVencer: number;
    documentosPorVencer: number;

    montoVencido: number;
    documentosVencidos: number;

    montoPagado: number;
    documentosPagados: number;

    recordatoriosEnviados: number;
};

function seleccionarCachesMensuales<
    T extends {
        mes: string | null;
        tipo: string;
        data: any;
        updatedAt: Date;
    }
>(
    caches: T[],
    tipoPreferido: string,
    tipoRcv: "ventas" | "compras"
): T[] {
    const cachePorMes =
        new Map<
            string,
            T
        >();

    for (
        const cache
        of caches
    ) {
        const mes =
            String(
                cache.mes ??
                ""
            )
                .padStart(
                    2,
                    "0"
                );

        if (!mes) {
            continue;
        }

        const existente =
            cachePorMes.get(
                mes
            );

        if (
            !existente
        ) {
            cachePorMes.set(
                mes,
                cache
            );

            continue;
        }

        const prioridadActual =
            cache.tipo ===
                tipoPreferido
                ? 2
                : 1;

        const prioridadExistente =
            existente.tipo ===
                tipoPreferido
                ? 2
                : 1;

        if (
            prioridadActual >
            prioridadExistente
        ) {
            cachePorMes.set(
                mes,
                cache
            );

            continue;
        }

        if (
            prioridadActual ===
            prioridadExistente &&
            cache.updatedAt >
            existente.updatedAt
        ) {
            cachePorMes.set(
                mes,
                cache
            );
        }
    }

    return Array.from(
        cachePorMes.values()
    )
        .filter(
            (
                cache
            ) =>
                getDocumentosRcv(
                    cache.data,
                    tipoRcv
                ).length >
                0
        )
        .sort(
            (
                a,
                b
            ) =>
                Number(a.mes) -
                Number(b.mes)
        );
}

const MESES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
];

/* =========================================================
   HELPERS
========================================================= */

function toNumber(
    value: unknown
): number {
    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {
        return value;
    }

    const normalized =
        String(value ?? "")
            .replace(/\./g, "")
            .replace(/,/g, ".")
            .replace(/[^\d.-]/g, "");

    const n =
        Number(normalized);

    return Number.isFinite(n)
        ? n
        : 0;
}

function getDocumentosRcv(
    data: any,
    tipo: "ventas" | "compras"
): any[] {
    if (
        Array.isArray(data)
    ) {
        return data;
    }

    if (
        tipo === "ventas"
    ) {
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
    }

    if (
        tipo === "compras"
    ) {
        if (
            Array.isArray(
                data?.detalleCompras
            )
        ) {
            return data.detalleCompras;
        }

        if (
            Array.isArray(
                data?.compras
            )
        ) {
            return data.compras;
        }
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
            data?.data?.datos
        )
    ) {
        return data.data.datos;
    }

    return [];
}

function getMontoTotal(
    doc: any
): number {
    return toNumber(
        doc?.["Monto total"] ??
        doc?.["Monto Total"] ??
        doc?.montoTotal ??
        0
    );
}

function getMontoNeto(
    doc: any
): number {
    return toNumber(
        doc?.["Monto Neto"] ??
        doc?.montoNeto ??
        0
    );
}

/* =========================================================
   DASHBOARD
========================================================= */

export async function obtenerDashboardFinanzas(
    params: {
        empresaKey: EmpresaKey;
        ano: number;
    }
) {
    const {
        empresaKey,
        ano,
    } = params;

    /*
     * =====================================================
     * 1. Leer cache RCV del año
     * =====================================================
     */

    const caches =
        await prisma.siiApiCache.findMany({
            where: {
                empresaKey,

                tipo: {
                    in: [
                        "ventas",
                        "baseapi-rcv-ventas",
                    ],
                },

                ano:
                    String(ano),
            },

            select: {
                mes:
                    true,

                tipo:
                    true,

                data:
                    true,

                updatedAt:
                    true,
            },

            orderBy: {
                mes:
                    "asc",
            },
        });

    const cachesCompras =
        await prisma.siiApiCache.findMany({
            where: {
                empresaKey,

                tipo: {
                    in: [
                        "compras",
                        "baseapi-rcv-compras",
                    ],
                },

                ano:
                    String(ano),
            },

            select: {
                mes:
                    true,

                tipo:
                    true,

                data:
                    true,

                updatedAt:
                    true,
            },

            orderBy: {
                mes:
                    "asc",
            },
        });

    const cachesComprasMensuales =
        seleccionarCachesMensuales(
            cachesCompras,
            "baseapi-rcv-compras",
            "compras"
        );

    /*
 * =====================================================
 * Normalizar cache:
 * mantener solamente el registro más reciente
 * de cada mes.
 *
 * Esto evita duplicar documentos cuando existen
 * caches históricos con tipos:
 *
 * - ventas
 * - baseapi-rcv-ventas
 * =====================================================
 */

    const cachePorMes =
        new Map<
            string,
            (typeof caches)[number]
        >();

    for (
        const cache
        of caches
    ) {
        const mes =
            String(
                cache.mes ??
                ""
            )
                .padStart(
                    2,
                    "0"
                );

        if (!mes) {
            continue;
        }

        const existente =
            cachePorMes.get(
                mes
            );

        /*
         * Primer registro del mes.
         */
        if (
            !existente
        ) {
            cachePorMes.set(
                mes,
                cache
            );

            continue;
        }

        /*
         * =====================================================
         * Prioridad de fuente:
         *
         * 1. baseapi-rcv-ventas
         * 2. ventas
         *
         * Solo comparamos updatedAt cuando ambos registros
         * pertenecen al mismo tipo.
         * =====================================================
         */

        const prioridadActual =
            cache.tipo ===
                "baseapi-rcv-ventas"
                ? 2
                : 1;

        const prioridadExistente =
            existente.tipo ===
                "baseapi-rcv-ventas"
                ? 2
                : 1;

        if (
            prioridadActual >
            prioridadExistente
        ) {
            cachePorMes.set(
                mes,
                cache
            );

            continue;
        }

        if (
            prioridadActual ===
            prioridadExistente &&
            cache.updatedAt >
            existente.updatedAt
        ) {
            cachePorMes.set(
                mes,
                cache
            );
        }
    }

    const cachesMensuales =
        Array.from(
            cachePorMes.values()
        ).sort(
            (
                a,
                b
            ) =>
                Number(a.mes) -
                Number(b.mes)
        );

    const cachesMensualesConDatos =
        cachesMensuales.filter(
            (
                cache
            ) =>
                getDocumentosRcv(
                    cache.data,
                    "ventas"
                ).length >
                0
        );

    /*
     * =====================================================
     * 2. Leer conciliaciones del año
     * =====================================================
     */

    const desde =
        new Date(
            `${ano}-01-01T00:00:00.000Z`
        );

    const hasta =
        new Date(
            `${ano + 1}-01-01T00:00:00.000Z`
        );

    const conciliaciones =
        await prisma.rcvConciliacion.findMany({
            where: {
                empresaKey,

                tipoRcv:
                    "ventas",

                estadoConciliacion:
                    "CONCILIADA",

                conciliadoAt: {
                    gte:
                        desde,

                    lt:
                        hasta,
                },
            },

            select: {
                montoTotal:
                    true,

                conciliadoAt:
                    true,
            },
        });

    /*
     * =====================================================
     * 3. Recordatorios enviados del año
     * =====================================================
     */

    const recordatorios =
        await prisma.rcvRecordatorioEnvio.findMany({
            where: {
                empresaKey,

                tipoRcv:
                    "ventas",

                estado:
                    "ENVIADO",

                enviadoAt: {
                    gte:
                        desde,

                    lt:
                        hasta,
                },
            },

            select: {
                enviadoAt:
                    true,

                montoTotal:
                    true,
            },
        });

    /*
     * =====================================================
     * 4. Crear estructura mensual
     * =====================================================
     */

    const meses:
        MesDashboard[] =
        Array.from(
            {
                length:
                    12,
            },
            (
                _,
                index
            ) => ({
                mes:
                    index +
                    1,

                label:
                    MESES[index] ??
                    String(
                        index +
                        1
                    ),

                facturadoBruto:
                    0,

                facturadoNeto:
                    0,

                pagado:
                    0,

                documentosPagados:
                    0,

                porVencer:
                    0,

                documentosPorVencer:
                    0,

                vencido:
                    0,

                documentosVencidos:
                    0,

                recordatorios:
                    0,

                comprasBruto:
                    0,

                comprasNeto:
                    0,

                documentosCompras:
                    0,
            })
        );

    /*
     * =====================================================
     * 5. Procesar documentos RCV
     * =====================================================
     */

    for (
        const cache
        of cachesMensualesConDatos
    ) {
        const mesNumero =
            Number(
                cache.mes
            );

        if (
            !Number.isFinite(
                mesNumero
            ) ||
            mesNumero <
            1 ||
            mesNumero >
            12
        ) {
            continue;
        }

        const documentos =
            getDocumentosRcv(
                cache.data,
                "ventas"
            );

        if (
            documentos.length ===
            0
        ) {
            continue;
        }

        /*
         * Agregamos empresaOrigen para que
         * anotarDocumentosCobranza resuelva
         * correctamente las fuentes.
         */
        const documentosConOrigen =
            documentos.map(
                (
                    doc
                ) => ({
                    ...doc,

                    empresaOrigen:
                        empresaKey,
                })
            );

        const documentosAnotados =
            await anotarDocumentosCobranza(
                documentosConOrigen,
                "ventas",
                empresaKey
            );

        const bucket =
            meses[
            mesNumero -
            1
            ];

        if (
            !bucket
        ) {
            continue;
        }

        for (
            const doc
            of documentosAnotados
        ) {
            const total =
                getMontoTotal(
                    doc
                );

            const neto =
                getMontoNeto(
                    doc
                );

            bucket.facturadoBruto +=
                total;

            bucket.facturadoNeto +=
                neto;

            const estado =
                String(
                    doc
                        ?.estadoPago ??
                    ""
                )
                    .trim()
                    .toUpperCase();

            if (
                estado ===
                "VENCIDA"
            ) {
                bucket.vencido +=
                    total;

                bucket.documentosVencidos +=
                    1;
            } else if (
                estado ===
                "PENDIENTE"
            ) {
                bucket.porVencer +=
                    total;

                bucket.documentosPorVencer +=
                    1;
            }
        }
    }

    /*
 * =====================================================
 * Procesar compras RCV
 * =====================================================
 */

    for (
        const cache
        of cachesComprasMensuales
    ) {
        const mesNumero =
            Number(
                cache.mes
            );

        if (
            !Number.isFinite(
                mesNumero
            ) ||
            mesNumero < 1 ||
            mesNumero > 12
        ) {
            continue;
        }

        const documentos =
            getDocumentosRcv(
                cache.data,
                "compras"
            );

        if (
            documentos.length ===
            0
        ) {
            continue;
        }

        const bucket =
            meses[
            mesNumero -
            1
            ];

        if (
            !bucket
        ) {
            continue;
        }

        for (
            const doc
            of documentos
        ) {
            bucket.comprasBruto +=
                getMontoTotal(
                    doc
                );

            bucket.comprasNeto +=
                getMontoNeto(
                    doc
                );

            bucket.documentosCompras +=
                1;
        }
    }

    /*
     * =====================================================
     * 6. Pagos conciliados por mes
     * =====================================================
     */

    for (
        const conciliacion
        of conciliaciones
    ) {
        if (
            !conciliacion
                .conciliadoAt
        ) {
            continue;
        }

        const month =
            conciliacion
                .conciliadoAt
                .getUTCMonth();

        const bucket =
            meses[
            month
            ];

        if (
            !bucket
        ) {
            continue;
        }

        bucket.pagado +=
            conciliacion
                .montoTotal;

        bucket.documentosPagados +=
            1;
    }

    /*
     * =====================================================
     * 7. Recordatorios por mes
     * =====================================================
     */

    for (
        const recordatorio
        of recordatorios
    ) {
        if (
            !recordatorio
                .enviadoAt
        ) {
            continue;
        }

        const month =
            recordatorio
                .enviadoAt
                .getUTCMonth();

        const bucket =
            meses[
            month
            ];

        if (
            !bucket
        ) {
            continue;
        }

        bucket.recordatorios +=
            1;
    }

    /*
     * =====================================================
     * 8. Totales
     * =====================================================
     */

    const resumen:
        FinanzasResumen =
        meses.reduce(
            (
                acc,
                item
            ) => {
                acc.montoFacturado +=
                    item.facturadoBruto;

                acc.montoCompras +=
                    item.comprasBruto;

                acc.totalDocumentosCompras +=
                    item.documentosCompras;

                acc.totalDocumentos +=
                    item.documentosPorVencer +
                    item.documentosVencidos +
                    item.documentosPagados;

                acc.montoPorVencer +=
                    item.porVencer;

                acc.documentosPorVencer +=
                    item.documentosPorVencer;

                acc.montoVencido +=
                    item.vencido;

                acc.documentosVencidos +=
                    item.documentosVencidos;

                acc.montoPagado +=
                    item.pagado;

                acc.documentosPagados +=
                    item.documentosPagados;

                acc.recordatoriosEnviados +=
                    item.recordatorios;

                return acc;
            },
            {
                montoFacturado:
                    0,

                totalDocumentos:
                    0,

                montoCompras:
                    0,

                totalDocumentosCompras:
                    0,

                montoPorVencer:
                    0,

                documentosPorVencer:
                    0,

                montoVencido:
                    0,

                documentosVencidos:
                    0,

                montoPagado:
                    0,

                documentosPagados:
                    0,

                recordatoriosEnviados:
                    0,
            }
        );

    /*
     * IMPORTANTE:
     * totalDocumentos debe representar documentos RCV,
     * no sumar estados + conciliaciones porque eso
     * podría contar dos veces un documento.
     */

    resumen.totalDocumentos =
        cachesMensualesConDatos.reduce(
            (
                total,
                cache
            ) =>
                total +
                getDocumentosRcv(
                    cache.data,
                    "ventas"
                ).length,
            0
        );

    resumen.totalDocumentosCompras =
        cachesComprasMensuales.reduce(
            (
                total,
                cache
            ) =>
                total +
                getDocumentosRcv(
                    cache.data,
                    "compras"
                ).length,
            0
        );

    const ultimaActualizacion =
        [
            ...cachesMensualesConDatos,
            ...cachesComprasMensuales,
        ]
            .map(
                (
                    cache
                ) =>
                    cache.updatedAt
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.getTime() -
                    a.getTime()
            )[0] ??
        null;

    return {
        empresa:
            empresaKey,

        ano,

        resumen,

        meses,

        ultimaActualizacion,

        mesesConCache:
            cachesMensualesConDatos
                .map(
                    (
                        item
                    ) =>
                        item.mes
                )
                .filter(
                    Boolean
                ),

        mesesConCompras:
            cachesComprasMensuales
                .map(
                    (
                        item
                    ) =>
                        item.mes
                )
                .filter(
                    Boolean
                ),

        cacheUtilizado:
            cachesMensualesConDatos.map(
                (
                    item
                ) => ({
                    mes:
                        item.mes,

                    tipo:
                        item.tipo,

                    updatedAt:
                        item.updatedAt,
                })
            ),
    };
}