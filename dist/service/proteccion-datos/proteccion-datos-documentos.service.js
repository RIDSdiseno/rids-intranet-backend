// src/service/proteccion-datos/proteccion-datos-documentos.service.ts
import { createHash, randomUUID, } from "crypto";
import { PROTECCION_DATOS_DOCUMENTOS_BUCKET, supabaseAdmin, } from "../../lib/supabase/supabase.js";
/* =========================================================
   CONSTANTES
   ========================================================= */
const MAX_PDF_SIZE = 15 *
    1024 *
    1024;
/* =========================================================
   HELPERS
   ========================================================= */
function sanitizarNombreArchivo(nombre) {
    const seguro = nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_");
    return seguro ||
        "documento.pdf";
}
function hashArchivo(buffer) {
    return createHash("sha256")
        .update(buffer)
        .digest("hex");
}
/* =========================================================
   SUBIR DOCUMENTO
   ========================================================= */
export async function subirDocumentoProteccionDatos(file) {
    if (!file) {
        throw new Error("Debes seleccionar un archivo");
    }
    if (file.mimetype !==
        "application/pdf") {
        throw new Error("Solo se permiten documentos PDF");
    }
    if (file.size <=
        0) {
        throw new Error("El archivo se encuentra vacío");
    }
    if (file.size >
        MAX_PDF_SIZE) {
        throw new Error("El PDF no puede superar los 15 MB");
    }
    const ahora = new Date();
    const year = String(ahora.getFullYear());
    const month = String(ahora.getMonth() +
        1).padStart(2, "0");
    const nombreSeguro = sanitizarNombreArchivo(file.originalname);
    const path = [
        "formularios",
        year,
        month,
        `${randomUUID()}-${nombreSeguro}`,
    ].join("/");
    const sha256 = hashArchivo(file.buffer);
    const { error, } = await supabaseAdmin
        .storage
        .from(PROTECCION_DATOS_DOCUMENTOS_BUCKET)
        .upload(path, file.buffer, {
        contentType: "application/pdf",
        upsert: false,
        cacheControl: "3600",
    });
    if (error) {
        throw new Error(`No se pudo subir el documento: ${error.message}`);
    }
    return {
        titulo: file.originalname,
        nombre: file.originalname,
        path,
        contentType: file.mimetype,
        size: file.size,
        sha256,
    };
}
/* =========================================================
   CREAR URL FIRMADA
   ========================================================= */
export async function crearUrlFirmadaDocumentoProteccionDatos(path, expiresInSeconds = 3600) {
    if (!path ||
        !path.startsWith("formularios/")) {
        throw new Error("Ruta de documento inválida");
    }
    const { data, error, } = await supabaseAdmin
        .storage
        .from(PROTECCION_DATOS_DOCUMENTOS_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
    if (error ||
        !data?.signedUrl) {
        throw new Error("No se pudo generar el acceso temporal al documento");
    }
    return data.signedUrl;
}
//# sourceMappingURL=proteccion-datos-documentos.service.js.map