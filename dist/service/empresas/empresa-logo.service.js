// src/service/empresas/empresa-logo.service.ts
/* =========================================================
   LOGO DE EMPRESA (Cloudinary)

   - Se sube a la carpeta "empresas/logos" con un public_id nuevo en
     cada cambio (evita que la CDN entregue el logo anterior) y se
     borra el anterior.
   - Formatos: PNG, JPG, WEBP o SVG (validado por contenido, no por
     extensión). Máx. 2 MB.
   - Para PDF (PDFKit solo dibuja PNG/JPG) y para mostrarlo, se pide a
     Cloudinary una versión PNG de tamaño acotado: así sirve aunque se
     haya subido en SVG o WEBP.
   ========================================================= */
import cloudinary from "../../config/cloudinary.js";
import { prisma } from "../../lib/prisma.js";
export const MAX_BYTES_LOGO = 2 * 1024 * 1024;
const CARPETA_LOGOS = "empresas/logos";
/* =========================================================
   ERRORES
   ========================================================= */
export class LogoEmpresaInvalidoError extends Error {
    constructor(message) {
        super(message);
        this.name = "LogoEmpresaInvalidoError";
    }
}
export class EmpresaLogoNoEncontradaError extends Error {
    constructor(message = "Empresa no encontrada.") {
        super(message);
        this.name = "EmpresaLogoNoEncontradaError";
    }
}
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function detectarFormato(buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(FIRMA_PNG))
        return "png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        return "jpg";
    if (buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP") {
        return "webp";
    }
    const inicio = buffer
        .subarray(0, 2048)
        .toString("utf8")
        .replace(/^﻿/, "")
        .trimStart()
        .toLowerCase();
    if (inicio.startsWith("<") && inicio.includes("<svg"))
        return "svg";
    return null;
}
/** SVG con scripts o eventos: se rechaza (un logo no los necesita). */
function svgPeligroso(buffer) {
    const texto = buffer.toString("utf8");
    return /<script|\son[a-z]+\s*=|javascript:|<foreignobject/i.test(texto);
}
/* =========================================================
   URLS
   ========================================================= */
/** URL PNG de tamaño acotado (para mostrar y para PDF). */
export function urlLogoPng(publicId, ancho = 600, alto = 240) {
    return cloudinary.url(publicId, {
        secure: true,
        format: "png",
        transformation: [{ width: ancho, height: alto, crop: "fit" }],
    });
}
function aInfo(e) {
    return {
        logoUrl: e.logoUrl,
        logoPngUrl: e.logoPublicId ? urlLogoPng(e.logoPublicId, 400, 160) : null,
        actualizadoAt: e.logoActualizadoAt,
    };
}
/* =========================================================
   CONSULTAR / SUBIR / ELIMINAR
   ========================================================= */
const SELECT_LOGO = {
    id_empresa: true,
    logoUrl: true,
    logoPublicId: true,
    logoActualizadoAt: true,
};
export async function obtenerLogoEmpresa(empresaId) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: SELECT_LOGO,
    });
    if (!empresa)
        throw new EmpresaLogoNoEncontradaError();
    return aInfo(empresa);
}
function subirACloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            folder: CARPETA_LOGOS,
            public_id: publicId,
            resource_type: "image",
            overwrite: false,
        }, (error, resultado) => {
            if (error || !resultado) {
                reject(error ?? new Error("Cloudinary no devolvió resultado."));
                return;
            }
            resolve(resultado);
        });
        stream.end(buffer);
    });
}
async function borrarDeCloudinary(publicId) {
    if (!publicId)
        return;
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    }
    catch (error) {
        /* No bloquea: el logo nuevo ya quedó guardado. */
        console.warn(`[EMPRESA LOGO] No se pudo borrar ${publicId} en Cloudinary:`, error);
    }
}
export async function subirLogoEmpresa(empresaId, buffer) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: SELECT_LOGO,
    });
    if (!empresa)
        throw new EmpresaLogoNoEncontradaError();
    if (buffer.length === 0) {
        throw new LogoEmpresaInvalidoError("El archivo está vacío.");
    }
    if (buffer.length > MAX_BYTES_LOGO) {
        throw new LogoEmpresaInvalidoError("El logo supera el máximo de 2 MB.");
    }
    const formato = detectarFormato(buffer);
    if (!formato) {
        throw new LogoEmpresaInvalidoError("Formato no permitido. Usa PNG, JPG, WEBP o SVG.");
    }
    if (formato === "svg" && svgPeligroso(buffer)) {
        throw new LogoEmpresaInvalidoError("El SVG contiene scripts o enlaces activos. Usa un PNG o un SVG simple.");
    }
    const resultado = await subirACloudinary(buffer, `empresa-${empresaId}-${Date.now()}`);
    const actualizada = await prisma.empresa.update({
        where: { id_empresa: empresaId },
        data: {
            logoUrl: resultado.secure_url,
            logoPublicId: resultado.public_id,
            logoActualizadoAt: new Date(),
        },
        select: SELECT_LOGO,
    });
    if (empresa.logoPublicId && empresa.logoPublicId !== resultado.public_id) {
        await borrarDeCloudinary(empresa.logoPublicId);
        cacheLogos.delete(empresa.logoPublicId);
    }
    return aInfo(actualizada);
}
export async function eliminarLogoEmpresa(empresaId) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: SELECT_LOGO,
    });
    if (!empresa)
        throw new EmpresaLogoNoEncontradaError();
    if (!empresa.logoPublicId && !empresa.logoUrl)
        return aInfo(empresa);
    const actualizada = await prisma.empresa.update({
        where: { id_empresa: empresaId },
        data: { logoUrl: null, logoPublicId: null, logoActualizadoAt: new Date() },
        select: SELECT_LOGO,
    });
    await borrarDeCloudinary(empresa.logoPublicId);
    if (empresa.logoPublicId)
        cacheLogos.delete(empresa.logoPublicId);
    return aInfo(actualizada);
}
/* =========================================================
   PARA PDF (PNG en memoria, con caché)
   ========================================================= */
const cacheLogos = new Map();
const MAX_CACHE = 50;
/**
 * PNG del logo de la empresa para dibujarlo con PDFKit.
 * Devuelve null si no tiene logo o si falla la descarga: el PDF
 * se genera igual (sin logo de la empresa).
 */
export async function logoEmpresaPngParaPdf(empresaId) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { logoPublicId: true },
    });
    const publicId = empresa?.logoPublicId;
    if (!publicId)
        return null;
    const enCache = cacheLogos.get(publicId);
    if (enCache)
        return enCache;
    try {
        const respuesta = await fetch(urlLogoPng(publicId), {
            signal: AbortSignal.timeout(8_000),
        });
        if (!respuesta.ok) {
            console.warn(`[EMPRESA LOGO] Cloudinary respondió ${respuesta.status} para ${publicId}`);
            return null;
        }
        const buffer = Buffer.from(await respuesta.arrayBuffer());
        if (detectarFormato(buffer) !== "png") {
            console.warn(`[EMPRESA LOGO] La respuesta de ${publicId} no es PNG.`);
            return null;
        }
        if (cacheLogos.size >= MAX_CACHE) {
            const primera = cacheLogos.keys().next().value;
            if (primera !== undefined)
                cacheLogos.delete(primera);
        }
        cacheLogos.set(publicId, buffer);
        return buffer;
    }
    catch (error) {
        console.warn(`[EMPRESA LOGO] No se pudo descargar el logo de la empresa ${empresaId}:`, error);
        return null;
    }
}
//# sourceMappingURL=empresa-logo.service.js.map