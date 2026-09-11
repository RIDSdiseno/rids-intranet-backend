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
    | "DTE_CACHE"
    | "RECEPTOR_COBRANZA"
    | "DETALLE_EMPRESA"
    | "SIN_FECHA";
};

export type EstadoAutomatizacionCobranza =
    | "SIN_RECORDATORIOS"
    | "ENVIADO"
    | "PENDIENTE"
    | "PROCESANDO"
    | "ERROR"
    | "PARCIAL";

export type DestinatarioAutomatizacionCobranza = {
    email: string;
    nombre: string | null;
    estado: string;
    enviadoAt: Date | null;
    error: string | null;
    intentos: number;
};

export type HistorialAutomatizacionCobranza = {
    id: number;
    tipoRecordatorio: string;
    cicloVencimiento: string | null;
    email: string;
    nombre: string | null;
    estado: string;
    enviadoAt: Date | null;
    error: string | null;
    intentos: number;
    ultimoIntentoAt: Date | null;
    createdAt: Date;
};

export type ResumenAutomatizacionCobranza = {
    tieneHistorial: boolean;

    estado:
    EstadoAutomatizacionCobranza;

    total: number;

    enviados: number;
    pendientes: number;
    procesando: number;
    errores: number;

    ultimoEnvioAt:
    Date | null;

    ultimoRegistroAt:
    Date | null;

    ultimoTipoRecordatorio:
    string | null;

    ultimoCicloVencimiento:
    string | null;

    destinatarios:
    DestinatarioAutomatizacionCobranza[];

    historial:
    HistorialAutomatizacionCobranza[];
};

/* =========================================================
   HELPERS
========================================================= */

const TIMEZONE_CHILE =
    "America/Santiago";

const MS_DIA =
    86_400_000;

function normalizarFechaDia(
    value: Date
): Date {
    return new Date(
        Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate()
        )
    );
}

