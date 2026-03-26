// simpleapi.service.ts

// ============================================================
// TIPOS
// ============================================================
interface SimpleAPIConfig {
  url: string;
  apiKey: string;
  rutEmpresa: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  certBase64: string;
  certPassword: string;
  certRut: string;
  ambiente: 0 | 1;
  cafXml: string | undefined;
  cafXmlBase64: string | undefined;
}

interface DTEGenerado {
  xml: string;
  folio: number;
  trackId?: string;
  raw?: any;
}

interface CAFInfo {
  xml: string;
  tipoDTE: number | null;
  folioDesde: number | null;
  folioHasta: number | null;
}

// ============================================================
// CONFIG
// ============================================================
export function getSimpleAPIConfig(): SimpleAPIConfig {
  const required: Record<string, string | undefined> = {
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
    url: process.env.SIMPLEAPI_URL!,
    apiKey: process.env.SIMPLEAPI_KEY!,
    rutEmpresa: process.env.RUT_EMPRESA!,
    razonSocial: process.env.RAZON_SOCIAL_EMPRESA!,
    giro: process.env.GIRO_EMPRESA!,
    direccion: process.env.DIRECCION_EMPRESA!,
    comuna: process.env.COMUNA_EMPRESA!,
    ciudad: process.env.CIUDAD_EMPRESA!,
    certBase64: process.env.SII_CERT_BASE64!,
    certPassword: process.env.SII_CERT_PASSWORD!,
    certRut: process.env.RUT_FIRMANTE!,
    ambiente: process.env.SII_AMBIENTE === "certificacion" ? 1 : 0,
    cafXml: process.env.SII_CAF_XML,
    cafXmlBase64: process.env.SII_CAF_XML_BASE64,
  };
}

// ============================================================
// OBTENER TOKEN DE SIMPLEAPI (ejecutar una vez y cachear)
// ============================================================
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getSimpleAPIToken(config: SimpleAPIConfig): Promise<string> {
    const ahora = Date.now();

    // Reusar token si aún es válido (cachear por 50 minutos)
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
        throw new Error(
            `SimpleAPI Auth falló (${response.status}): ${rawText || "respuesta vacía"}. ` +
            `Verifica que SIMPLEAPI_KEY sea válida: ${config.apiKey}`
        );
    }

    // El token puede venir como string puro o dentro de un objeto
    let token: string;
    try {
        const data = JSON.parse(rawText);
        token = typeof data === "string"
            ? data
            : (data.token ?? data.access_token ?? data.jwt ?? data.Token);
    } catch {
        // Si no es JSON, asumir que es el token directamente como string
        token = rawText.trim().replace(/^"|"$/g, ""); // quitar comillas si las hay
    }

    if (!token) {
        throw new Error(`SimpleAPI Auth no retornó token. Respuesta: ${rawText}`);
    }

    // Cachear por 50 minutos
    cachedToken = token;
    tokenExpiry = ahora + 50 * 60 * 1000;

    console.log("✅ Token obtenido:", token.substring(0, 30) + "...");
    return token;
}

