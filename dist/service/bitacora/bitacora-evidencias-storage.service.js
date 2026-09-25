import { supabaseAdmin, BITACORA_EVIDENCIAS_BUCKET, } from "../../lib/supabase/supabase.js";
import { EtapaBitacora, } from "@prisma/client";
function obtenerMensajeErrorStorage(error) {
    if (!error ||
        typeof error !==
            "object") {
        return "Error desconocido de Supabase Storage";
    }
    const storageError = error;
    const message = typeof storageError.message ===
        "string"
        ? storageError.message.trim()
        : "";
    /*
     * Algunas respuestas de Storage pueden devolver
     * literalmente "<none>" como message.
     */
    if (message &&
        message !== "<none>") {
        return message;
    }
    const partes = [];
    if (storageError.statusCode !==
        undefined) {
        partes.push(`statusCode=${String(storageError.statusCode)}`);
    }
    if (storageError.status !==
        undefined) {
        partes.push(`status=${String(storageError.status)}`);
    }
    if (storageError.code !==
        undefined) {
        partes.push(`code=${String(storageError.code)}`);
    }
    if (typeof storageError.error ===
        "string" &&
        storageError.error.trim()) {
        partes.push(storageError.error.trim());
    }
    return partes.length > 0
        ? partes.join(" | ")
        : "Error desconocido de Supabase Storage";
}
function sanitizarNombreArchivo(nombre) {
    const nombreSeguro = nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return nombreSeguro || "archivo";
}
/**
 * Genera una ruta única para almacenar
 * una evidencia de bitácora en Supabase.
 */
function construirStoragePath({ bitacoraId, etapa, nombreArchivo, }) {
    const timestamp = Date.now();
    const random = Math.random()
        .toString(36)
        .slice(2, 10);
    const nombreSeguro = sanitizarNombreArchivo(nombreArchivo);
    return [
        `bitacora-${bitacoraId}`,
        etapa,
        `${timestamp}-${random}-${nombreSeguro}`,
    ].join("/");
}
/**
 * Sube una imagen o video al bucket privado
 * de evidencias de Bitácora.
 *
 * La función solamente devuelve storagePath,
 * ya que la URL de acceso será temporal
 * mediante createSignedUrl().
 */
export async function subirEvidenciaBitacoraStorage(params) {
    const { bitacoraId, etapa, file, } = params;
    if (!Number.isInteger(bitacoraId) ||
        bitacoraId <=
            0) {
        throw new Error("bitacoraId inválido");
    }
    if (![
        "ANTES",
        "EN_PROCESO",
        "DESPUES",
    ].includes(etapa)) {
        throw new Error("Etapa de evidencia inválida");
    }
    if (!file?.buffer?.length) {
        throw new Error("El archivo está vacío");
    }
    const bucket = String(BITACORA_EVIDENCIAS_BUCKET ??
        "").trim();
    if (!bucket) {
        throw new Error("BITACORA_EVIDENCIAS_BUCKET no está configurado");
    }
    const storagePath = construirStoragePath({
        bitacoraId,
        etapa,
        nombreArchivo: file.originalname,
    });
    const { data, error, } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: "3600",
    });
    if (error) {
        const mensajeError = obtenerMensajeErrorStorage(error);
        console.error("❌ Error Supabase Storage al subir evidencia:", {
            mensajeError,
            message: error.message,
            name: error.name,
            statusCode: "statusCode" in error
                ? error.statusCode
                : undefined,
            error,
            bucket,
            storagePath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sizeMB: Number((file.size /
                1024 /
                1024).toFixed(2)),
            originalname: file.originalname,
        });
        throw new Error(`Error subiendo evidencia a Supabase: ${mensajeError}`);
    }
    return {
        storagePath,
    };
}
/**
 * Genera una URL firmada temporal para visualizar
 * una evidencia almacenada en bucket privado.
 *
 * Por defecto dura una hora.
 */
export async function obtenerUrlFirmadaEvidenciaBitacora(storagePath, expiresInSeconds = 60 * 60) {
    const path = String(storagePath ?? "").trim();
    if (!path) {
        throw new Error("storagePath es obligatorio");
    }
    if (!Number.isInteger(expiresInSeconds) ||
        expiresInSeconds <= 0) {
        throw new Error("La duración de la URL firmada no es válida");
    }
    const { data, error, } = await supabaseAdmin.storage
        .from(BITACORA_EVIDENCIAS_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
    if (error ||
        !data?.signedUrl) {
        throw new Error(`Error generando URL firmada: ${error?.message ??
            "Supabase no devolvió una URL"}`);
    }
    return data.signedUrl;
}
/**
 * Elimina físicamente una evidencia
 * desde Supabase Storage.
 */
export async function eliminarEvidenciaBitacoraStorage(storagePath) {
    const path = String(storagePath ?? "").trim();
    if (!path) {
        throw new Error("storagePath es obligatorio");
    }
    const { data, error, } = await supabaseAdmin.storage
        .from(BITACORA_EVIDENCIAS_BUCKET)
        .remove([
        path,
    ]);
    if (error) {
        throw new Error(`Error eliminando evidencia de Supabase: ${error.message}`);
    }
    /*
     * Supabase normalmente devuelve el archivo eliminado.
     * Esta comprobación ayuda a detectar rutas incorrectas.
     */
    if (Array.isArray(data) &&
        data.length === 0) {
        console.warn(`[BITACORA] Supabase no informó archivos eliminados para: ${path}`);
    }
}
/**
 * Genera signed URLs para varias evidencias.
 *
 * Esta función será útil posteriormente en:
 *
 * GET /bitacora-tecnico/:id/evidencias
 *
 * y en el detalle individual de la bitácora.
 */
export async function agregarUrlsFirmadasAEvidencias(evidencias, expiresInSeconds = 60 * 60) {
    return Promise.all(evidencias.map(async (evidencia) => {
        const url = await obtenerUrlFirmadaEvidenciaBitacora(evidencia.storagePath, expiresInSeconds);
        return {
            ...evidencia,
            url,
        };
    }));
}
//# sourceMappingURL=bitacora-evidencias-storage.service.js.map