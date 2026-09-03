// src/service/baseapi/cobranza/cobranza-estado.service.ts
import { prisma } from "../../../lib/prisma.js";
import { getOverride as getVencimientoOverride } from "../../../controllers/baseapi/rcv-vencimientos.store.js";

export type EstadoPagoRcv =
    | "CONFIRMADA"
    | "PENDIENTE"
    | "VENCIDA";

export type EmpresaKey =
    | "econnet"
    | "rids";

export type EstadoDocumentoCobranza = {
    estadoPago: EstadoPagoRcv;
    fechaVencimiento: Date | null;
    fechaVencimientoIso: string | null;
    diasDiferencia: number | null;
    conciliada: boolean;
    origenVencimiento:
    | "OVERRIDE"
    | "DOCUMENTO"
    | "SIN_FECHA";
};

/* =========================================================
   HELPERS
========================================================= */

function normalizarFechaDia(
    value: Date
): Date {
    const fecha = new Date(value);

    fecha.setHours(
        0,
        0,
        0,
        0
    );

    return fecha;
}

function parseFecha(
    value: unknown
): Date | null {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const raw =
        String(value).trim();

    if (!raw) {
        return null;
    }

    /* ===============================
       YYYY-MM-DD
    =============================== */

    const fechaIsoMatch =
        raw.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (fechaIsoMatch) {
        const year =
            Number(
                fechaIsoMatch[1] ??
                ""
            );

        const month =
            Number(
                fechaIsoMatch[2] ??
                ""
            );

        const day =
            Number(
                fechaIsoMatch[3] ??
                ""
            );

        const date =
            new Date(
                year,
                month - 1,
                day
            );

        if (
            Number.isNaN(
                date.getTime()
            ) ||
            date.getFullYear() !==
            year ||
            date.getMonth() !==
            month - 1 ||
            date.getDate() !==
            day
        ) {
            return null;
        }

        return date;
    }

    /* ===============================
       DD/MM/YYYY
    =============================== */

    const fechaLatinaMatch =
        raw.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

    if (fechaLatinaMatch) {
        const day =
            Number(
                fechaLatinaMatch[1] ??
                ""
            );

        const month =
            Number(
                fechaLatinaMatch[2] ??
                ""
            );

        const year =
            Number(
                fechaLatinaMatch[3] ??
                ""
            );

        const date =
            new Date(
                year,
                month - 1,
                day
            );

        if (
            Number.isNaN(
                date.getTime()
            ) ||
            date.getFullYear() !==
            year ||
            date.getMonth() !==
            month - 1 ||
            date.getDate() !==
            day
        ) {
            return null;
        }

        return date;
    }

    /* ===============================
       ISO CON HORA / OTROS FORMATOS
    =============================== */

    const date =
        new Date(raw);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

function obtenerFechaVencimientoDocumento(
    doc: any
): Date | null {
    const candidates = [
        doc?.FchVenc,
        doc?.FchVencimiento,
        doc?.fechaVencimiento,
        doc?.vencimiento,
        doc?.fecha_vencimiento,
        doc?.Vencimiento,
    ];

    for (
        const value
        of candidates
    ) {
        const parsed =
            parseFecha(value);

        if (parsed) {
            return parsed;
        }
    }

    return null;
}

function calcularDiasDiferencia(
    fechaVencimiento: Date,
    referencia = new Date()
): number {
    const vencimiento =
        normalizarFechaDia(
            fechaVencimiento
        );

    const hoy =
        normalizarFechaDia(
            referencia
        );

    const diferenciaMs =
        hoy.getTime() -
        vencimiento.getTime();

    return Math.round(
        diferenciaMs /
        86_400_000
    );
}

/**
 * Convención:
 *
 * -7 = faltan 7 días para vencer
 * -3 = faltan 3 días
 *  0 = vence hoy
 *  3 = venció hace 3 días
 *  7 = venció hace 7 días
 */
export function getDiasCobranza(
    fechaVencimiento: Date,
    referencia = new Date()
) {
    return calcularDiasDiferencia(
        fechaVencimiento,
        referencia
    );
}

export type TipoRcvCobranza =
    | "ventas"
    | "compras";

/* =========================================================
   ESTADO DE UN DOCUMENTO
========================================================= */

export async function obtenerEstadoDocumentoCobranza(
    doc: any,
    tipoRcv: TipoRcvCobranza,
    empresaFallback?: EmpresaKey
): Promise<EstadoDocumentoCobranza> {
    const tipoDoc =
        String(
            doc?.["Tipo Doc"] ??
            doc?.tipoDoc ??
            doc?.tipoDTE ??
            ""
        ).trim();

    const folio =
        String(
            doc?.["Folio"] ??
            doc?.folio ??
            doc?.Nro ??
            doc?.numero ??
            ""
        ).trim();

    const empresaRaw =
        String(
            doc?.empresaOrigen ??
            doc?.empresa ??
            doc?.empresaKey ??
            empresaFallback ??
            ""
        )
            .trim()
            .toLowerCase();

    const empresaKey:
        | EmpresaKey
        | null =
        empresaRaw ===
            "econnet" ||
            empresaRaw ===
            "rids"
            ? empresaRaw
            : null;

    if (
        !empresaKey ||
        !tipoDoc ||
        !folio
    ) {
        const fechaDocumento =
            obtenerFechaVencimientoDocumento(
                doc
            );

        if (!fechaDocumento) {
            return {
                estadoPago:
                    "PENDIENTE",
                fechaVencimiento:
                    null,
                fechaVencimientoIso:
                    null,
                diasDiferencia:
                    null,
                conciliada:
                    false,
                origenVencimiento:
                    "SIN_FECHA",
            };
        }

        const dias =
            calcularDiasDiferencia(
                fechaDocumento
            );

        return {
            estadoPago:
                dias > 0
                    ? "VENCIDA"
                    : "PENDIENTE",

            fechaVencimiento:
                fechaDocumento,

            fechaVencimientoIso:
                fechaDocumento
                    .toISOString()
                    .slice(
                        0,
                        10
                    ),

            diasDiferencia:
                dias,

            conciliada:
                false,

            origenVencimiento:
                "DOCUMENTO",
        };
    }

    /* =====================================================
       1. BUSCAR CONCILIACIÓN
    ===================================================== */

    const conciliacion =
        await prisma.rcvConciliacion.findFirst({
            where: {
                empresaKey,
                tipoRcv,
                tipoDoc,
                folio,
            },

            orderBy: {
                conciliadoAt:
                    "desc",
            },
        });

    if (
        conciliacion
            ?.estadoConciliacion ===
        "CONCILIADA"
    ) {
        return {
            estadoPago:
                "CONFIRMADA",

            fechaVencimiento:
                null,

            fechaVencimientoIso:
                null,

            diasDiferencia:
                null,

            conciliada:
                true,

            origenVencimiento:
                "SIN_FECHA",
        };
    }

    /* =====================================================
       2. BUSCAR OVERRIDE DE VENCIMIENTO
    ===================================================== */

    const override =
        await getVencimientoOverride(
            empresaKey,
            tipoDoc,
            folio
        );

    if (override) {
        const fechaOverride =
            parseFecha(
                override
            );

        if (fechaOverride) {
            const dias =
                calcularDiasDiferencia(
                    fechaOverride
                );

            return {
                estadoPago:
                    dias > 0
                        ? "VENCIDA"
                        : "PENDIENTE",

                fechaVencimiento:
                    fechaOverride,

                fechaVencimientoIso:
                    fechaOverride
                        .toISOString()
                        .slice(
                            0,
                            10
                        ),

                diasDiferencia:
                    dias,

                conciliada:
                    false,

                origenVencimiento:
                    "OVERRIDE",
            };
        }
    }

    /* =====================================================
       3. FECHA DEL DOCUMENTO
    ===================================================== */

    const fechaDocumento =
        obtenerFechaVencimientoDocumento(
            doc
        );

    if (fechaDocumento) {
        const dias =
            calcularDiasDiferencia(
                fechaDocumento
            );

        return {
            estadoPago:
                dias > 0
                    ? "VENCIDA"
                    : "PENDIENTE",

            fechaVencimiento:
                fechaDocumento,

            fechaVencimientoIso:
                fechaDocumento
                    .toISOString()
                    .slice(
                        0,
                        10
                    ),

            diasDiferencia:
                dias,

            conciliada:
                false,

            origenVencimiento:
                "DOCUMENTO",
        };
    }

    /* =====================================================
       4. SIN VENCIMIENTO
    ===================================================== */

    return {
        estadoPago:
            "PENDIENTE",

        fechaVencimiento:
            null,

        fechaVencimientoIso:
            null,

        diasDiferencia:
            null,

        conciliada:
            false,

        origenVencimiento:
            "SIN_FECHA",
    };
}

/* =========================================================
   ANOTAR DOCUMENTO
========================================================= */

export async function anotarDocumentoCobranza(
    doc: any,
    tipoRcv: TipoRcvCobranza,
    empresaFallback?: EmpresaKey
) {
    const estado =
        await obtenerEstadoDocumentoCobranza(
            doc,
            tipoRcv,
            empresaFallback
        );

    const result = {
        ...doc,
        estadoPago:
            estado.estadoPago,
    };

    if (
        estado.fechaVencimientoIso
    ) {
        for (
            const key
            of [
                "FchVenc",
                "FchVencimiento",
                "fechaVencimiento",
                "vencimiento",
                "fecha_vencimiento",
                "Vencimiento",
            ]
        ) {
            result[key] =
                estado.fechaVencimientoIso;
        }
    }

    return result;
}

type DocumentoCobranzaBatch = {
    documento: any;
    estado: EstadoDocumentoCobranza;
};

function getDocumentoKey(
    empresaKey: string,
    tipoDoc: string,
    folio: string
) {
    return [
        String(empresaKey ?? "")
            .trim()
            .toLowerCase(),

        String(tipoDoc ?? "")
            .trim(),

        String(folio ?? "")
            .trim(),
    ].join("|");
}

function getEmpresaDocumento(
    doc: any,
    empresaFallback?: EmpresaKey
): EmpresaKey | null {
    const empresaRaw =
        String(
            doc?.empresaOrigen ??
            doc?.empresa ??
            doc?.empresaKey ??
            empresaFallback ??
            ""
        )
            .trim()
            .toLowerCase();

    if (
        empresaRaw === "econnet" ||
        empresaRaw === "rids"
    ) {
        return empresaRaw;
    }

    return null;
}

function getTipoDocDocumento(
    doc: any
): string {
    return String(
        doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        ""
    ).trim();
}

function getFolioDocumento(
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

export async function obtenerEstadosDocumentosCobranza(
    documentos: any[],
    tipoRcv: TipoRcvCobranza,
    empresaFallback?: EmpresaKey
): Promise<DocumentoCobranzaBatch[]> {
    if (!Array.isArray(documentos) || documentos.length === 0) {
        return [];
    }

    const empresasEncontradas =
        Array.from(
            new Set(
                documentos
                    .map((doc) =>
                        getEmpresaDocumento(
                            doc,
                            empresaFallback
                        )
                    )
                    .filter(
                        (
                            value
                        ): value is EmpresaKey =>
                            value !== null
                    )
            )
        );

    const folios =
        Array.from(
            new Set(
                documentos
                    .map((doc) =>
                        getFolioDocumento(doc)
                    )
                    .filter(Boolean)
            )
        );

    const tiposDoc =
        Array.from(
            new Set(
                documentos
                    .map((doc) =>
                        getTipoDocDocumento(doc)
                    )
                    .filter(Boolean)
            )
        );

    const whereBase = {
        ...(empresasEncontradas.length > 0
            ? {
                empresaKey: {
                    in: empresasEncontradas,
                },
            }
            : {}),

        ...(folios.length > 0
            ? {
                folio: {
                    in: folios,
                },
            }
            : {}),

        ...(tiposDoc.length > 0
            ? {
                tipoDoc: {
                    in: tiposDoc,
                },
            }
            : {}),
    };

    const [
        conciliaciones,
        vencimientos,
    ] = await Promise.all([
        prisma.rcvConciliacion.findMany({
            where: {
                ...whereBase,
                tipoRcv,
            },

            orderBy: {
                conciliadoAt: "desc",
            },
        }),

        prisma.rcvVencimiento.findMany({
            where: whereBase,
        }),
    ]);

    /*
     * IMPORTANTE:
     *
     * Como las conciliaciones vienen ordenadas de más reciente
     * a más antigua, guardamos solamente la primera que encontremos
     * para cada documento.
     */

    const conciliacionMap =
        new Map<
            string,
            (typeof conciliaciones)[number]
        >();

    for (
        const conciliacion
        of conciliaciones
    ) {
        const key =
            getDocumentoKey(
                conciliacion.empresaKey,
                conciliacion.tipoDoc,
                conciliacion.folio
            );

        if (
            !conciliacionMap.has(
                key
            )
        ) {
            conciliacionMap.set(
                key,
                conciliacion
            );
        }
    }

    const vencimientoMap =
        new Map<
            string,
            (typeof vencimientos)[number]
        >();

    for (
        const vencimiento
        of vencimientos
    ) {
        const key =
            getDocumentoKey(
                vencimiento.empresaKey,
                vencimiento.tipoDoc,
                vencimiento.folio
            );

        vencimientoMap.set(
            key,
            vencimiento
        );
    }

    const hoy =
        normalizarFechaDia(
            new Date()
        );

    const resultados:
        DocumentoCobranzaBatch[] =
        [];

    for (
        const documento
        of documentos
    ) {
        const empresaKey =
            getEmpresaDocumento(
                documento,
                empresaFallback
            );

        const tipoDoc =
            getTipoDocDocumento(
                documento
            );

        const folio =
            getFolioDocumento(
                documento
            );

        /*
         * Si el documento no tiene identificadores suficientes,
         * hacemos fallback solamente a su fecha.
         */
        if (
            !empresaKey ||
            !tipoDoc ||
            !folio
        ) {
            const fechaDocumento =
                obtenerFechaVencimientoDocumento(
                    documento
                );

            if (
                !fechaDocumento
            ) {
                resultados.push({
                    documento,
                    estado: {
                        estadoPago:
                            "PENDIENTE",

                        fechaVencimiento:
                            null,

                        fechaVencimientoIso:
                            null,

                        diasDiferencia:
                            null,

                        conciliada:
                            false,

                        origenVencimiento:
                            "SIN_FECHA",
                    },
                });

                continue;
            }

            const dias =
                calcularDiasDiferencia(
                    fechaDocumento,
                    hoy
                );

            resultados.push({
                documento,

                estado: {
                    estadoPago:
                        dias > 0
                            ? "VENCIDA"
                            : "PENDIENTE",

                    fechaVencimiento:
                        fechaDocumento,

                    fechaVencimientoIso:
                        fechaDocumento
                            .toISOString()
                            .slice(
                                0,
                                10
                            ),

                    diasDiferencia:
                        dias,

                    conciliada:
                        false,

                    origenVencimiento:
                        "DOCUMENTO",
                },
            });

            continue;
        }

        const key =
            getDocumentoKey(
                empresaKey,
                tipoDoc,
                folio
            );

        /*
         * 1. CONCILIACIÓN
         */

        const conciliacion =
            conciliacionMap.get(
                key
            );

        if (
            conciliacion
                ?.estadoConciliacion ===
            "CONCILIADA"
        ) {
            resultados.push({
                documento,

                estado: {
                    estadoPago:
                        "CONFIRMADA",

                    fechaVencimiento:
                        null,

                    fechaVencimientoIso:
                        null,

                    diasDiferencia:
                        null,

                    conciliada:
                        true,

                    origenVencimiento:
                        "SIN_FECHA",
                },
            });

            continue;
        }

        /*
         * 2. OVERRIDE MANUAL
         */

        const vencimientoOverride =
            vencimientoMap.get(
                key
            );

        if (
            vencimientoOverride
                ?.fechaVencimiento
        ) {
            const fecha =
                new Date(
                    vencimientoOverride.fechaVencimiento
                );

            const dias =
                calcularDiasDiferencia(
                    fecha,
                    hoy
                );

            resultados.push({
                documento,

                estado: {
                    estadoPago:
                        dias > 0
                            ? "VENCIDA"
                            : "PENDIENTE",

                    fechaVencimiento:
                        fecha,

                    fechaVencimientoIso:
                        fecha
                            .toISOString()
                            .slice(
                                0,
                                10
                            ),

                    diasDiferencia:
                        dias,

                    conciliada:
                        false,

                    origenVencimiento:
                        "OVERRIDE",
                },
            });

            continue;
        }

        /*
         * 3. FECHA DEL DOCUMENTO
         */

        const fechaDocumento =
            obtenerFechaVencimientoDocumento(
                documento
            );

        if (
            fechaDocumento
        ) {
            const dias =
                calcularDiasDiferencia(
                    fechaDocumento,
                    hoy
                );

            resultados.push({
                documento,

                estado: {
                    estadoPago:
                        dias > 0
                            ? "VENCIDA"
                            : "PENDIENTE",

                    fechaVencimiento:
                        fechaDocumento,

                    fechaVencimientoIso:
                        fechaDocumento
                            .toISOString()
                            .slice(
                                0,
                                10
                            ),

                    diasDiferencia:
                        dias,

                    conciliada:
                        false,

                    origenVencimiento:
                        "DOCUMENTO",
                },
            });

            continue;
        }

        /*
         * 4. SIN FECHA
         */

        resultados.push({
            documento,

            estado: {
                estadoPago:
                    "PENDIENTE",

                fechaVencimiento:
                    null,

                fechaVencimientoIso:
                    null,

                diasDiferencia:
                    null,

                conciliada:
                    false,

                origenVencimiento:
                    "SIN_FECHA",
            },
        });
    }

    return resultados;
}

export async function anotarDocumentosCobranza(
    documentos: any[],
    tipoRcv: TipoRcvCobranza,
    empresaFallback?: EmpresaKey
) {
    const evaluados =
        await obtenerEstadosDocumentosCobranza(
            documentos,
            tipoRcv,
            empresaFallback
        );

    return evaluados.map(
        ({
            documento,
            estado,
        }) => {
            const result = {
                ...documento,

                estadoPago:
                    estado.estadoPago,

                diasDiferenciaCobranza:
                    estado.diasDiferencia,

                origenVencimiento:
                    estado.origenVencimiento,
            };

            if (
                estado.fechaVencimientoIso
            ) {
                for (
                    const key
                    of [
                        "FchVenc",
                        "FchVencimiento",
                        "fechaVencimiento",
                        "vencimiento",
                        "fecha_vencimiento",
                        "Vencimiento",
                    ]
                ) {
                    result[key] =
                        estado.fechaVencimientoIso;
                }
            }

            return result;
        }
    );
}