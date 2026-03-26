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
// HELPERS
// ============================================================
function limpiarRut(rut: string): string {
  return String(rut || "")
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatFechaAAAAMMDD(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function truncar(texto: unknown, max: number): string {
  return String(texto ?? "").trim().slice(0, max);
}

function toInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getCAFXml(config: SimpleAPIConfig): string {
  if (config.cafXmlBase64) {
    const raw = Buffer.from(config.cafXmlBase64.trim(), "base64").toString("utf-8");
    return raw.replace(/^\uFEFF/, "").trim(); // elimina BOM si existe
  }

  if (config.cafXml) {
    return config.cafXml.replace(/^\uFEFF/, "").trim();
  }

  return "";
}

function extraerTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? null;
}

function parseCAF(config: SimpleAPIConfig): CAFInfo {
  const xml = getCAFXml(config);

  if (!xml) {
    throw new Error("No hay CAF configurado");
  }

  const tdRaw = extraerTag(xml, "TD");
  const dRaw = extraerTag(xml, "D");
  const hRaw = extraerTag(xml, "H");

  console.log("===== DEBUG CAF =====");
  console.log("CAF XML START:", xml.slice(0, 300));
  console.log("TD RAW:", tdRaw);
  console.log("D RAW:", dRaw);
  console.log("H RAW:", hRaw);
  console.log("=====================");

  const tipoDTE = tdRaw ? Number(tdRaw) : null;
  const folioDesde = dRaw ? Number(dRaw) : null;
  const folioHasta = hRaw ? Number(hRaw) : null;

  return {
    xml,
    tipoDTE: Number.isFinite(tipoDTE as number) ? tipoDTE : null,
    folioDesde: Number.isFinite(folioDesde as number) ? folioDesde : null,
    folioHasta: Number.isFinite(folioHasta as number) ? folioHasta : null,
  };
}

function resolverFolio(factura: any, cafInfo: CAFInfo): number {
  const folioSolicitado = Number(factura?.folioPrueba);

  if (
    Number.isFinite(folioSolicitado) &&
    folioSolicitado > 0 &&
    cafInfo.folioDesde != null &&
    cafInfo.folioHasta != null
  ) {
    if (folioSolicitado < cafInfo.folioDesde || folioSolicitado > cafInfo.folioHasta) {
      throw new Error(
        `El folio ${folioSolicitado} está fuera del rango CAF (${cafInfo.folioDesde}-${cafInfo.folioHasta})`
      );
    }
    return folioSolicitado;
  }

  if (cafInfo.folioDesde == null) {
    throw new Error("No se pudo determinar el folio inicial del CAF");
  }

  return cafInfo.folioDesde;
}

// ============================================================
// HTTP SIMPLEAPI
// ============================================================
async function callSimpleAPI(
  config: SimpleAPIConfig,
  endpoint: string,
  body: object
) {
  const baseUrl = config.url.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const headers = {
    Authorization: config.apiKey,
    "Content-Type": "application/json",
  };

  console.log("==================================================");
  console.log("🌐 URL FINAL SIMPLEAPI:", url);
  console.log(
    "🔑 API KEY CARGADA:",
    config.apiKey ? `${config.apiKey.slice(0, 8)}...` : "VACIA"
  );
  console.log("📤 HEADERS SIMPLEAPI:", {
    Authorization: config.apiKey ? `${config.apiKey.slice(0, 8)}...` : "VACIA",
    "Content-Type": "application/json",
  });
  console.log("📤 BODY SIMPLEAPI:");
  console.log(JSON.stringify(body, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const rawText = await response.text();

  console.log("🔎 STATUS:", response.status, response.statusText);
  console.log("🔎 HEADERS:", Object.fromEntries(response.headers.entries()));
  console.log("🔎 RAW:", rawText);
  console.log("==================================================");

  if (!response.ok) {
    throw new Error(
      `SimpleAPI error ${response.status}${rawText ? `: ${rawText}` : " (respuesta vacía)"}`
    );
  }

  if (!rawText) {
    throw new Error(`SimpleAPI devolvió respuesta vacía en ${endpoint}`);
  }

  const data = safeJsonParse(rawText);

  if (typeof data === "string") {
    throw new Error(`Respuesta no es JSON válido: ${rawText}`);
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