// src/service/baseapi/baseapi-dte.service.ts
import { DOMParser } from "@xmldom/xmldom";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { baseApiClient, normalizeBaseApiError } from "./baseapi.client.js";
import {
    getEmpresaBaseApiConfig,
    type EmpresaBaseApiKey,
} from "./baseapi.empresas.js";

export type ConsultarDtePorFolioParams = {
    empresa: EmpresaBaseApiKey;
    periodo: string; // YYYY-MM
    folio: string | number;
    tipoDTE?: string | number;
    forceRefresh?: boolean;
};

// Utilis para normalizar RUT, manejar Base64, parsear XML DTE, y mapear datos a la estructura de cache de FacturaDTE en la base de datos.
function normalizarRut(rut: string): string {
    return rut.replace(/\./g, "").trim().toUpperCase();
}

function decodeBase64Utf8(base64?: string | null): string {
    if (!base64) return "";

    try {
        return Buffer.from(base64, "base64").toString("utf8");
    } catch {
        return "";
    }
}

function encodeBase64Utf8(text?: string | null): string | null {
    if (!text) return null;

    return Buffer.from(text, "utf8").toString("base64");
}

// Funciones para extraer datos específicos de la respuesta de BaseAPI, parsear el XML del DTE, y mapear los datos a la estructura que usamos para cachear en la db.
function getXmlBase64FromBaseApiResponse(data: any): string | null {
    return (
        data?.data?.documento?.xml_base64 ??
        data?.documento?.xml_base64 ??
        null
    );
}

function getDocumentoFromBaseApiResponse(data: any) {
    return data?.data?.documento ?? data?.documento ?? null;
}

type XmlNodeLike = {
    getElementsByTagName: (name: string) => any;
};

function findFirstXmlElement(parent: XmlNodeLike, tagName: string): any | null {
    const all = Array.from(parent.getElementsByTagName("*")) as any[];

    return all.find((el) => el.localName === tagName) ?? null;
}

function getTextFromXml(parent: XmlNodeLike | null, tagName: string): string {
    if (!parent) return "";

    const all = Array.from(parent.getElementsByTagName("*")) as any[];
    const found = all.find((el) => el.localName === tagName);

    return found?.textContent?.trim() ?? "";
}

function parseXmlDate(value?: string | null): Date | null {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
}

function toInt(value: any): number {
    const clean = String(value ?? "0")
        .replace(/\./g, "")
        .replace(",", ".");

    const num = Number(clean);

    return Number.isFinite(num) ? Math.round(num) : 0;
}

function toDecimal(value: any): Prisma.Decimal | null {
    if (value === undefined || value === null || value === "") return null;

    const clean = String(value)
        .replace(/\./g, "")
        .replace(",", ".");

    const num = Number(clean);

    if (!Number.isFinite(num)) return null;

    return new Prisma.Decimal(num);
}

