// src/service/simple-api/simpleapi.service.ts
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { getSiiApiCache, saveSiiApiCache, } from "./simple-api-cache.service.js";
// ============================================================
// Helpers
// ============================================================
function limpiarRut(rut) {
    return String(rut ?? "")
        .replace(/\./g, "")
        .trim()
        .toUpperCase();
}
function toInt(value) {
    if (value === null || value === undefined || value === "")
        return 0;
    const cleaned = String(value)
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
function getAmbienteSimpleApi() {
    // SimpleAPI doc:
    // Ambiente: 1 producción, 0 certificación.
    //
    // Para consultar RCV real del SII normalmente debe ser 1.
    // Si quieres controlar por .env:
    // SII_AMBIENTE=produccion -> 1
    // SII_AMBIENTE=certificacion -> 0
    const ambiente = process.env.SII_AMBIENTE?.toLowerCase().trim();
    if (ambiente === "certificacion")
        return 0;
    return 1;
}
function getCertBuffer() {
    const certPath = process.env.SII_CERT_PATH?.trim();
    const certBase64 = process.env.SII_CERT_BASE64?.trim();
    if (certPath) {
        if (!fs.existsSync(certPath)) {
            throw new Error(`No existe el certificado PFX en la ruta configurada: ${certPath}`);
        }
        const buffer = fs.readFileSync(certPath);
        if (buffer.length < 1000) {
            throw new Error(`El certificado PFX parece inválido o incompleto. Bytes leídos desde SII_CERT_PATH: ${buffer.length}`);
        }
        return buffer;
    }
    if (certBase64) {
        const buffer = Buffer.from(certBase64, "base64");
        if (buffer.length < 1000) {
            throw new Error(`El certificado PFX en SII_CERT_BASE64 parece inválido o incompleto. Bytes decodificados: ${buffer.length}`);
        }
        return buffer;
    }
    throw new Error("Falta SII_CERT_PATH o SII_CERT_BASE64 para adjuntar el certificado PFX");
}
function getSimpleApiKey() {
    const apiKey = process.env.SIMPLEAPI_KEY?.trim();
    if (!apiKey) {
        throw new Error("Falta variable de entorno SIMPLEAPI_KEY");
    }
    return apiKey;
}
function getSimpleApiRcvUrl() {
    const rcvUrl = process.env.SIMPLEAPI_RCV_URL?.trim();
    if (!rcvUrl) {
        throw new Error("Falta variable de entorno SIMPLEAPI_RCV_URL");
    }
    return rcvUrl.replace(/\/+$/, "");
}
function getRutCertificado() {
    const rutCertificado = process.env.RUT_FIRMANTE?.trim();
    if (!rutCertificado) {
        throw new Error("Falta variable de entorno RUT_FIRMANTE");
    }
    return limpiarRut(rutCertificado);
}
function getCertPassword() {
    const password = process.env.SII_CERT_PASSWORD;
    if (!password) {
        throw new Error("Falta variable de entorno SII_CERT_PASSWORD");
    }
    return password;
}
function getRutEmpresa(rutEmpresaOverride) {
    const rutEmpresa = rutEmpresaOverride ?? process.env.RUT_EMPRESA;
    if (!rutEmpresa) {
        throw new Error("Falta RUT_EMPRESA o rutEmpresaOverride");
    }
    return limpiarRut(rutEmpresa);
}
function safeJsonParse(rawText) {
    try {
        return JSON.parse(rawText);
    }
    catch {
        throw new Error(`SimpleAPI RCV respuesta no es JSON: ${rawText.slice(0, 300)}`);
    }
}
// ============================================================
// Llamada base SimpleAPI RCV
// ============================================================
async function callSimpleAPIRCV(urlCompleta, rutEmpresaOverride) {
    const apiKey = getSimpleApiKey();
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const rutCertificado = getRutCertificado();
    const certPassword = getCertPassword();
    const certBuffer = getCertBuffer();
    const input = {
        RutCertificado: rutCertificado,
        RutEmpresa: rutEmpresa,
        Ambiente: getAmbienteSimpleApi(),
        Password: certPassword,
    };
    const formData = new FormData();
    formData.append("input", JSON.stringify(input));
    formData.append("files", certBuffer, {
        filename: "certificado.pfx",
        contentType: "application/octet-stream",
    });
    console.log("📡 SimpleAPI RCV URL:", urlCompleta);
    console.log("📡 RCV RutEmpresa:", rutEmpresa);
    console.log("🔑 SIMPLEAPI_KEY cargada:", {
        exists: Boolean(apiKey),
        length: apiKey.length,
        prefix: apiKey.slice(0, 4),
        suffix: apiKey.slice(-4),
    });
    console.log("📦 RCV form-data:", {
        inputKeys: Object.keys(input).map((key) => key.toLowerCase().includes("password") ? `${key}:***` : key),
        hasFile: certBuffer.length > 0,
        certBytes: certBuffer.length,
    });
    const response = await axios.request({
        method: "POST",
        url: urlCompleta,
        data: formData,
        timeout: 180000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        headers: {
            Authorization: apiKey,
            Accept: "application/json, text/plain, */*",
            ...formData.getHeaders(),
        },
        validateStatus: () => true,
        transformResponse: [(data) => data],
    });
    const rawText = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? "");
    console.log("📥 RCV STATUS:", response.status);
    console.log("📥 RCV RAW:", rawText.slice(0, 1200));
    if (!rawText.trim()) {
        throw new Error(`SimpleAPI RCV respuesta vacía (${response.status})`);
    }
    const data = safeJsonParse(rawText);
    if (response.status < 200 || response.status >= 300) {
        if (data?.mensaje) {
            throw new Error(String(data.mensaje));
        }
        if (data?.error) {
            throw new Error(String(data.error));
        }
        throw new Error(`SimpleAPI RCV error ${response.status}: ${JSON.stringify(data)}`);
    }
    return data;
}
// ============================================================
// Normalizadores
// ============================================================
function normalizarResumenVenta(item) {
    return {
        tipoDte: toInt(item?.tipoDte),
        tipoDteString: item?.tipoDteString ?? "",
        totalDocumentos: toInt(item?.totalDocumentos),
        montoExento: toInt(item?.montoExento),
        montoNeto: toInt(item?.montoNeto),
        ivaRecuperable: toInt(item?.ivaRecuperable),
        ivaUsoComun: toInt(item?.ivaUsoComun),
        ivaNoRecuperable: toInt(item?.ivaNoRecuperable),
        montoTotal: toInt(item?.montoTotal),
        estado: item?.estado ?? null,
    };
}
function normalizarVenta(item) {
    return {
        folio: toInt(item?.folio ?? item?.Folio),
        tipoDTE: toInt(item?.tipoDte ?? item?.tipoDTE ?? item?.TipoDTE),
        tipoDTEString: item?.tipoDTEString ?? item?.tipoDteString ?? undefined,
        tipoVenta: item?.tipoVenta ?? undefined,
        rutReceptor: limpiarRut(item?.rutCliente ??
            item?.rutReceptor ??
            item?.RutReceptor ??
            ""),
        razonSocialReceptor: item?.razonSocial ??
            item?.razonSocialReceptor ??
            item?.RazonSocialReceptor ??
            item?.cliente ??
            "",
        fechaEmision: item?.fechaEmision ??
            item?.FechaEmision ??
            item?.fecha ??
            "",
        fechaRecepcion: item?.fechaRecepcion ??
            item?.FechaRecepcion ??
            undefined,
        fechaAcuseRecibo: item?.fechaAcuseRecibo ??
            item?.FechaAcuseRecibo ??
            undefined,
        montoExento: toInt(item?.montoExento ?? item?.MontoExento),
        montoNeto: toInt(item?.montoNeto ?? item?.MontoNeto),
        montoIVA: toInt(item?.montoIva ?? item?.montoIVA ?? item?.iva ?? item?.IVA),
        montoIvaRecuperable: toInt(item?.montoIvaRecuperable ??
            item?.montoIVARecuperable ??
            item?.ivaRecuperable),
        montoTotal: toInt(item?.montoTotal ?? item?.MontoTotal),
        estado: item?.estado ?? item?.Estado ?? "",
        raw: item,
    };
}
function normalizarResumenCompra(item) {
    return {
        tipoDte: toInt(item?.tipoDte),
        tipoDteString: item?.tipoDteString ?? "",
        totalDocumentos: toInt(item?.totalDocumentos),
        montoExento: toInt(item?.montoExento),
        montoNeto: toInt(item?.montoNeto),
        ivaRecuperable: toInt(item?.ivaRecuperable),
        ivaUsoComun: toInt(item?.ivaUsoComun),
        ivaNoRecuperable: toInt(item?.ivaNoRecuperable),
        montoTotal: toInt(item?.montoTotal),
        estado: item?.estado ?? null,
    };
}
function normalizarCompra(item) {
    return {
        folio: toInt(item?.folio ?? item?.Folio),
        tipoDTE: toInt(item?.tipoDte ?? item?.tipoDTE ?? item?.TipoDTE),
        tipoDTEString: item?.tipoDTEString ?? item?.tipoDteString ?? undefined,
        tipoCompra: item?.tipoCompra ?? item?.tipoCompraString ?? undefined,
        rutProveedor: limpiarRut(item?.rutProveedor ??
            item?.rutEmisor ??
            item?.RutProveedor ??
            item?.RutEmisor ??
            ""),
        razonSocialProveedor: item?.razonSocialProveedor ??
            item?.razonSocialEmisor ??
            item?.razonSocial ??
            item?.proveedor ??
            item?.RazonSocialProveedor ??
            "",
        fechaEmision: item?.fechaEmision ??
            item?.FechaEmision ??
            item?.fecha ??
            "",
        fechaRecepcion: item?.fechaRecepcion ??
            item?.FechaRecepcion ??
            undefined,
        fechaAcuse: item?.fechaAcuse ??
            item?.fechaAcuseRecibo ??
            item?.FechaAcuse ??
            undefined,
        montoExento: toInt(item?.montoExento ?? item?.MontoExento),
        montoNeto: toInt(item?.montoNeto ?? item?.MontoNeto),
        montoIVA: toInt(item?.montoIva ?? item?.montoIVA ?? item?.iva ?? item?.IVA),
        montoIvaRecuperable: toInt(item?.montoIvaRecuperable ??
            item?.montoIVARecuperable ??
            item?.ivaRecuperable),
        montoIvaNoRecuperable: toInt(item?.montoIvaNoRecuperable ??
            item?.montoIVANoRecuperable ??
            item?.ivaNoRecuperable),
        montoTotal: toInt(item?.montoTotal ?? item?.MontoTotal),
        estado: item?.estado ?? item?.Estado ?? "",
        raw: item,
    };
}
// ============================================================
// Consulta mensual completa: detalle ventas
// GET /api/facturas/ventas?empresa=econnet&mes=01&ano=2026&refresh=true
// ============================================================
export async function consultarVentasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh = false) {
    const resumenResult = await consultarResumenVentasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh);
    const raw = resumenResult.data;
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const mesPadded = String(mes).padStart(2, "0");
    const detalleRaw = raw?.ventas?.detalleVentas ??
        raw?.ventas?.DetalleVentas ??
        [];
    const resumenesRaw = raw?.ventas?.resumenes ??
        raw?.ventas?.Resumenes ??
        [];
    const ventas = Array.isArray(detalleRaw)
        ? detalleRaw.map(normalizarVenta)
        : [];
    const resumenes = Array.isArray(resumenesRaw)
        ? resumenesRaw.map(normalizarResumenVenta)
        : [];
    return {
        source: resumenResult.source,
        data: {
            rut: rutEmpresa,
            mes: mesPadded,
            ano,
            periodo: `${ano}${mesPadded}`,
            resumenes,
            ventas,
            total: ventas.length,
            raw,
        },
    };
}
// ============================================================
// Consulta mensual resumen/raw
// GET /api/facturas/ventas/resumen?empresa=econnet&mes=01&ano=2026
// ============================================================
export async function consultarResumenVentasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh = false) {
    const rcvUrl = getSimpleApiRcvUrl();
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const mesPadded = String(mes).padStart(2, "0");
    if (!forceRefresh) {
        const cached = await getSiiApiCache({
            empresaKey,
            rutEmpresa,
            tipo: "ventas",
            mes: mesPadded,
            ano,
        });
        if (cached) {
            console.log("💾 RCV ventas desde caché BD:", {
                empresaKey,
                rutEmpresa,
                mes: mesPadded,
                ano,
                updatedAt: cached.updatedAt,
            });
            return {
                source: "cache",
                data: cached.data,
            };
        }
    }
    const urlCompleta = `${rcvUrl}/api/RCV/ventas/${mesPadded}/${ano}`;
    console.log("📊 Consultando SimpleAPI RCV Ventas por mes:", {
        empresaKey,
        rutEmpresa,
        mes: mesPadded,
        ano,
        forceRefresh,
    });
    const data = await callSimpleAPIRCV(urlCompleta, rutEmpresa);
    await saveSiiApiCache({
        empresaKey,
        rutEmpresa,
        tipo: "ventas",
        mes: mesPadded,
        ano,
    }, data);
    return {
        source: "simpleapi",
        data,
    };
}
export async function consultarComprasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh = false) {
    const resumenResult = await consultarResumenComprasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh);
    const raw = resumenResult.data;
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const mesPadded = String(mes).padStart(2, "0");
    const detalleRaw = raw?.compras?.detalleCompras ??
        raw?.compras?.DetalleCompras ??
        [];
    const resumenesRaw = raw?.compras?.resumenes ??
        raw?.compras?.Resumenes ??
        [];
    const compras = Array.isArray(detalleRaw)
        ? detalleRaw.map(normalizarCompra)
        : [];
    const resumenes = Array.isArray(resumenesRaw)
        ? resumenesRaw.map(normalizarResumenCompra)
        : [];
    return {
        source: resumenResult.source,
        data: {
            rut: rutEmpresa,
            mes: mesPadded,
            ano,
            periodo: `${ano}${mesPadded}`,
            resumenes,
            compras,
            total: compras.length,
            raw,
        },
    };
}
export async function consultarResumenComprasRCV(mes, ano, empresaKey, rutEmpresaOverride, forceRefresh = false) {
    const rcvUrl = getSimpleApiRcvUrl();
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const mesPadded = String(mes).padStart(2, "0");
    if (!forceRefresh) {
        const cached = await getSiiApiCache({
            empresaKey,
            rutEmpresa,
            tipo: "compras",
            mes: mesPadded,
            ano,
        });
        if (cached) {
            console.log("💾 RCV compras desde caché BD:", {
                empresaKey,
                rutEmpresa,
                mes: mesPadded,
                ano,
                updatedAt: cached.updatedAt,
            });
            return {
                source: "cache",
                data: cached.data,
            };
        }
    }
    const urlCompleta = `${rcvUrl}/api/RCV/compras/${mesPadded}/${ano}`;
    console.log("📊 Consultando SimpleAPI RCV Compras por mes:", {
        empresaKey,
        rutEmpresa,
        mes: mesPadded,
        ano,
        forceRefresh,
    });
    const data = await callSimpleAPIRCV(urlCompleta, rutEmpresa);
    await saveSiiApiCache({
        empresaKey,
        rutEmpresa,
        tipo: "compras",
        mes: mesPadded,
        ano,
    }, data);
    return {
        source: "simpleapi",
        data,
    };
}
// ============================================================
// Utilidad opcional para limpiar caché manualmente desde código
// ============================================================
export function limpiarCacheRCV() {
    console.log("ℹ️ La caché RCV ahora está en BD usando SiiApiCache.");
}
//# sourceMappingURL=simpleapi.service.js.map