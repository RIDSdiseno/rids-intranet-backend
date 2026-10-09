import {
    supabaseAdmin,
    CORREO_PLANTILLAS_BUCKET,
} from "../../lib/supabase/supabase.js";

function sanitizeFilename(
    filename: string
): string {
    return filename
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        );
}

export async function subirArchivoPlantilla({
    plantillaId,
    nombre,
    buffer,
    contentType,
}: {
    plantillaId: number;
    nombre: string;
    buffer: Buffer;
    contentType: string;
}): Promise<string> {

    const safeName =
        sanitizeFilename(
            nombre
        );

    const storagePath =
        `plantilla-${plantillaId}/${Date.now()}-${safeName}`;

    const {
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CORREO_PLANTILLAS_BUCKET
            )
            .upload(
                storagePath,
                buffer,
                {
                    contentType,

                    upsert:
                        false,
                }
            );

    if (error) {
        throw new Error(
            `No fue posible subir la plantilla: ${error.message}`
        );
    }

    return storagePath;
}

export async function descargarArchivoPlantilla(
    storagePath: string
): Promise<Buffer> {

    const {
        data,
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CORREO_PLANTILLAS_BUCKET
            )
            .download(
                storagePath
            );

    if (
        error ||
        !data
    ) {
        throw new Error(
            error?.message ??
            "No fue posible descargar la plantilla"
        );
    }

    const arrayBuffer =
        await data.arrayBuffer();

    return Buffer.from(
        arrayBuffer
    );
}

export async function crearUrlPreviewPlantilla(
    storagePath: string,
    expiresIn = 900
): Promise<string> {

    const {
        data,
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CORREO_PLANTILLAS_BUCKET
            )
            .createSignedUrl(
                storagePath,
                expiresIn
            );

    if (
        error ||
        !data?.signedUrl
    ) {
        throw new Error(
            error?.message ??
            "No fue posible generar preview"
        );
    }

    return data.signedUrl;
}

export async function eliminarArchivoPlantilla(
    storagePath: string
): Promise<void> {

    const {
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CORREO_PLANTILLAS_BUCKET
            )
            .remove([
                storagePath,
            ]);

    if (error) {
        throw new Error(
            error.message
        );
    }
}