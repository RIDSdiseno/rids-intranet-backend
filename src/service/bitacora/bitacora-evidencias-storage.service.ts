import {
    supabaseAdmin,
    BITACORA_EVIDENCIAS_BUCKET,
} from "../../lib/supabase/supabase.js";

type EtapaEvidenciaBitacoraStorage =
    | "ANTES"
    | "EN_PROCESO"
    | "DESPUES";

type SubirEvidenciaBitacoraStorageParams = {
    bitacoraId: number;
    etapa: EtapaEvidenciaBitacoraStorage;
    file: Express.Multer.File;
};

type ResultadoSubidaEvidencia = {
    storagePath: string;
};

function sanitizarNombreArchivo(
    nombre: string
): string {
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
function construirStoragePath({
    bitacoraId,
    etapa,
    nombreArchivo,
}: {
    bitacoraId: number;
    etapa: EtapaEvidenciaBitacoraStorage;
    nombreArchivo: string;
}): string {
    const timestamp =
        Date.now();

    const random =
        Math.random()
            .toString(36)
            .slice(2, 10);

    const nombreSeguro =
        sanitizarNombreArchivo(
            nombreArchivo
        );

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
export async function subirEvidenciaBitacoraStorage(
    params: SubirEvidenciaBitacoraStorageParams
): Promise<ResultadoSubidaEvidencia> {
    const {
        bitacoraId,
        etapa,
        file,
    } = params;

    if (
        !Number.isInteger(bitacoraId) ||
        bitacoraId <= 0
    ) {
        throw new Error(
            "bitacoraId inválido"
        );
    }

    if (
        ![
            "ANTES",
            "EN_PROCESO",
            "DESPUES",
        ].includes(etapa)
    ) {
        throw new Error(
            "Etapa de evidencia inválida"
        );
    }

    if (!file?.buffer?.length) {
        throw new Error(
            "El archivo está vacío"
        );
    }

    const storagePath =
        construirStoragePath({
            bitacoraId,
            etapa,
            nombreArchivo:
                file.originalname,
        });

    const {
        error,
    } =
        await supabaseAdmin.storage
            .from(
                BITACORA_EVIDENCIAS_BUCKET
            )
            .upload(
                storagePath,
                file.buffer,
                {
                    contentType:
                        file.mimetype,

                    /*
                     * No sobrescribir evidencia existente.
                     */
                    upsert:
                        false,

                    /*
                     * Mantener un cache razonable.
                     * Las signed URLs seguirán controlando
                     * el acceso al archivo privado.
                     */
                    cacheControl:
                        "3600",
                }
            );

    if (error) {
        throw new Error(
            `Error subiendo evidencia a Supabase: ${error.message}`
        );
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
export async function obtenerUrlFirmadaEvidenciaBitacora(
    storagePath: string,
    expiresInSeconds = 60 * 60
): Promise<string> {
    const path =
        String(storagePath ?? "").trim();

    if (!path) {
        throw new Error(
            "storagePath es obligatorio"
        );
    }

    if (
        !Number.isInteger(
            expiresInSeconds
        ) ||
        expiresInSeconds <= 0
    ) {
        throw new Error(
            "La duración de la URL firmada no es válida"
        );
    }

    const {
        data,
        error,
    } =
        await supabaseAdmin.storage
            .from(
                BITACORA_EVIDENCIAS_BUCKET
            )
            .createSignedUrl(
                path,
                expiresInSeconds
            );

    if (
        error ||
        !data?.signedUrl
    ) {
        throw new Error(
            `Error generando URL firmada: ${error?.message ??
            "Supabase no devolvió una URL"
            }`
        );
    }

    return data.signedUrl;
}

/**
 * Elimina físicamente una evidencia
 * desde Supabase Storage.
 */
export async function eliminarEvidenciaBitacoraStorage(
    storagePath: string
): Promise<void> {
    const path =
        String(storagePath ?? "").trim();

    if (!path) {
        throw new Error(
            "storagePath es obligatorio"
        );
    }

    const {
        data,
        error,
    } =
        await supabaseAdmin.storage
            .from(
                BITACORA_EVIDENCIAS_BUCKET
            )
            .remove([
                path,
            ]);

    if (error) {
        throw new Error(
            `Error eliminando evidencia de Supabase: ${error.message}`
        );
    }

    /*
     * Supabase normalmente devuelve el archivo eliminado.
     * Esta comprobación ayuda a detectar rutas incorrectas.
     */
    if (
        Array.isArray(data) &&
        data.length === 0
    ) {
        console.warn(
            `[BITACORA] Supabase no informó archivos eliminados para: ${path}`
        );
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
export async function agregarUrlsFirmadasAEvidencias<
    T extends {
        storagePath: string;
    }
>(
    evidencias: T[],
    expiresInSeconds = 60 * 60
): Promise<
    Array<
        T & {
            url: string;
        }
    >
> {
    return Promise.all(
        evidencias.map(
            async (
                evidencia
            ) => {
                const url =
                    await obtenerUrlFirmadaEvidenciaBitacora(
                        evidencia.storagePath,
                        expiresInSeconds
                    );

                return {
                    ...evidencia,
                    url,
                };
            }
        )
    );
}