// ============================================================
// HELPER: llamada HTTP a SimpleAPI — CON AUTH TOKEN
// ============================================================
async function callSimpleAPI(
    config: SimpleAPIConfig,
    endpoint: string,
    body: object
) {
    // 1️⃣ Obtener token primero
    const token = await getSimpleAPIToken(config);

    const url = `${config.url}${endpoint}`;
    console.log("📡 SimpleAPI URL:", url);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            // 2️⃣ Usar el JWT obtenido del login
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const rawText = await response.text();
    console.log("📥 STATUS:", response.status);
    console.log("📥 RAW:", rawText || "(vacío)");

    // 3️⃣ Si el token expiró, limpiar caché y reintentar UNA vez
    if (response.status === 401) {
        console.log("⚠️ Token expirado, limpiando caché y reintentando...");
        cachedToken = null;
        tokenExpiry = 0;

        const newToken = await getSimpleAPIToken(config);

        const retry = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${newToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const retryText = await retry.text();
        console.log("📥 RETRY STATUS:", retry.status);
        console.log("📥 RETRY RAW:", retryText);

        if (!retry.ok) {
            throw new Error(
                `SimpleAPI error ${retry.status} en ${endpoint} (después de reintento): ` +
                retryText
            );
        }

        return JSON.parse(retryText);
    }

    if (!rawText?.trim()) {
        throw new Error(`SimpleAPI respuesta vacía (${response.status}) en ${endpoint}`);
    }

    let data: any;
    try {
        data = JSON.parse(rawText);
    } catch {
        throw new Error(
            `SimpleAPI respuesta no es JSON (${response.status}): ${rawText.slice(0, 300)}`
        );
    }

    if (!response.ok) {
        throw new Error(
            `SimpleAPI error ${response.status} en ${endpoint}: ${JSON.stringify(data)}`
        );
    }

  return data;
}

// ============================================================
// PASO 1: GENERAR DTE
// ============================================================
export async function generarDTE(
  config: SimpleAPIConfig,
  factura: any
): Promise<DTEGenerado> {
  const cotizacion = factura?.cotizacion;
  const entidad = cotizacion?.entidad;

  if (!cotizacion) throw new Error("No se recibió factura.cotizacion");
  if (!entidad) throw new Error("La cotización no tiene entidad/receptor");

  if (!entidad?.rut) throw new Error("El cliente no tiene RUT registrado");
  if (!entidad?.nombre) throw new Error("El cliente no tiene nombre registrado");

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
  console.log(Buffer.from(process.env.SII_CAF_XML_BASE64 || "", "base64").toString("utf-8").slice(0, 500));
  console.log("==========================");


  if (cafInfo.tipoDTE == null) {
    throw new Error("No se pudo leer <TD> del CAF. Revisa el base64 o el XML.");
    }

    if (cafInfo.tipoDTE !== 33) {
    throw new Error(
        `El CAF configurado no corresponde a Factura Electrónica (33). TD actual: ${cafInfo.tipoDTE}`
    );
    }

  const montoNeto = toInt(cotizacion.subtotal);
  const montoIVA = toInt(cotizacion.iva);
  const montoTotal = toInt(cotizacion.total);

  if (montoNeto <= 0) throw new Error("Monto neto inválido");
  if (montoTotal <= 0) throw new Error("Monto total inválido");

  const fechaHoy = formatFechaAAAAMMDD();
  const rutReceptor = limpiarRut(entidad.rut);

  const casoSet =
    factura?.casoSet ||
    factura?.setCaso ||
    factura?.numeroAtencion ||
    cotizacion?.casoSet ||
    cotizacion?.setCaso ||
    cotizacion?.numeroAtencion ||
    null;

  const folioPrueba = resolverFolio(factura, cafInfo);

  const detalles = cotizacion.items.map((item: any, index: number) => {
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
          montoNeto: montoNeto,
          tasaIVA: 19,
          iva: montoIVA,
          montoTotal: montoTotal,
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

  const folio =
    data?.folio ??
    data?.documento?.encabezado?.identificacionDTE?.folio ??
    data?.documento?.encabezado?.identificacionDTE?.folioDTE ??
    folioPrueba;

  return {
    xml: JSON.stringify(data),
    folio: Number(folio),
    raw: data,
  };
}

// ============================================================
// PASO 2: GENERAR SOBRE DE ENVÍO
// ============================================================
export async function generarSobre(
  config: SimpleAPIConfig,
  dteGenerado: DTEGenerado
): Promise<string> {
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
export async function enviarAlSII(
  config: SimpleAPIConfig,
  sobreGenerado?: string
): Promise<{ trackId: string; estado: string; raw?: any }> {
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

  const trackId =
    data?.trackId ??
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
export async function consultarEstadoEnvio(
  config: SimpleAPIConfig,
  trackId: string
): Promise<any> {
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