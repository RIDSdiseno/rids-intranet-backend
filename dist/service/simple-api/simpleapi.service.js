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
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
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
// Añadir alias compatibles con la UI (Cobranza) para cliente y RUT
function addVentaAliases(v) {
    const venta = v;
    const raw = asRecord(v.raw);
    const rut = v.rutReceptor ??
        raw.rutCliente ??
        raw.rutReceptor ??
        undefined;
    const nombre = v.razonSocialReceptor ??
        raw.razonSocial ??
        raw.cliente ??
        "";
    venta.cliente = nombre;
    venta.razon_social = nombre;
    venta.nombre = nombre;
    venta.rutCliente = rut;
    venta.rut = rut;
    venta.neto = Number(v.montoNeto ?? 0);
    venta.iva = Number(v.montoIVA ?? v.montoIvaRecuperable ?? 0);
    venta.total = Number(v.montoTotal ?? 0);
    venta.fecha =
        v.fechaEmision ??
            v.fechaRecepcion ??
            v.fechaAcuseRecibo ??
            null;
    venta.vencimiento =
        raw.vencimiento ??
            raw.fechaVencimiento ??
            null;
    return venta;
}
function hashStringToInt(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
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
    const rawAny = raw;
    const rutEmpresa = getRutEmpresa(rutEmpresaOverride);
    const mesPadded = String(mes).padStart(2, "0");
    const detalleRaw = rawAny?.ventas?.detalleVentas ??
        rawAny?.ventas?.DetalleVentas ??
        [];
    const resumenesRaw = rawAny?.ventas?.resumenes ??
        rawAny?.ventas?.Resumenes ??
        [];
    const ventas = Array.isArray(detalleRaw)
        ? detalleRaw.map(normalizarVenta)
        : [];
    // Añadir alias para compatibilidad con frontend Cobranza
    const ventasConAliases = ventas.map((v) => addVentaAliases(v));
    // Detectar folios referenciados por Notas de Crédito (tipoDTE 61) y Notas de Débito (tipoDTE 56).
    // - `referencedByNC`: folios referenciados por NC (estas facturas deben excluirse de los totales)
    // - `referencedByND`: folios referenciados por ND (marcamos pero NO excluimos)
    const referencedByNC = new Set();
    const referencedByND = new Set();
    ventasConAliases.forEach((v) => {
        const venta = v;
        const tipo = Number(venta.tipoDTE || venta.tipoDte || 0);
        if (tipo === 61 || tipo === 56) {
            try {
                const raw = v.raw ?? {};
                const targetSet = tipo === 61 ? referencedByNC : referencedByND;
                // 1) campos JSON explícitos comunes
                const possibleKeys = [
                    'folioDocReferencia', 'folioDocRef', 'folioRef', 'FolioRef', 'folioReferencia',
                    'folio', 'Folio'
                ];
                for (const key of possibleKeys) {
                    const val = raw[key];
                    const num = Number(val ?? 0);
                    if (Number.isFinite(num) && num > 0)
                        targetSet.add(num);
                }
                // 2) array de referencias en raw
                if (Array.isArray(raw.referencias)) {
                    for (const r of raw.referencias) {
                        const fol = Number(r?.FolioRef ?? r?.folioRef ?? r?.folio ?? r?.Folio ?? 0);
                        if (fol)
                            targetSet.add(fol);
                    }
                }
                // 3) buscar en XML/texto embebido etiquetas <FolioRef>123</FolioRef>
                const rawStr = JSON.stringify(raw || '');
                const xmlMatches = rawStr.matchAll(/<FolioRef>(\d+)<\/FolioRef>/gi);
                for (const m of xmlMatches) {
                    targetSet.add(Number(m[1]));
                }
                // 4) buscar claves JSON tipo "FolioRef":"123" o "folioDocReferencia":"1251"
                const jsonMatches = rawStr.matchAll(/\"(?:FolioRef|folioDocReferencia|folioDocRef|folioRef)\"\s*:\s*\"?(\d+)\"?/gi);
                for (const m of jsonMatches) {
                    targetSet.add(Number(m[1]));
                }
            }
            catch (e) {
                // no bloquear si falla el parseo
            }
        }
    });
    // Heurística adicional: si la NC/ND contiene explícitamente el número de folio
    // de alguna factura presente en el listado (texto plano, XML o JSON), marcar ese folio.
    try {
        const allFolios = ventasConAliases.map((v) => Number(v.folio)).filter((n) => Number.isFinite(n) && n > 0);
        const folioPatterns = allFolios.map((n) => ({ n, re: new RegExp(`\\b${n}\\b`, 'g') }));
        ventasConAliases.forEach((v) => {
            const tipo = Number(v.tipoDTE || v.tipoDte || 0);
            if (tipo === 61 || tipo === 56) {
                try {
                    const rawStr = JSON.stringify(v.raw ?? '').toLowerCase();
                    folioPatterns.forEach(({ n, re }) => {
                        if (re.test(rawStr)) {
                            if (tipo === 61)
                                referencedByNC.add(n);
                            else
                                referencedByND.add(n);
                        }
                    });
                }
                catch { }
            }
        });
    }
    catch { }
    // Marcar cada venta con flags `hasNC` y `hasND` según corresponda (no mutamos el comportamiento de exclusión aquí)
    ventasConAliases.forEach((v) => {
        try {
            const fol = Number(v.folio);
            // @ts-ignore
            v['hasNC'] = fol && referencedByNC.has(fol) ? true : false;
            // @ts-ignore
            v['hasND'] = fol && referencedByND.has(fol) ? true : false;
        }
        catch { }
    });
    try {
        console.log("🧾 Folios referenciados por NC:", Array.from(referencedByNC).sort((a, b) => a - b));
        console.log("🧾 Folios referenciados por ND:", Array.from(referencedByND).sort((a, b) => a - b));
    }
    catch { }
    // Filtrar por tipos que nos interesan en cobranza: Facturas y Notas de Débito.
    // Excluir Notas de Crédito (p. ej. tipoDTE 61) ya que descuentan, no suman.
    const allowedTipoDTE = new Set([33, 34, 56]); // 33: Factura, 34: Factura Exenta, 56: Nota de Débito
    try {
        // ya mostramos arriba los sets por tipo; mantener compatibilidad con logs anteriores
        console.log("🧾 Folios referenciados (NC) detectados:", Array.from(referencedByNC).sort((a, b) => a - b));
    }
    catch { }
    const ventasFiltradasPorTipo = ventasConAliases.filter((v) => {
        // si el folio está explícitamente referenciado por una NC, lo excluimos primero
        try {
            const fol = Number(v.folio);
            if (fol && referencedByNC.has(fol)) {
                // marcar para debug y excluir
                // @ts-ignore
                v['_excludedByNC'] = true;
                return false;
            }
        }
        catch { }
        const venta = v;
        const tipo = Number(venta.tipoDTE || venta.tipoDte || 0);
        if (tipo && allowedTipoDTE.has(tipo))
            return true;
        // fallback por texto si tipoDTE no está presente
        const raw = asRecord(v.raw);
        const txt = String(v.tipoDTEString ||
            v.tipoVenta ||
            raw.tipo ||
            raw.descripcion ||
            "").toLowerCase();
        if (txt.includes('credito'))
            return false;
        if (txt.includes('nota de debito') || txt.includes('nota debito') || txt.includes('debito'))
            return true;
        if (txt.includes('factura'))
            return true;
        // si no podemos identificar, conservamos por defecto (más seguro mostrar)
        return true;
    });
    // Deduplicar ventas por (folio, rutReceptor, tipoDTE) y asignar `id` numérico estable
    const map = new Map();
    ventasFiltradasPorTipo.forEach((v) => {
        const key = `${v.folio}|${v.rutReceptor || ''}|${v.tipoDTE || ''}`;
        if (!map.has(key)) {
            // asegurar id estable
            // @ts-ignore
            if (!v.id) {
                const idSeed = `${key}|${v.razonSocialReceptor || ''}`;
                // @ts-ignore
                v.id = hashStringToInt(idSeed);
            }
            map.set(key, v);
        }
    });
    const ventasUnicas = Array.from(map.values());
    try {
        const excluidos = ventasConAliases
            .filter((v) => v['_excludedByNC'])
            .map((v) => Number(v.folio))
            .filter((n) => Number.isFinite(n));
        if (excluidos.length) {
            console.log('🗑️ Ventas excluidas por NC (folios):', excluidos.sort((a, b) => a - b));
        }
    }
    catch { }
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
            ventas: ventasUnicas,
            total: ventasUnicas.length,
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
            // Si la caché existe pero está vacía (sin detalle ni resumenes),
            // intentamos una consulta fresca a SimpleAPI en lugar de devolver cero inmediato.
            const cachedData = asRecord(cached.data);
            const ventasRaw = asRecord(cachedData.ventas);
            const detalleVentas = ventasRaw.detalleVentas ??
                ventasRaw.DetalleVentas ??
                [];
            const resumenes = ventasRaw.resumenes ??
                ventasRaw.Resumenes ??
                [];
            const estaVacia = (!Array.isArray(detalleVentas) || detalleVentas.length === 0) &&
                (!Array.isArray(resumenes) || resumenes.length === 0);
            if (estaVacia) {
                console.log("💾 Caché vacía detectada — forzando refresh desde SimpleAPI para ventas", { empresaKey, rutEmpresa, mes: mesPadded, ano });
            }
            else {
                return {
                    source: "cache",
                    data: cached.data,
                };
            }
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
    // Intentamos forzar refresh. Si falla la llamada a SimpleAPI y existe una caché previa,
    // devolvemos la caché como fallback en lugar de propagar un 500 al cliente.
    let cachedFallback = null;
    try {
        if (forceRefresh) {
            const maybeCached = await getSiiApiCache({ empresaKey, rutEmpresa, tipo: "ventas", mes: mesPadded, ano });
            if (maybeCached)
                cachedFallback = maybeCached;
        }
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
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[DEBUG] error facturas/ventas:", message);
        if (cachedFallback) {
            console.warn('[DEBUG] SimpleAPI failed; returning cached ventas as fallback');
            return {
                source: 'cache',
                data: cachedFallback.data,
            };
        }
        // si no hay caché, relanzamos para que el caller lo vea (será tratado como 500)
        throw err;
    }
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
            // Si la caché existe pero está vacía (sin detalle ni resumenes),
            // intentamos una consulta fresca a SimpleAPI en lugar de devolver cero inmediato.
            const cachedData = asRecord(cached.data);
            const comprasRaw = asRecord(cachedData.compras);
            const detalleCompras = comprasRaw.detalleCompras ??
                comprasRaw.DetalleCompras ??
                [];
            const resumenes = comprasRaw.resumenes ??
                comprasRaw.Resumenes ??
                [];
            const estaVacia = (!Array.isArray(detalleCompras) || detalleCompras.length === 0) &&
                (!Array.isArray(resumenes) || resumenes.length === 0);
            if (estaVacia) {
                console.log("💾 Caché vacía detectada — forzando refresh desde SimpleAPI para compras", { empresaKey, rutEmpresa, mes: mesPadded, ano });
            }
            else {
                return {
                    source: "cache",
                    data: cached.data,
                };
            }
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