function obtenerFechaActualChile(
    referencia = new Date()
): Date {
    const parts =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    TIMEZONE_CHILE,

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",
            }
        ).formatToParts(
            referencia
        );

    const year =
        Number(
            parts.find(
                (part) =>
                    part.type ===
                    "year"
            )?.value
        );

    const month =
        Number(
            parts.find(
                (part) =>
                    part.type ===
                    "month"
            )?.value
        );

    const day =
        Number(
            parts.find(
                (part) =>
                    part.type ===
                    "day"
            )?.value
        );

    return new Date(
        Date.UTC(
            year,
            month - 1,
            day
        )
    );
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
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );

        if (
            Number.isNaN(
                date.getTime()
            ) ||
            date.getUTCFullYear() !==
            year ||
            date.getUTCMonth() !==
            month - 1 ||
            date.getUTCDate() !==
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
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );

        if (
            Number.isNaN(
                date.getTime()
            ) ||
            date.getUTCFullYear() !==
            year ||
            date.getUTCMonth() !==
            month - 1 ||
            date.getUTCDate() !==
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

function normalizarRut(
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

function getRutContraparteDocumento(
    doc: any
): string {
    return normalizarRut(
        doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.["Rut Proveedor"] ??
        doc?.["RUT Proveedor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rutProveedor ??
        doc?.rut ??
        doc?.RUT ??
        ""
    );
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

function obtenerFechaEmisionDocumento(
    doc: any
): Date | null {
    const candidates = [
        doc?.["Fecha Docto"],
        doc?.["Fecha Documento"],
        doc?.["Fecha Emisión"],
        doc?.["Fecha Emision"],
        doc?.fechaDocto,
        doc?.fechaDocumento,
        doc?.fechaEmision,
        doc?.FchEmis,
    ];

    for (
        const value
        of candidates
    ) {
        const parsed =
            parseFecha(
                value
            );

        if (parsed) {
            return parsed;
        }
    }

    return null;
}

function sumarDiasFecha(
    fecha: Date,
    dias: number
): Date {
    const result =
        normalizarFechaDia(
            fecha
        );

    result.setUTCDate(
        result.getUTCDate() +
        dias
    );

    return result;
}

function calcularDiasDiferencia(
    fechaVencimiento: Date,
    referencia = new Date()
): number {
    const vencimiento =
        normalizarFechaDia(
            fechaVencimiento
        );

    const hoyChile =
        obtenerFechaActualChile(
            referencia
        );

    const diferenciaMs =
        hoyChile.getTime() -
        vencimiento.getTime();

    return Math.round(
        diferenciaMs /
        MS_DIA
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

    const rutContraparte =
        getRutContraparteDocumento(
            doc
        );

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

                ...(rutContraparte
                    ? {
                        rutContraparte,
                    }
                    : {}),
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
    const resultados =
        await anotarDocumentosCobranza(
            [doc],
            tipoRcv,
            empresaFallback
        );

    return (
        resultados[0] ??
        doc
    );
}

type DocumentoCobranzaBatch = {
    documento: any;

    estado:
    EstadoDocumentoCobranza;

    automatizacion:
    ResumenAutomatizacionCobranza;
};

function getConciliacionKey(
    empresaKey: string,
    tipoDoc: string,
    folio: string,
    rutContraparte: string
) {
    return [
        String(
            empresaKey ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            tipoDoc ??
            ""
        ).trim(),

        String(
            folio ??
            ""
        ).trim(),

        normalizarRut(
            rutContraparte
        ),
    ].join("|");
}

function getVencimientoKey(
    empresaKey: string,
    tipoDoc: string,
    folio: string
) {
    return [
        String(
            empresaKey ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            tipoDoc ??
            ""
        ).trim(),

        String(
            folio ??
            ""
        ).trim(),
    ].join("|");
}

function getCreditoRutKey(
    rut: string
) {
    return normalizarRut(
        rut
    );
}

function getFacturaDteKey(
    empresaKey: string,
    tipoDoc: string,
    folio: string
) {
    return [
        String(
            empresaKey ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            tipoDoc ??
            ""
        ).trim(),

        String(
            folio ??
            ""
        ).trim(),
    ].join("|");
}

function getRecordatorioKey(
    empresaKey: string,
    tipoRcv: string,
    tipoDoc: string,
    folio: string
) {
    return [
        String(
            empresaKey ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            tipoRcv ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            tipoDoc ??
            ""
        ).trim(),

        String(
            folio ??
            ""
        ).trim(),
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

function crearResumenAutomatizacionVacio():
    ResumenAutomatizacionCobranza {
    return {
        tieneHistorial:
            false,

        estado:
            "SIN_RECORDATORIOS",

        total:
            0,

        enviados:
            0,

        pendientes:
            0,

        procesando:
            0,

        errores:
            0,

        ultimoEnvioAt:
            null,

        ultimoRegistroAt:
            null,

        ultimoTipoRecordatorio:
            null,

        ultimoCicloVencimiento:
            null,

        destinatarios:
            [],

        historial:
            [],
    };
}

function resumirAutomatizacionCobranza(
    recordatorios: Array<{
        id: number;
        tipoRecordatorio: string;
        cicloVencimiento: string | null;
        emailDestino: string;
        nombreDestino: string | null;
        estado: string;
        enviadoAt: Date | null;
        error: string | null;
        intentos: number;
        ultimoIntentoAt: Date | null;
        createdAt: Date;
    }>
): ResumenAutomatizacionCobranza {
    if (
        recordatorios.length === 0
    ) {
        return crearResumenAutomatizacionVacio();
    }

    /*
     * Orden más reciente primero.
     */
    const ordenados =
        recordatorios
            .slice()
            .sort(
                (
                    a,
                    b
                ) =>
                    b.createdAt.getTime() -
                    a.createdAt.getTime()
            );

    const enviados =
        ordenados.filter(
            (item) =>
                item.estado ===
                "ENVIADO" ||
                Boolean(
                    item.enviadoAt
                )
        );

    const pendientes =
        ordenados.filter(
            (item) =>
                item.estado ===
                "PENDIENTE"
        );

    const procesando =
        ordenados.filter(
            (item) =>
                item.estado ===
                "PROCESANDO"
        );

    const errores =
        ordenados.filter(
            (item) =>
                item.estado ===
                "ERROR"
        );

    /*
     * Último ciclo generado.
     *
     * No usamos solamente el número de ciclo porque existen
     * ciclos negativos (-7, -3), cero y positivos.
     * createdAt refleja mejor cuál fue el ciclo más reciente
     * realmente registrado.
     */
    const ultimoRegistro =
        ordenados[0] ??
        null;

    const ultimoTipoRecordatorio =
        ultimoRegistro
            ?.tipoRecordatorio ??
        null;

    const ultimoCicloVencimiento =
        ultimoRegistro
            ?.cicloVencimiento ??
        null;

    /*
     * Para el estado operacional usamos solamente el último
     * tipo/ciclo. Así un ERROR antiguo no deja toda la factura
     * permanentemente marcada como error después de que hubo
     * recordatorios posteriores correctos.
     */
    const ultimoCiclo =
        ultimoRegistro
            ? ordenados.filter(
                (item) =>
                    item.tipoRecordatorio ===
                    ultimoRegistro.tipoRecordatorio &&
                    item.cicloVencimiento ===
                    ultimoRegistro.cicloVencimiento
            )
            : [];

    const enviadosUltimoCiclo =
        ultimoCiclo.filter(
            (item) =>
                item.estado ===
                "ENVIADO" ||
                Boolean(
                    item.enviadoAt
                )
        );

    const pendientesUltimoCiclo =
        ultimoCiclo.filter(
            (item) =>
                item.estado ===
                "PENDIENTE"
        );

    const procesandoUltimoCiclo =
        ultimoCiclo.filter(
            (item) =>
                item.estado ===
                "PROCESANDO"
        );

    const erroresUltimoCiclo =
        ultimoCiclo.filter(
            (item) =>
                item.estado ===
                "ERROR"
        );

    let estado:
        EstadoAutomatizacionCobranza =
        "ENVIADO";

    if (
        erroresUltimoCiclo.length >
        0 &&
        enviadosUltimoCiclo.length >
        0
    ) {
        estado =
            "PARCIAL";
    } else if (
        erroresUltimoCiclo.length >
        0
    ) {
        estado =
            "ERROR";
    } else if (
        procesandoUltimoCiclo.length >
        0
    ) {
        estado =
            "PROCESANDO";
    } else if (
        pendientesUltimoCiclo.length >
        0
    ) {
        estado =
            "PENDIENTE";
    }

    const ultimoEnvio =
        enviados
            .filter(
                (item) =>
                    item.enviadoAt
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    (
                        b.enviadoAt
                            ?.getTime() ??
                        0
                    ) -
                    (
                        a.enviadoAt
                            ?.getTime() ??
                        0
                    )
            )[0] ??
        null;

    return {
        tieneHistorial:
            true,

        estado,

        total:
            ordenados.length,

        enviados:
            enviados.length,

        pendientes:
            pendientes.length,

        procesando:
            procesando.length,

        errores:
            errores.length,

        ultimoEnvioAt:
            ultimoEnvio
                ?.enviadoAt ??
            null,

        ultimoRegistroAt:
            ultimoRegistro
                ?.createdAt ??
            null,

        ultimoTipoRecordatorio,

        ultimoCicloVencimiento,

        /*
         * Para la tabla principal necesitamos los
         * destinatarios del ciclo actual.
         */
        destinatarios:
            ultimoCiclo.map(
                (item) => ({
                    email:
                        item.emailDestino,

                    nombre:
                        item.nombreDestino,

                    estado:
                        item.estado,

                    enviadoAt:
                        item.enviadoAt,

                    error:
                        item.error,

                    intentos:
                        item.intentos,
                })
            ),

        /*
         * Historial completo para el modal.
         */
        historial:
            ordenados.map(
                (item) => ({
                    id:
                        item.id,

                    tipoRecordatorio:
                        item.tipoRecordatorio,

                    cicloVencimiento:
                        item.cicloVencimiento,

                    email:
                        item.emailDestino,

                    nombre:
                        item.nombreDestino,

                    estado:
                        item.estado,

                    enviadoAt:
                        item.enviadoAt,

                    error:
                        item.error,

                    intentos:
                        item.intentos,

                    ultimoIntentoAt:
                        item.ultimoIntentoAt,

                    createdAt:
                        item.createdAt,
                })
            ),
    };
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

    const rutsContraparte =
        Array.from(
            new Set(
                documentos
                    .map(
                        (
                            doc
                        ) =>
                            getRutContraparteDocumento(
                                doc
                            )
                    )
                    .filter(
                        Boolean
                    )
            )
        );

    const whereDocumentos = {
        ...(empresasEncontradas.length > 0
            ? {
                empresaKey: {
                    in:
                        empresasEncontradas,
                },
            }
            : {}),

        ...(folios.length > 0
            ? {
                folio: {
                    in:
                        folios,
                },
            }
            : {}),

        ...(tiposDoc.length > 0
            ? {
                tipoDoc: {
                    in:
                        tiposDoc,
                },
            }
            : {}),
    };

    const whereConciliaciones = {
        ...whereDocumentos,

        ...(rutsContraparte.length > 0
            ? {
                rutContraparte: {
                    in:
                        rutsContraparte,
                },
            }
            : {}),
    };

    const tiposDteNumericos =
        Array.from(
            new Set(
                tiposDoc
                    .map(
                        (value) =>
                            Number(
                                value
                            )
                    )
                    .filter(
                        Number.isFinite
                    )
            )
        );

    const foliosNumericos =
        Array.from(
            new Set(
                folios
                    .map(
                        (value) =>
                            Number(
                                value
                            )
                    )
                    .filter(
                        Number.isFinite
                    )
            )
        );

    const [
        conciliaciones,
        vencimientos,
        recordatorios,
        facturasDte,
        receptoresCobranza,
        detallesEmpresa,
    ] = await Promise.all([
        prisma.rcvConciliacion.findMany({
            where: {
                ...whereConciliaciones,
                tipoRcv,
            },

            orderBy: {
                conciliadoAt:
                    "desc",
            },
        }),

        prisma.rcvVencimiento.findMany({
            where:
                whereDocumentos,
        }),

        prisma.rcvRecordatorioEnvio.findMany({
            where: {
                ...whereDocumentos,

                tipoRcv,

                automatico:
                    true,
            },

            orderBy: [
                {
                    createdAt:
                        "desc",
                },
            ],
        }),

        /*
         * DTE ya guardados localmente.
         *
         * Esto NO consulta BaseAPI/SII.
         */
        empresasEncontradas.length >
            0 &&
            tiposDteNumericos.length >
            0 &&
            foliosNumericos.length >
            0
            ? prisma.facturaDTE.findMany({
                where: {
                    empresaAlias: {
                        in:
                            empresasEncontradas,
                    },

                    tipoDTE: {
                        in:
                            tiposDteNumericos,
                    },

                    folio: {
                        in:
                            foliosNumericos,
                    },

                    fechaVencimiento: {
                        not:
                            null,
                    },
                },

                select: {
                    empresaAlias:
                        true,

                    tipoDTE:
                        true,

                    folio:
                        true,

                    fechaVencimiento:
                        true,
                },
            })
            : Promise.resolve([]),

        /*
         * ReceptorCobranza es la fuente principal
         * para días de crédito.
         *
         * NO filtramos recibeCobranza.
         * Ese flag controla envío, no vencimiento.
         */
        prisma.receptorCobranza.findMany({
            where: {
                activo:
                    true,

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
        }),

        /*
         * Fallback legacy.
         */
        prisma.detalleEmpresa.findMany({
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
            getConciliacionKey(
                conciliacion.empresaKey,
                conciliacion.tipoDoc,
                conciliacion.folio,
                conciliacion.rutContraparte
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

    const recordatoriosMap =
        new Map<
            string,
            typeof recordatorios
        >();

    const facturaDteMap =
        new Map<
            string,
            Date
        >();

    const diasCreditoPorRut =
        new Map<
            string,
            {
                dias:
                number;

                origen:
                "RECEPTOR_COBRANZA" |
                "DETALLE_EMPRESA";
            }
        >();

    /*
     * Primero legacy.
     */
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

        const rut =
            getCreditoRutKey(
                detalle.rut
            );

        if (!rut) {
            continue;
        }

        diasCreditoPorRut.set(
            rut,
            {
                dias:
                    detalle.diasCredito,

                origen:
                    "DETALLE_EMPRESA",
            }
        );
    }

    /*
     * Después ReceptorCobranza,
     * para que sobrescriba legacy.
     */
    for (
        const receptor
        of receptoresCobranza
    ) {
        if (
            receptor.diasCredito ===
            null
        ) {
            continue;
        }

        const rut =
            getCreditoRutKey(
                receptor.rut
            );

        if (!rut) {
            continue;
        }

        diasCreditoPorRut.set(
            rut,
            {
                dias:
                    receptor.diasCredito,

                origen:
                    "RECEPTOR_COBRANZA",
            }
        );
    }

    for (
        const factura
        of facturasDte
    ) {
        if (
            !factura.fechaVencimiento
        ) {
            continue;
        }

        const key =
            getFacturaDteKey(
                String(
                    factura.empresaAlias
                ),
                String(
                    factura.tipoDTE
                ),
                String(
                    factura.folio
                )
            );

        facturaDteMap.set(
            key,
            factura.fechaVencimiento
        );
    }

    for (
        const recordatorio
        of recordatorios
    ) {
        const key =
            getRecordatorioKey(
                recordatorio.empresaKey,
                recordatorio.tipoRcv,
                recordatorio.tipoDoc,
                recordatorio.folio
            );

        const actuales =
            recordatoriosMap.get(
                key
            ) ??
            [];

        actuales.push(
            recordatorio
        );

        recordatoriosMap.set(
            key,
            actuales
        );
    }

    for (
        const vencimiento
        of vencimientos
    ) {
        const key =
            getVencimientoKey(
                vencimiento.empresaKey,
                vencimiento.tipoDoc,
                vencimiento.folio
            );

        vencimientoMap.set(
            key,
            vencimiento
        );
    }

    const ahora =
        new Date();

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

        const rutContraparte =
            getRutContraparteDocumento(
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
                    automatizacion: crearResumenAutomatizacionVacio(),
                });

                continue;
            }

            const dias =
                calcularDiasDiferencia(
                    fechaDocumento,
                    ahora
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

                automatizacion: crearResumenAutomatizacionVacio(),
            });

            continue;
        }

        const conciliacionKey =
            getConciliacionKey(
                empresaKey,
                tipoDoc,
                folio,
                rutContraparte
            );

        const vencimientoKey =
            getVencimientoKey(
                empresaKey,
                tipoDoc,
                folio
            );


        const recordatorioKey =
            getRecordatorioKey(
                empresaKey,
                tipoRcv,
                tipoDoc,
                folio
            );

        const recordatoriosDocumento =
            recordatoriosMap.get(
                recordatorioKey
            ) ?? [];

        const automatizacion =
            resumirAutomatizacionCobranza(
                recordatoriosDocumento
            );

        /*
         * 1. CONCILIACIÓN
         */

        const conciliacion =
            conciliacionMap.get(
                conciliacionKey
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

                automatizacion
            });

            continue;
        }

        /*
         * 2. OVERRIDE MANUAL
         */

        const vencimientoOverride =
            vencimientoMap.get(
                vencimientoKey
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
                    ahora
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

                automatizacion
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
                    ahora
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

                automatizacion
            });

            continue;
        }

        /*
 * 4. FACTURA DTE CACHEADA
 *
 * Solo llegamos aquí si el documento RCV
 * no traía vencimiento.
 */

        const facturaDteKey =
            getFacturaDteKey(
                empresaKey,
                tipoDoc,
                folio
            );

        const fechaFacturaDte =
            facturaDteMap.get(
                facturaDteKey
            );

        if (
            fechaFacturaDte
        ) {
            const fecha =
                normalizarFechaDia(
                    fechaFacturaDte
                );

            const dias =
                calcularDiasDiferencia(
                    fecha,
                    ahora
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
                        "DTE_CACHE",
                },

                automatizacion,
            });

            continue;
        }

        /*
         * 5. DÍAS DE CRÉDITO
         */

        const credito =
            diasCreditoPorRut.get(
                rutContraparte
            );

        if (
            credito &&
            credito.dias >= 0
        ) {
            const fechaEmision =
                obtenerFechaEmisionDocumento(
                    documento
                );

            if (
                fechaEmision
            ) {
                const fechaVencimiento =
                    sumarDiasFecha(
                        fechaEmision,
                        credito.dias
                    );

                const dias =
                    calcularDiasDiferencia(
                        fechaVencimiento,
                        ahora
                    );

                /*
                 * Dejamos además estos datos sobre
                 * el documento porque la automatización
                 * ya utiliza esa nomenclatura.
                 */
                documento.diasCreditoCobranza =
                    credito.dias;

                documento.origenVencimientoCobranza =
                    credito.origen;

                resultados.push({
                    documento,

                    estado: {
                        estadoPago:
                            dias > 0
                                ? "VENCIDA"
                                : "PENDIENTE",

                        fechaVencimiento:
                            fechaVencimiento,

                        fechaVencimientoIso:
                            fechaVencimiento
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
                            credito.origen,
                    },

                    automatizacion,
                });

                continue;
            }
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

            automatizacion
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
            automatizacion
        }) => {
            const result = {
                ...documento,

                estadoPago:
                    estado.estadoPago,

                fechaVencimientoCobranza:
                    estado.fechaVencimientoIso,

                diasDiferenciaCobranza:
                    estado.diasDiferencia,

                diasCreditoCobranza:
                    typeof documento
                        ?.diasCreditoCobranza ===
                        "number"
                        ? documento
                            .diasCreditoCobranza
                        : null,

                conciliada:
                    estado.conciliada,

                origenVencimiento:
                    estado.origenVencimiento,

                cobranzaAutomatica:
                    automatizacion,
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