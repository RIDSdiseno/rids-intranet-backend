// simpleapi.service.ts
// Servicio separado para toda la lógica de SimpleAPI
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
}

interface DTEGenerado {
    xml: string;
    folio: number;
    trackId?: string;
}

// ============================================================
// VALIDAR VARIABLES DE ENTORNO
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
    };
}

// ============================================================
// HELPER: llamada HTTP a SimpleAPI
// ============================================================
async function callSimpleAPI(config: SimpleAPIConfig, endpoint: string, body: object) {
    const url = `${config.url}${endpoint}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const rawText = await response.text();
    console.log("🔎 STATUS:", response.status, "RAW:", rawText);

    console.log("HEADERS:", Object.fromEntries(response.headers.entries()));

    if (!rawText) {
        throw new Error(`SimpleAPI devolvió respuesta vacía en ${endpoint}`);
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch { throw new Error(`Respuesta no es JSON válido: ${rawText}`); }

    if (!response.ok) {
        throw new Error(`SimpleAPI error ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
}

// ============================================================
// PASO 1: GENERAR DTE (genera + timbra + firma el XML)
// ============================================================
export async function generarDTE(
    config: SimpleAPIConfig,
    factura: any   // objeto con cotizacion, entidad, items incluidos
): Promise<DTEGenerado> {

    const cotizacion = factura.cotizacion;
    const entidad = cotizacion.entidad;

    // Validaciones de datos del receptor
    if (!entidad?.rut) throw new Error("El cliente no tiene RUT registrado");
    if (!entidad?.nombre) throw new Error("El cliente no tiene nombre registrado");

    // Montos en enteros (SII no acepta decimales en facturas CLP)
    const montoNeto = Math.round(Number(cotizacion.subtotal) || 0);
    const montoIVA = Math.round(Number(cotizacion.iva) || 0);
    const montoTotal = Math.round(Number(cotizacion.total) || 0);

    if (montoNeto <= 0 || montoTotal <= 0) {
        throw new Error("Los montos de la cotización son inválidos (neto o total <= 0)");
    }

    const fechaHoy = new Date().toISOString().split("T")[0]; // AAAA-MM-DD
    const rutReceptor = String(entidad.rut).replace(/\./g, "").trim();

    const payload = {
        documento: {
            encabezado: {
                identificacionDTE: {
                    tipoDTE: 33,                    // número entero, no string
                    fechaEmisionString: fechaHoy,   // usar el campo String
                },
                emisor: {
                    rut: config.rutEmpresa,
                    razonSocial: config.razonSocial,
                    giro: config.giro,
                    direccionOrigen: config.direccion,
                    comunaOrigen: config.comuna,
                    ciudadOrigen: config.ciudad,
                },
                receptor: {
                    rut: rutReceptor,       // con guión y DV: "12345678-9"
                    razonSocial: entidad.nombre,
                    direccion: entidad.direccion ?? "Sin dirección",
                    comuna: entidad.comuna ?? "Santiago",
                    ciudad: entidad.ciudad ?? "Santiago",
                    giro: entidad.giro ?? "Sin giro",
                    ...(entidad.correo && { correoElectronico: entidad.correo }),
                },
                totales: {
                    montoNeto,
                    tasaIVA: 19,
                    iva: montoIVA,
                    montoTotal,
                },
            },
            detalles: cotizacion.items.map((item: any, index: number) => {
                const precio = Math.round(Number(item.precio) || 0);
                const cantidad = Number(item.cantidad) || 1;
                const montoItem = Math.round(precio * cantidad);

                if (!item.nombre && !item.descripcion) {
                    throw new Error(`Item ${index + 1} no tiene nombre ni descripción`);
                }

                return {
                    numeroLinea: index + 1,
                    nombre: (item.nombre || item.descripcion).substring(0, 80), // máx 80 chars SII
                    ...(item.descripcion && item.descripcion !== item.nombre && {
                        descripcion: item.descripcion.substring(0, 1000)
                    }),
                    cantidad,
                    precio,
                    montoItem,
                };
            }),
        },
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: config.certRut,
        },
    };

    console.log(JSON.stringify(payload, null, 2));

    const data = await callSimpleAPI(config, "/api/v1/DTE/generar", payload);

    // SimpleAPI retorna el DTE generado con folio asignado
    if (!data?.folio && !data?.documento?.encabezado?.identificacionDTE?.folio) {
        throw new Error("SimpleAPI no retornó folio en la respuesta: " + JSON.stringify(data));
    }

    const folio = data.folio
        ?? data.documento?.encabezado?.identificacionDTE?.folio
        ?? data.documento?.encabezado?.identificacionDTE?.folioDTE;

    return {
        xml: JSON.stringify(data), // guardar respuesta completa para el sobre
        folio: Number(folio),
    };
}

// ============================================================
// PASO 2: GENERAR SOBRE DE ENVÍO
// ============================================================
export async function generarSobre(
    config: SimpleAPIConfig,
    dteGenerado: DTEGenerado
): Promise<string> {

    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: config.certRut,
        },
        tipo: 1,                   // 1 = EnvioDTE (facturas, NC, etc.)
        ambiente: config.ambiente,
        caratula: {
            rutEmisor: config.rutEmpresa,
            rutReceptor: "60803000-K",   // SII siempre es este RUT
        },
    };

    const data = await callSimpleAPI(config, "/api/v1/Envio/generar", payload);

    return JSON.stringify(data);
}

// ============================================================
// PASO 3: ENVIAR AL SII
// ============================================================
export async function enviarAlSII(
    config: SimpleAPIConfig
): Promise<{ trackId: string; estado: string }> {

    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: config.certRut,
        },
        tipo: 1,
        ambiente: config.ambiente,
    };

    const data = await callSimpleAPI(config, "/api/v1/Envio/enviar", payload);

    const trackId = data?.trackId ?? data?.TrackId ?? data?.track_id ?? String(data);

    return {
        trackId: String(trackId),
        estado: data?.estado ?? "ENVIADO",
    };
}

// ============================================================
// PASO 4 (OPCIONAL): CONSULTAR ESTADO EN SII
// ============================================================
export async function consultarEstadoEnvio(
    config: SimpleAPIConfig,
    trackId: string
): Promise<any> {

    const payload = {
        certificado: {
            base64: config.certBase64,
            password: config.certPassword,
            rut: config.certRut,
        },
        trackId: Number(trackId),
        ambiente: config.ambiente,
    };

    return callSimpleAPI(config, "/api/v1/Consulta/envio", payload);
}
