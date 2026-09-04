// src/service/baseapi/cobranza/cobranza-estado.service.ts
import { prisma } from "../../../lib/prisma.js";
import { getOverride as getVencimientoOverride } from "../../../controllers/baseapi/rcv-vencimientos.store.js";
/* =========================================================
   HELPERS
========================================================= */
function normalizarFechaDia(value) {
    const fecha = new Date(value);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
}
function parseFecha(value) {
    if (value === null ||
        value === undefined ||
        value === "") {
        return null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    /* ===============================
       YYYY-MM-DD
    =============================== */
    const fechaIsoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fechaIsoMatch) {
        const year = Number(fechaIsoMatch[1] ??
            "");
        const month = Number(fechaIsoMatch[2] ??
            "");
        const day = Number(fechaIsoMatch[3] ??
            "");
        const date = new Date(year, month - 1, day);
        if (Number.isNaN(date.getTime()) ||
            date.getFullYear() !==
                year ||
            date.getMonth() !==
                month - 1 ||
            date.getDate() !==
                day) {
            return null;
        }
        return date;
    }
    /* ===============================
       DD/MM/YYYY
    =============================== */
    const fechaLatinaMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fechaLatinaMatch) {
        const day = Number(fechaLatinaMatch[1] ??
            "");
        const month = Number(fechaLatinaMatch[2] ??
            "");
        const year = Number(fechaLatinaMatch[3] ??
            "");
        const date = new Date(year, month - 1, day);
        if (Number.isNaN(date.getTime()) ||
            date.getFullYear() !==
                year ||
            date.getMonth() !==
                month - 1 ||
            date.getDate() !==
                day) {
            return null;
        }
        return date;
    }
    /* ===============================
       ISO CON HORA / OTROS FORMATOS
    =============================== */
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}
function normalizarRut(value) {
    return String(value ?? "")
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .trim();
}
function getRutContraparteDocumento(doc) {
    return normalizarRut(doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rut ??
        doc?.RUT ??
        "");
}
function obtenerFechaVencimientoDocumento(doc) {
    const candidates = [
        doc?.FchVenc,
        doc?.FchVencimiento,
        doc?.fechaVencimiento,
        doc?.vencimiento,
        doc?.fecha_vencimiento,
        doc?.Vencimiento,
    ];
    for (const value of candidates) {
        const parsed = parseFecha(value);
        if (parsed) {
            return parsed;
        }
    }
    return null;
}
function calcularDiasDiferencia(fechaVencimiento, referencia = new Date()) {
    const vencimiento = normalizarFechaDia(fechaVencimiento);
    const hoy = normalizarFechaDia(referencia);
    const diferenciaMs = hoy.getTime() -
        vencimiento.getTime();
    return Math.round(diferenciaMs /
        86_400_000);
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
export function getDiasCobranza(fechaVencimiento, referencia = new Date()) {
    return calcularDiasDiferencia(fechaVencimiento, referencia);
}
/* =========================================================
   ESTADO DE UN DOCUMENTO
========================================================= */
export async function obtenerEstadoDocumentoCobranza(doc, tipoRcv, empresaFallback) {
    const tipoDoc = String(doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        "").trim();
    const folio = String(doc?.["Folio"] ??
        doc?.folio ??
        doc?.Nro ??
        doc?.numero ??
        "").trim();
    const rutContraparte = getRutContraparteDocumento(doc);
    const empresaRaw = String(doc?.empresaOrigen ??
        doc?.empresa ??
        doc?.empresaKey ??
        empresaFallback ??
        "")
        .trim()
        .toLowerCase();
    const empresaKey = empresaRaw ===
        "econnet" ||
        empresaRaw ===
            "rids"
        ? empresaRaw
        : null;
    if (!empresaKey ||
        !tipoDoc ||
        !folio) {
        const fechaDocumento = obtenerFechaVencimientoDocumento(doc);
        if (!fechaDocumento) {
            return {
                estadoPago: "PENDIENTE",
                fechaVencimiento: null,
                fechaVencimientoIso: null,
                diasDiferencia: null,
                conciliada: false,
                origenVencimiento: "SIN_FECHA",
            };
        }
        const dias = calcularDiasDiferencia(fechaDocumento);
        return {
            estadoPago: dias > 0
                ? "VENCIDA"
                : "PENDIENTE",
            fechaVencimiento: fechaDocumento,
            fechaVencimientoIso: fechaDocumento
                .toISOString()
                .slice(0, 10),
            diasDiferencia: dias,
            conciliada: false,
            origenVencimiento: "DOCUMENTO",
        };
    }
    /* =====================================================
       1. BUSCAR CONCILIACIÓN
    ===================================================== */
    const conciliacion = await prisma.rcvConciliacion.findFirst({
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
            conciliadoAt: "desc",
        },
    });
    if (conciliacion
        ?.estadoConciliacion ===
        "CONCILIADA") {
        return {
            estadoPago: "CONFIRMADA",
            fechaVencimiento: null,
            fechaVencimientoIso: null,
            diasDiferencia: null,
            conciliada: true,
            origenVencimiento: "SIN_FECHA",
        };
    }
    /* =====================================================
       2. BUSCAR OVERRIDE DE VENCIMIENTO
    ===================================================== */
    const override = await getVencimientoOverride(empresaKey, tipoDoc, folio);
    if (override) {
        const fechaOverride = parseFecha(override);
        if (fechaOverride) {
            const dias = calcularDiasDiferencia(fechaOverride);
            return {
                estadoPago: dias > 0
                    ? "VENCIDA"
                    : "PENDIENTE",
                fechaVencimiento: fechaOverride,
                fechaVencimientoIso: fechaOverride
                    .toISOString()
                    .slice(0, 10),
                diasDiferencia: dias,
                conciliada: false,
                origenVencimiento: "OVERRIDE",
            };
        }
    }
    /* =====================================================
       3. FECHA DEL DOCUMENTO
    ===================================================== */
    const fechaDocumento = obtenerFechaVencimientoDocumento(doc);
    if (fechaDocumento) {
        const dias = calcularDiasDiferencia(fechaDocumento);
        return {
            estadoPago: dias > 0
                ? "VENCIDA"
                : "PENDIENTE",
            fechaVencimiento: fechaDocumento,
            fechaVencimientoIso: fechaDocumento
                .toISOString()
                .slice(0, 10),
            diasDiferencia: dias,
            conciliada: false,
            origenVencimiento: "DOCUMENTO",
        };
    }
    /* =====================================================
       4. SIN VENCIMIENTO
    ===================================================== */
    return {
        estadoPago: "PENDIENTE",
        fechaVencimiento: null,
        fechaVencimientoIso: null,
        diasDiferencia: null,
        conciliada: false,
        origenVencimiento: "SIN_FECHA",
    };
}
/* =========================================================
   ANOTAR DOCUMENTO
========================================================= */
export async function anotarDocumentoCobranza(doc, tipoRcv, empresaFallback) {
    const estado = await obtenerEstadoDocumentoCobranza(doc, tipoRcv, empresaFallback);
    const result = {
        ...doc,
        estadoPago: estado.estadoPago,
    };
    if (estado.fechaVencimientoIso) {
        for (const key of [
            "FchVenc",
            "FchVencimiento",
            "fechaVencimiento",
            "vencimiento",
            "fecha_vencimiento",
            "Vencimiento",
        ]) {
            result[key] =
                estado.fechaVencimientoIso;
        }
    }
    return result;
}
function getConciliacionKey(empresaKey, tipoDoc, folio, rutContraparte) {
    return [
        String(empresaKey ??
            "")
            .trim()
            .toLowerCase(),
        String(tipoDoc ??
            "").trim(),
        String(folio ??
            "").trim(),
        normalizarRut(rutContraparte),
    ].join("|");
}
function getVencimientoKey(empresaKey, tipoDoc, folio) {
    return [
        String(empresaKey ??
            "")
            .trim()
            .toLowerCase(),
        String(tipoDoc ??
            "").trim(),
        String(folio ??
            "").trim(),
    ].join("|");
}
function getEmpresaDocumento(doc, empresaFallback) {
    const empresaRaw = String(doc?.empresaOrigen ??
        doc?.empresa ??
        doc?.empresaKey ??
        empresaFallback ??
        "")
        .trim()
        .toLowerCase();
    if (empresaRaw === "econnet" ||
        empresaRaw === "rids") {
        return empresaRaw;
    }
    return null;
}
function getTipoDocDocumento(doc) {
    return String(doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        "").trim();
}
function getFolioDocumento(doc) {
    return String(doc?.["Folio"] ??
        doc?.folio ??
        doc?.Nro ??
        doc?.numero ??
        "").trim();
}
export async function obtenerEstadosDocumentosCobranza(documentos, tipoRcv, empresaFallback) {
    if (!Array.isArray(documentos) || documentos.length === 0) {
        return [];
    }
    const empresasEncontradas = Array.from(new Set(documentos
        .map((doc) => getEmpresaDocumento(doc, empresaFallback))
        .filter((value) => value !== null)));
    const folios = Array.from(new Set(documentos
        .map((doc) => getFolioDocumento(doc))
        .filter(Boolean)));
    const tiposDoc = Array.from(new Set(documentos
        .map((doc) => getTipoDocDocumento(doc))
        .filter(Boolean)));
    const rutsContraparte = Array.from(new Set(documentos
        .map((doc) => getRutContraparteDocumento(doc))
        .filter(Boolean)));
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
    const whereDocumentos = {
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
    const whereConciliaciones = {
        ...whereDocumentos,
        ...(rutsContraparte.length > 0
            ? {
                rutContraparte: {
                    in: rutsContraparte,
                },
            }
            : {}),
    };
    const [conciliaciones, vencimientos,] = await Promise.all([
        prisma.rcvConciliacion.findMany({
            where: {
                ...whereConciliaciones,
                tipoRcv,
            },
            orderBy: {
                conciliadoAt: "desc",
            },
        }),
        prisma.rcvVencimiento.findMany({
            where: whereDocumentos,
        }),
    ]);
    /*
     * IMPORTANTE:
     *
     * Como las conciliaciones vienen ordenadas de más reciente
     * a más antigua, guardamos solamente la primera que encontremos
     * para cada documento.
     */
    const conciliacionMap = new Map();
    for (const conciliacion of conciliaciones) {
        const key = getConciliacionKey(conciliacion.empresaKey, conciliacion.tipoDoc, conciliacion.folio, conciliacion.rutContraparte);
        if (!conciliacionMap.has(key)) {
            conciliacionMap.set(key, conciliacion);
        }
    }
    const vencimientoMap = new Map();
    for (const vencimiento of vencimientos) {
        const key = getVencimientoKey(vencimiento.empresaKey, vencimiento.tipoDoc, vencimiento.folio);
        vencimientoMap.set(key, vencimiento);
    }
    const hoy = normalizarFechaDia(new Date());
    const resultados = [];
    for (const documento of documentos) {
        const empresaKey = getEmpresaDocumento(documento, empresaFallback);
        const tipoDoc = getTipoDocDocumento(documento);
        const folio = getFolioDocumento(documento);
        const rutContraparte = getRutContraparteDocumento(documento);
        /*
         * Si el documento no tiene identificadores suficientes,
         * hacemos fallback solamente a su fecha.
         */
        if (!empresaKey ||
            !tipoDoc ||
            !folio) {
            const fechaDocumento = obtenerFechaVencimientoDocumento(documento);
            if (!fechaDocumento) {
                resultados.push({
                    documento,
                    estado: {
                        estadoPago: "PENDIENTE",
                        fechaVencimiento: null,
                        fechaVencimientoIso: null,
                        diasDiferencia: null,
                        conciliada: false,
                        origenVencimiento: "SIN_FECHA",
                    },
                });
                continue;
            }
            const dias = calcularDiasDiferencia(fechaDocumento, hoy);
            resultados.push({
                documento,
                estado: {
                    estadoPago: dias > 0
                        ? "VENCIDA"
                        : "PENDIENTE",
                    fechaVencimiento: fechaDocumento,
                    fechaVencimientoIso: fechaDocumento
                        .toISOString()
                        .slice(0, 10),
                    diasDiferencia: dias,
                    conciliada: false,
                    origenVencimiento: "DOCUMENTO",
                },
            });
            continue;
        }
        const conciliacionKey = getConciliacionKey(empresaKey, tipoDoc, folio, rutContraparte);
        const vencimientoKey = getVencimientoKey(empresaKey, tipoDoc, folio);
        /*
         * 1. CONCILIACIÓN
         */
        const conciliacion = conciliacionMap.get(conciliacionKey);
        if (conciliacion
            ?.estadoConciliacion ===
            "CONCILIADA") {
            resultados.push({
                documento,
                estado: {
                    estadoPago: "CONFIRMADA",
                    fechaVencimiento: null,
                    fechaVencimientoIso: null,
                    diasDiferencia: null,
                    conciliada: true,
                    origenVencimiento: "SIN_FECHA",
                },
            });
            continue;
        }
        /*
         * 2. OVERRIDE MANUAL
         */
        const vencimientoOverride = vencimientoMap.get(vencimientoKey);
        if (vencimientoOverride
            ?.fechaVencimiento) {
            const fecha = new Date(vencimientoOverride.fechaVencimiento);
            const dias = calcularDiasDiferencia(fecha, hoy);
            resultados.push({
                documento,
                estado: {
                    estadoPago: dias > 0
                        ? "VENCIDA"
                        : "PENDIENTE",
                    fechaVencimiento: fecha,
                    fechaVencimientoIso: fecha
                        .toISOString()
                        .slice(0, 10),
                    diasDiferencia: dias,
                    conciliada: false,
                    origenVencimiento: "OVERRIDE",
                },
            });
            continue;
        }
        /*
         * 3. FECHA DEL DOCUMENTO
         */
        const fechaDocumento = obtenerFechaVencimientoDocumento(documento);
        if (fechaDocumento) {
            const dias = calcularDiasDiferencia(fechaDocumento, hoy);
            resultados.push({
                documento,
                estado: {
                    estadoPago: dias > 0
                        ? "VENCIDA"
                        : "PENDIENTE",
                    fechaVencimiento: fechaDocumento,
                    fechaVencimientoIso: fechaDocumento
                        .toISOString()
                        .slice(0, 10),
                    diasDiferencia: dias,
                    conciliada: false,
                    origenVencimiento: "DOCUMENTO",
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
                estadoPago: "PENDIENTE",
                fechaVencimiento: null,
                fechaVencimientoIso: null,
                diasDiferencia: null,
                conciliada: false,
                origenVencimiento: "SIN_FECHA",
            },
        });
    }
    return resultados;
}
export async function anotarDocumentosCobranza(documentos, tipoRcv, empresaFallback) {
    const evaluados = await obtenerEstadosDocumentosCobranza(documentos, tipoRcv, empresaFallback);
    return evaluados.map(({ documento, estado, }) => {
        const result = {
            ...documento,
            estadoPago: estado.estadoPago,
            diasDiferenciaCobranza: estado.diasDiferencia,
            origenVencimiento: estado.origenVencimiento,
        };
        if (estado.fechaVencimientoIso) {
            for (const key of [
                "FchVenc",
                "FchVencimiento",
                "fechaVencimiento",
                "vencimiento",
                "fecha_vencimiento",
                "Vencimiento",
            ]) {
                result[key] =
                    estado.fechaVencimientoIso;
            }
        }
        return result;
    });
}
//# sourceMappingURL=cobranza-estado.service.js.map