// Función para consultar un DTE por folio usando BaseAPI, parsear el XML, y guardar/cachear los datos en la base de datos.
function parseDteXmlForDb(xmlRaw: string) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlRaw, "text/xml");

    const documento = findFirstXmlElement(xml as any, "Documento");

    if (!documento) {
        throw new Error("No se encontró nodo Documento en XML DTE");
    }

    const encabezado = findFirstXmlElement(documento, "Encabezado");
    const idDoc = encabezado ? findFirstXmlElement(encabezado, "IdDoc") : null;
    const emisor = encabezado ? findFirstXmlElement(encabezado, "Emisor") : null;
    const receptor = encabezado ? findFirstXmlElement(encabezado, "Receptor") : null;
    const totales = encabezado ? findFirstXmlElement(encabezado, "Totales") : null;

    const detalleNodes = (Array.from(
        documento.getElementsByTagName("*")
    ) as any[]).filter((el) => el.localName === "Detalle");

    const tipoDTE = toInt(getTextFromXml(idDoc, "TipoDTE")) || 33;
    const folio = toInt(getTextFromXml(idDoc, "Folio"));

    const items = detalleNodes.map((detalle, index) => {
        const nombre = getTextFromXml(detalle, "NmbItem") || "Sin nombre";

        return {
            linea: toInt(getTextFromXml(detalle, "NroLinDet")) || index + 1,
            codigo: getTextFromXml(detalle, "VlrCodigo") || null,
            nombre,
            descripcion: getTextFromXml(detalle, "DscItem") || null,
            cantidad: toDecimal(getTextFromXml(detalle, "QtyItem")),
            unidadMedida: getTextFromXml(detalle, "UnmdItem") || null,
            precioUnitario: toInt(getTextFromXml(detalle, "PrcItem")),
            descuentoMonto: toInt(getTextFromXml(detalle, "DescuentoMonto")),
            recargoMonto: toInt(getTextFromXml(detalle, "RecargoMonto")),
            montoItem: toInt(getTextFromXml(detalle, "MontoItem")),
        };
    });

    return {
        factura: {
            tipoDTE,
            folio,
            tipoDTEString: "",
            estado: "",
            tipoVenta: getTextFromXml(idDoc, "FmaPago"),
            fechaEmision: parseXmlDate(getTextFromXml(idDoc, "FchEmis")),
            rutEmisor: getTextFromXml(emisor, "RUTEmisor"),
            razonSocialEmisor: getTextFromXml(emisor, "RznSoc"),
            giroEmisor: getTextFromXml(emisor, "GiroEmis"),
            rutReceptor: getTextFromXml(receptor, "RUTRecep"),
            razonSocialReceptor: getTextFromXml(receptor, "RznSocRecep"),
            giroReceptor: getTextFromXml(receptor, "GiroRecep"),
            direccionReceptor: getTextFromXml(receptor, "DirRecep"),
            comunaReceptor: getTextFromXml(receptor, "CmnaRecep"),
            ciudadReceptor: getTextFromXml(receptor, "CiudadRecep"),
            montoExento: toInt(getTextFromXml(totales, "MntExe")),
            montoNeto: toInt(getTextFromXml(totales, "MntNeto")),
            montoIVA: toInt(getTextFromXml(totales, "IVA")),
            montoTotal: toInt(getTextFromXml(totales, "MntTotal")),
        },
        items,
    };
}

// Extrae el contenido de <FRMT> dentro de TED (si existe) y devuelve su contenido (base64) o null
function extractTimbreFrmtFromXml(xmlRaw: string): string | null {
    try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlRaw, "text/xml");

        // Buscar elemento TED y luego FRMT dentro
        const all = Array.from(xml.getElementsByTagName("*")) as any[];
        const ted = all.find((el) => el.localName === "TED");

        if (!ted) return null;

        const frmtEl = (Array.from(ted.getElementsByTagName("*")) as any[]).find((el) => el.localName === "FRMT");

        const txt = frmtEl?.textContent?.trim() ?? null;

        const result = txt || null;
        if (result) {
            console.log("🔎 extractTimbreFrmtFromXml: timbre encontrado, longitud=", result.length);
        } else {
            console.log("🔎 extractTimbreFrmtFromXml: no se encontró timbre en XML");
        }

        return result;
    } catch (err) {
        console.error("🔎 extractTimbreFrmtFromXml: error parsing XML", err);
        return null;
    }
}

// Función para mapear los datos de la factura obtenida (ya sea desde cache o desde BaseAPI)
function mapFacturaCacheToBaseApiLikeResponse(factura: any) {
    return {
        success: true,
        data: {
            documento: {
                tipo_dte: factura.tipoDTE,
                tipo_dte_nombre: factura.tipoDTEString,
                folio: factura.folio,
                fecha: factura.fechaEmision,
                rut_receptor: factura.rutReceptor,
                razon_social_receptor: factura.razonSocialReceptor,
                monto_total: factura.montoTotal,
                estado: factura.estado,
                xml_base64: encodeBase64Utf8(factura.xmlRaw),
                // intentamos extraer el timbre (FRMT) desde el XML cacheado
                timbre_base64: factura.xmlRaw ? extractTimbreFrmtFromXml(factura.xmlRaw) : null,
                items: factura.items ?? [],
            },
        },
    };
}

