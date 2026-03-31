// simpleapi.service.ts
// ============================================================
// HELPERS
// ============================================================
function truncar(valor, max) {
    const texto = String(valor ?? "").trim();
    return texto.length > max ? texto.slice(0, max) : texto;
}
function toInt(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? Math.round(valor) : 0;
    }
    if (typeof valor === "string") {
        const normalizado = valor
            .replace(/\./g, "")
            .replace(/,/g, ".")
            .replace(/[^\d.-]/g, "");
        const num = Number(normalizado);
        return Number.isFinite(num) ? Math.round(num) : 0;
    }
    return 0;
}
function formatFechaAAAAMMDD(fecha = new Date()) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, "0");
    const day = String(fecha.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function limpiarRut(rut) {
    const limpio = String(rut ?? "")
        .replace(/\./g, "")
        .replace(/\s+/g, "")
        .toUpperCase();
    const match = limpio.match(/^(\d+)-?([\dK])$/i);
    return match ? `${match[1] ?? ""}-${(match[2] ?? "").toUpperCase()}` : limpio;
}
function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function extraerTag(xml, tag) {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = xml.match(regex);
    return match?.[1]?.trim() ?? null;
}
function parseCAF(config) {
    let xml = config.cafXml?.trim();
    if (!xml && config.cafXmlBase64) {
        xml = Buffer.from(config.cafXmlBase64, "base64").toString("utf-8").trim();
    }
    if (!xml) {
        throw new Error("No hay CAF configurado");
    }
    const tipoDTE = Number(extraerTag(xml, "TD"));
    const folioDesde = Number(extraerTag(xml, "D"));
    const folioHasta = Number(extraerTag(xml, "H"));
    return {
        xml,
        tipoDTE: Number.isFinite(tipoDTE) ? tipoDTE : null,
        folioDesde: Number.isFinite(folioDesde) ? folioDesde : null,
        folioHasta: Number.isFinite(folioHasta) ? folioHasta : null,
    };
}
function resolverFolio(factura, cafInfo) {
    const candidatos = [
        factura?.folio,
        factura?.folioDTE,
        factura?.numero,
        factura?.nro,
    ]
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0);
    if (candidatos.length > 0) {
        const folio = candidatos[0];
        if (cafInfo.folioDesde != null &&
            cafInfo.folioHasta != null &&
            (folio < cafInfo.folioDesde || folio > cafInfo.folioHasta)) {
            throw new Error(`El folio ${folio} está fuera del rango del CAF (${cafInfo.folioDesde}-${cafInfo.folioHasta})`);
        }
        return folio;
    }
    if (cafInfo.folioDesde != null) {
        return cafInfo.folioDesde;
    }
    throw new Error("No se pudo resolver el folio del DTE");
}
// ============================================================
// CONFIG
// ============================================================
export function getSimpleAPIConfig() {
    const required = {
        SIMPLEAPI_URL: process.env.SIMPLEAPI_URL,
        SIMPLEAPI_KEY: process.env.SIMPLEAPI_KEY,
        RUT_EMPRESA: process.env.RUT_EMPRESA,
        RAZON_SOCIAL_EMPRESA: process.env.RAZON_SOCIAL_EMPRESA,
        GIRO_EMPRESA: process.env.GIRO_EMPRESA,
        DIRECCION_EMPRESA: process.env.DIRECCION_EMPRESA,
        COMUNA_EMPRESA: process.env.COMUNA_EMPRESA,
        CIUDAD_EMPRESA: process.env.CIUDAD_EMPRESA,
        SII_CERT_BASE64: process.env.SII_CERT_BASE64,
        SII_CERT_PASSWORD: process.env.SII_CERT_PASSWORD,
        RUT_FIRMANTE: process.env.RUT_FIRMANTE,
    };
    const missing = Object.entries(required)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
    }
    return {
        url: process.env.SIMPLEAPI_URL,
        apiKey: process.env.SIMPLEAPI_KEY,
        rutEmpresa: process.env.RUT_EMPRESA,
        razonSocial: process.env.RAZON_SOCIAL_EMPRESA,
        giro: process.env.GIRO_EMPRESA,
        direccion: process.env.DIRECCION_EMPRESA,
        comuna: process.env.COMUNA_EMPRESA,
        ciudad: process.env.CIUDAD_EMPRESA,
        certBase64: process.env.SII_CERT_BASE64,
        certPassword: process.env.SII_CERT_PASSWORD,
        certRut: process.env.RUT_FIRMANTE,
        ambiente: process.env.SII_AMBIENTE === "certificacion" ? 1 : 0,
        cafXml: process.env.SII_CAF_XML,
        cafXmlBase64: process.env.SII_CAF_XML_BASE64,
    };
}
// ============================================================
// OBTENER TOKEN DE SIMPLEAPI (ejecutar una vez y cachear)
// ============================================================
let cachedToken = null;
let tokenExpiry = 0;
async function getSimpleAPIToken(config) {
    const ahora = Date.now();
    if (cachedToken && ahora < tokenExpiry) {
        console.log("🔑 Usando token cacheado");
        return cachedToken;
    }
    console.log("🔑 Obteniendo nuevo token de SimpleAPI...");
    const response = await fetch(`${config.url}/api/Auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: config.apiKey }),
    });
    const rawText = await response.text();
    console.log("🔑 Auth STATUS:", response.status);
    console.log("🔑 Auth RAW:", rawText);
    if (!response.ok || !rawText?.trim()) {
        throw new Error(`SimpleAPI Auth falló (${response.status}): ${rawText || "respuesta vacía"}. ` +
            `Verifica que SIMPLEAPI_KEY sea válida: ${config.apiKey}`);
    }
    let token;
    try {
        const data = JSON.parse(rawText);
        token =
            typeof data === "string"
                ? data
                : (data.token ?? data.access_token ?? data.jwt ?? data.Token);
    }
    catch {
        token = rawText.trim().replace(/^"|"$/g, "");
    }
    if (!token) {
        throw new Error(`SimpleAPI Auth no retornó token. Respuesta: ${rawText}`);
    }
    cachedToken = token;
    tokenExpiry = ahora + 50 * 60 * 1000;
    console.log("✅ Token obtenido:", token.substring(0, 30) + "...");
    return token;
}
// ============================================================
// HELPER: llamada HTTP a SimpleAPI — CON AUTH TOKEN
// ============================================================
async function callSimpleAPI(config, endpoint, body) {
    const token = await getSimpleAPIToken(config);
    const url = `${config.url}${endpoint}`;
    console.log("📡 SimpleAPI URL:", url);
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const rawText = await response.text();
    console.log("📥 STATUS:", response.status);
    console.log("📥 RAW:", rawText || "(vacío)");
    if (response.status === 401) {
        console.log("⚠️ Token expirado, limpiando caché y reintentando...");
        cachedToken = null;
        tokenExpiry = 0;
        const newToken = await getSimpleAPIToken(config);
        const retry = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${newToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        const retryText = await retry.text();
        console.log("📥 RETRY STATUS:", retry.status);
        console.log("📥 RETRY RAW:", retryText);
        if (!retry.ok) {
            throw new Error(`SimpleAPI error ${retry.status} en ${endpoint} (después de reintento): ${retryText}`);
        }
        return JSON.parse(retryText);
    }
    if (!rawText?.trim()) {
        throw new Error(`SimpleAPI respuesta vacía (${response.status}) en ${endpoint}`);
    }
    let data;
    try {
        data = JSON.parse(rawText);
    }
    catch {
        throw new Error(`SimpleAPI respuesta no es JSON (${response.status}): ${rawText.slice(0, 300)}`);
    }
    if (!response.ok) {
        throw new Error(`SimpleAPI error ${response.status} en ${endpoint}: ${JSON.stringify(data)}`);
    }
    return data;
}
// ============================================================
// PASO 1: GENERAR DTE
// ============================================================
export async function generarDTE(config, factura) {
    const cotizacion = factura?.cotizacion;
    const entidad = cotizacion?.entidad;
    if (!cotizacion)
        throw new Error("No se recibió factura.cotizacion");
    if (!entidad)
        throw new Error("La cotización no tiene entidad/receptor");
    if (!entidad?.rut)
        throw new Error("El cliente no tiene RUT registrado");
    if (!entidad?.nombre)
        throw new Error("El cliente no tiene nombre registrado");
    if (!Array.isArray(cotizacion?.items) || cotizacion.items.length === 0) {
        throw new Error("La cotización no tiene ítems para emitir");
    }
    if (!config.cafXml && !config.cafXmlBase64) {
        throw new Error("No hay CAF configurado para generar DTE");
    }
    const cafInfo = parseCAF(config);
    console.log("===== VALIDACION CAF =====");
    console.log("CAF XML LENGTH:", cafInfo.xml.length);
    console.log("CAF TD:", cafInfo.tipoDTE);
    console.log("CAF FOLIO DESDE:", cafInfo.folioDesde);
    console.log("CAF FOLIO HASTA:", cafInfo.folioHasta);
    console.log("CAF CONTIENE AUTORIZACION:", cafInfo.xml.includes("<AUTORIZACION>"));
    console.log("CAF CONTIENE TD33:", cafInfo.xml.includes("<TD>33</TD>"));
    console.log(Buffer.from(process.env.SII_CAF_XML_BASE64 || "", "base64")
        .toString("utf-8")
        .slice(0, 500));
    console.log("==========================");
    if (cafInfo.tipoDTE == null) {
        throw new Error("No se pudo leer <TD> del CAF. Revisa el base64 o el XML.");
    }
    if (cafInfo.tipoDTE !== 33) {
        throw new Error(`El CAF configurado no corresponde a Factura Electrónica (33). TD actual: ${cafInfo.tipoDTE}`);
    }
    const montoNeto = toInt(cotizacion.subtotal);
    const montoIVA = toInt(cotizacion.iva);
    const montoTotal = toInt(cotizacion.total);
    if (montoNeto <= 0)
        throw new Error("Monto neto inválido");
    if (montoTotal <= 0)
        throw new Error("Monto total inválido");
    const fechaHoy = formatFechaAAAAMMDD();
    const rutReceptor = limpiarRut(entidad.rut);
    const casoSet = factura?.casoSet ||
        factura?.setCaso ||
        factura?.numeroAtencion ||
        cotizacion?.casoSet ||
        cotizacion?.setCaso ||
        cotizacion?.numeroAtencion ||
        null;
    const folioPrueba = resolverFolio(factura, cafInfo);
    const detalles = cotizacion.items.map((item, index) => {
        const precio = toInt(item?.precio);
        const cantidad = Number(item?.cantidad) || 1;
        const montoItem = toInt(precio * cantidad);
        const nombreBase = item?.nombre || item?.descripcion;
        if (!nombreBase) {
            throw new Error(`Item ${index + 1} no tiene nombre ni descripción`);
        }
        if (precio < 0 || cantidad <= 0 || montoItem < 0) {
            throw new Error(`Item ${index + 1} tiene valores inválidos`);
        }
        return {
            numeroLinea: index + 1,
            nombre: truncar(nombreBase, 80),
            ...(item?.descripcion &&
                String(item.descripcion).trim() !== String(nombreBase).trim()
                ? { descripcion: truncar(item.descripcion, 1000) }
                : {}),
            cantidad,
            precio,
            montoItem,
        };
    });
    const referencias = casoSet
        ? [
            {
                nroLinRef: 1,
                tpoDocRef: "SET",
                folioRef: String(casoSet).trim(),
                fchRef: fechaHoy,
                rznRef: truncar(`CASO ${String(casoSet).trim()}`, 90),
            },
        ]
        : [];
    const payload = {
        documento: {
            id: `DTE-33-${folioPrueba}`,
            encabezado: {
                identificacionDTE: {
                    tipoDTE: 33,
                    folio: folioPrueba,
                    fechaEmisionString: fechaHoy,
                },
                emisor: {
                    rut: limpiarRut(config.rutEmpresa),
                    razonSocial: truncar(config.razonSocial, 100),
                    giro: truncar(config.giro, 80),
                    direccionOrigen: truncar(config.direccion, 70),
                    comunaOrigen: truncar(config.comuna, 20),
                    ciudadOrigen: truncar(config.ciudad, 20),
                },
                receptor: {
                    rut: rutReceptor,
                    razonSocial: truncar(entidad.nombre, 100),
                    giro: truncar(entidad.giro ?? "Sin giro", 80),
                    direccion: truncar(entidad.direccion ?? "Sin dirección", 70),
                    comuna: truncar(entidad.comuna ?? "Santiago", 20),
                    ciudad: truncar(entidad.ciudad ?? "Santiago", 20),
                    ...(entidad.correo
                        ? { correoElectronico: truncar(entidad.correo, 80) }
                        : {}),
                },
                totales: {
                    montoNeto,
                    tasaIVA: 19,
                    iva: montoIVA,
                    montoTotal,
                },
            },
            detalles,
            ...(referencias.length > 0 ? { referencias } : {}),
        },
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: limpiarRut(config.certRut),
        },
        caf: config.cafXmlBase64
            ? { base64: config.cafXmlBase64 }
            : { xml: config.cafXml },
    };
    console.log("========== PAYLOAD DTE GENERAR ==========");
    console.log(JSON.stringify(payload, null, 2));
    console.log("=========================================");
    console.log("===== RESUMEN DTE =====");
    console.log("Documento ID:", payload.documento.id);
    console.log("Tipo DTE:", payload.documento.encabezado.identificacionDTE.tipoDTE);
    console.log("Folio:", payload.documento.encabezado.identificacionDTE.folio);
    console.log("Fecha emisión:", payload.documento.encabezado.identificacionDTE.fechaEmisionString);
    console.log("Receptor RUT:", payload.documento.encabezado.receptor.rut);
    console.log("Receptor Razón Social:", payload.documento.encabezado.receptor.razonSocial);
    console.log("Neto:", payload.documento.encabezado.totales.montoNeto);
    console.log("IVA:", payload.documento.encabezado.totales.iva);
    console.log("Total:", payload.documento.encabezado.totales.montoTotal);
    console.log("Cantidad detalles:", payload.documento.detalles.length);
    console.log("Referencias:", JSON.stringify(payload.documento.referencias || [], null, 2));
    console.log("CAF incluido:", !!payload.caf);
    console.log("CAF tipo:", payload.caf && "base64" in payload.caf ? "base64" : "xml");
    console.log("=======================");
    const data = await callSimpleAPI(config, "/api/v1/dte/generar", payload);
    const folioRaw = data?.folio ??
        data?.documento?.encabezado?.identificacionDTE?.folio ??
        data?.documento?.encabezado?.identificacionDTE?.folioDTE ??
        folioPrueba;
    const folio = Number(folioRaw);
    if (!Number.isFinite(folio) || folio <= 0) {
        throw new Error(`No se pudo resolver un folio válido desde SimpleAPI. Valor recibido: ${String(folioRaw)}`);
    }
    return {
        xml: JSON.stringify(data),
        folio,
        raw: data,
    };
}
// ============================================================
// PASO 2: GENERAR SOBRE DE ENVÍO
// ============================================================
export async function generarSobre(config, dteGenerado) {
    if (!dteGenerado?.xml) {
        throw new Error("No se recibió el DTE generado para armar el sobre");
    }
    const dteRaw = safeJsonParse(dteGenerado.xml);
    if (!dteRaw || typeof dteRaw === "string") {
        throw new Error("El XML/JSON del DTE generado es inválido");
    }
    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: limpiarRut(config.certRut),
        },
        tipo: 1,
        ambiente: config.ambiente,
        caratula: {
            rutEmisor: limpiarRut(config.rutEmpresa),
            rutReceptor: "60803000-K",
        },
        documentos: [dteRaw],
    };
    const data = await callSimpleAPI(config, "/api/v1/envio/generar", payload);
    return JSON.stringify(data);
}
// ============================================================
// PASO 3: ENVIAR AL SII
// ============================================================
export async function enviarAlSII(config, sobreGenerado) {
    const sobreRaw = sobreGenerado ? safeJsonParse(sobreGenerado) : undefined;
    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: limpiarRut(config.certRut),
        },
        tipo: 1,
        ambiente: config.ambiente,
        ...(sobreRaw && typeof sobreRaw !== "string" ? { sobre: sobreRaw } : {}),
    };
    const data = await callSimpleAPI(config, "/api/v1/envio/enviar", payload);
    const trackId = data?.trackId ??
        data?.TrackId ??
        data?.track_id ??
        data?.respuesta?.trackId ??
        null;
    return {
        trackId: String(trackId ?? ""),
        estado: data?.estado ?? data?.status ?? "ENVIADO",
        raw: data,
    };
}
// ============================================================
// PASO 4: CONSULTAR ESTADO EN SII
// ============================================================
export async function consultarEstadoEnvio(config, trackId) {
    if (!trackId) {
        throw new Error("trackId es obligatorio para consultar estado");
    }
    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: limpiarRut(config.certRut),
        },
        trackId: Number(trackId),
        ambiente: config.ambiente,
    };
    return callSimpleAPI(config, "/api/v1/consulta/envio", payload);
}
//# sourceMappingURL=simpleapi.service.js.map