// Función para consultar un DTE por folio usando BaseAPI, parsear el XML, y guardar/cachear los datos en la db.
export async function consultarDtePorFolioBaseApi(
    params: ConsultarDtePorFolioParams
) {
    const {
        empresa,
        periodo,
        folio,
        tipoDTE = 33,
        forceRefresh = false,
    } = params;

    const config = getEmpresaBaseApiConfig(empresa);

    const empresaRut = normalizarRut(config.rutEmpresa);
    const folioInt = Number(folio);
    const tipoDTEInt = Number(tipoDTE) || 33;

    if (!Number.isFinite(folioInt) || folioInt <= 0) {
        throw new Error("Folio inválido");
    }

    if (!forceRefresh) {
        const cached = await prisma.facturaDTE.findUnique({
            where: {
                empresaRut_tipoDTE_folio: {
                    empresaRut,
                    tipoDTE: tipoDTEInt,
                    folio: folioInt,
                },
            },
            include: {
                items: true,
            },
        });

        if (cached?.xmlRaw && cached.tieneDetalle) {
            console.log("✅ FacturaDTE cache HIT:", {
                empresa,
                empresaRut,
                tipoDTE: tipoDTEInt,
                folio: folioInt,
                items: cached.items.length,
            });

            return {
                cached: true,
                data: mapFacturaCacheToBaseApiLikeResponse(cached),
            };
        }
    }

    const endpoint = `/api/v1/sii/dte/consulta/${periodo}/folio/${folioInt}`;
    const startedAt = Date.now();
    
    // Si no hay cache o se forzó refresh, consultamos a BaseAPI, parseamos el XML, y guardamos en la db para futuros cacheos.
    try {
        console.log("📡 BaseAPI DTE cache MISS, consultando API:", {
            empresa,
            empresaRut,
            periodo,
            folio: folioInt,
            tipoDTE: tipoDTEInt,
            endpoint,
            method: "POST",
            hasPasswordSii: Boolean(config.passwordSii),
        });

        const response = await baseApiClient.post(endpoint, {
            rut: normalizarRut(config.rutSii),
            password: config.passwordSii,
            rut_empresa: empresaRut,
        });

        const baseApiData = response.data;
        const documentoBaseApi = getDocumentoFromBaseApiResponse(baseApiData);

        const xmlBase64 = getXmlBase64FromBaseApiResponse(baseApiData);
        const xmlRaw = decodeBase64Utf8(xmlBase64);

        if (!xmlRaw) {
            throw new Error("BaseAPI no retornó xml_base64 válido");
        }

        const parsed = parseDteXmlForDb(xmlRaw);

        const tipoDTEFinal = parsed.factura.tipoDTE || tipoDTEInt;
        const folioFinal = parsed.factura.folio || folioInt;
        
        // Guardamos o actualizamos la factura en la base de datos usando una transacción, y luego la retornamos.
        const factura = await prisma.$transaction(async (tx) => {
            const upserted = await tx.facturaDTE.upsert({
                where: {
                    empresaRut_tipoDTE_folio: {
                        empresaRut,
                        tipoDTE: tipoDTEFinal,
                        folio: folioFinal,
                    },
                },
                create: {
                    empresaRut,
                    empresaAlias: empresa,
                    folio: folioFinal,
                    tipoDTE: tipoDTEFinal,
                    tipoDTEString:
                        documentoBaseApi?.tipo_dte_nombre ??
                        parsed.factura.tipoDTEString ??
                        "",
                    estado: documentoBaseApi?.estado ?? parsed.factura.estado ?? "",
                    tipoVenta: parsed.factura.tipoVenta ?? "",
                    fechaEmision: parsed.factura.fechaEmision,
                    rutEmisor: parsed.factura.rutEmisor,
                    razonSocialEmisor: parsed.factura.razonSocialEmisor,
                    giroEmisor: parsed.factura.giroEmisor,
                    rutReceptor: parsed.factura.rutReceptor,
                    razonSocialReceptor: parsed.factura.razonSocialReceptor,
                    giroReceptor: parsed.factura.giroReceptor,
                    direccionReceptor: parsed.factura.direccionReceptor,
                    comunaReceptor: parsed.factura.comunaReceptor,
                    ciudadReceptor: parsed.factura.ciudadReceptor,
                    montoExento: parsed.factura.montoExento,
                    montoNeto: parsed.factura.montoNeto,
                    montoIVA: parsed.factura.montoIVA,
                    montoTotal: parsed.factura.montoTotal,
                    fuente: "baseapi-dte",
                    tieneDetalle: parsed.items.length > 0,
                    xmlRaw,
                    rawJson: baseApiData,
                    sincronizadoAt: new Date(),
                },
                update: {
                    empresaAlias: empresa,
                    tipoDTEString:
                        documentoBaseApi?.tipo_dte_nombre ??
                        parsed.factura.tipoDTEString ??
                        "",
                    estado: documentoBaseApi?.estado ?? parsed.factura.estado ?? "",
                    tipoVenta: parsed.factura.tipoVenta ?? "",
                    fechaEmision: parsed.factura.fechaEmision,
                    rutEmisor: parsed.factura.rutEmisor,
                    razonSocialEmisor: parsed.factura.razonSocialEmisor,
                    giroEmisor: parsed.factura.giroEmisor,
                    rutReceptor: parsed.factura.rutReceptor,
                    razonSocialReceptor: parsed.factura.razonSocialReceptor,
                    giroReceptor: parsed.factura.giroReceptor,
                    direccionReceptor: parsed.factura.direccionReceptor,
                    comunaReceptor: parsed.factura.comunaReceptor,
                    ciudadReceptor: parsed.factura.ciudadReceptor,
                    montoExento: parsed.factura.montoExento,
                    montoNeto: parsed.factura.montoNeto,
                    montoIVA: parsed.factura.montoIVA,
                    montoTotal: parsed.factura.montoTotal,
                    fuente: "baseapi-dte",
                    tieneDetalle: parsed.items.length > 0,
                    xmlRaw,
                    rawJson: baseApiData,
                    sincronizadoAt: new Date(),
                },
            });

            await tx.facturaDTEItem.deleteMany({
                where: {
                    facturaId: upserted.id,
                },
            });

            if (parsed.items.length > 0) {
                await tx.facturaDTEItem.createMany({
                    data: parsed.items.map((item) => ({
                        facturaId: upserted.id,
                        linea: item.linea,
                        codigo: item.codigo,
                        nombre: item.nombre,
                        descripcion: item.descripcion,
                        cantidad: item.cantidad,
                        unidadMedida: item.unidadMedida,
                        precioUnitario: item.precioUnitario,
                        descuentoMonto: item.descuentoMonto,
                        recargoMonto: item.recargoMonto,
                        montoItem: item.montoItem,
                    })),
                });
            }

            return tx.facturaDTE.findUnique({
                where: {
                    id: upserted.id,
                },
                include: {
                    items: true,
                },
            });
        });

        console.log("✅ FacturaDTE guardada en cache:", {
            empresa,
            empresaRut,
            tipoDTE: tipoDTEFinal,
            folio: folioFinal,
            status: response.status,
            durationMs: Date.now() - startedAt,
            items: factura?.items.length ?? 0,
        });

        return {
            cached: false,
            data: mapFacturaCacheToBaseApiLikeResponse(factura),
        };
    } catch (error) {
        const normalized = normalizeBaseApiError(error);

        console.error("❌ Error consultando/guardando DTE BaseAPI:", {
            empresa,
            empresaRut,
            periodo,
            folio: folioInt,
            tipoDTE: tipoDTEInt,
            endpoint,
            method: "POST",
            durationMs: Date.now() - startedAt,
            error: normalized.message,
        });

        throw normalized;
    }
}