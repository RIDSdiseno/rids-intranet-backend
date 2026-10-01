// src/service/suscripciones-contratos/suscripciones-contratos.service.ts
import {
    prisma,
} from "../../lib/prisma.js";

import type {
    ActualizarSuscripcionContratoInput,
    CrearSuscripcionContratoInput,
} from "./suscripciones-contratos.types.js";

import {
    randomUUID,
} from "node:crypto";

import {
    CONTRATOS_EMPRESAS_BUCKET,
    supabaseAdmin,
} from "../../lib/supabase/supabase.js";

/* =========================================================
   HELPERS
========================================================= */

function normalizarTexto(
    value:
        unknown
): string | null {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const texto =
        String(
            value
        ).trim();

    return texto || null;
}

function normalizarFecha(
    value:
        string | null | undefined
): Date | null {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const fecha =
        new Date(
            value
        );

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {
        throw new Error(
            `Fecha inválida: ${value}`
        );
    }

    return fecha;
}

/* =========================================================
   CONTRATO PDF
========================================================= */

type ArchivoContrato = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

/* =========================================================
   SUBIR / REEMPLAZAR CONTRATO
========================================================= */

export async function subirContratoSuscripcion(
    empresaId: number,
    suscripcionId: number,
    archivo: ArchivoContrato
) {
    const suscripcion =
        await obtenerSuscripcionEmpresa(
            empresaId,
            suscripcionId
        );

    if (
        !suscripcion
    ) {
        throw new Error(
            "SUSCRIPCION_NO_ENCONTRADA"
        );
    }

    if (
        archivo.mimetype !==
        "application/pdf"
    ) {
        throw new Error(
            "ARCHIVO_NO_PDF"
        );
    }

    const nombreSeguro =
        archivo.originalname
            .trim()
            .replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            );

    const storagePath =
        [
            `empresa-${empresaId}`,
            `suscripcion-${suscripcionId}`,
            `${randomUUID()}-${nombreSeguro}`,
        ].join("/");

    /*
     * Guardamos la ruta anterior para eliminarla
     * después de reemplazar correctamente el PDF.
     */
    const contratoAnterior =
        suscripcion
            .contratoStoragePath;

    const {
        error:
        uploadError,
    } =
        await supabaseAdmin
            .storage
            .from(
                CONTRATOS_EMPRESAS_BUCKET
            )
            .upload(
                storagePath,
                archivo.buffer,
                {
                    contentType:
                        "application/pdf",

                    upsert:
                        false,
                }
            );

    if (
        uploadError
    ) {
        console.error(
            "Error subiendo contrato a Supabase:",
            uploadError
        );

        throw new Error(
            "ERROR_SUBIENDO_CONTRATO"
        );
    }

    try {
        const actualizado =
            await prisma
                .suscripcionContrato
                .update({
                    where: {
                        id:
                            suscripcionId,
                    },

                    data: {
                        contratoNombre:
                            archivo.originalname,

                        contratoMimeType:
                            archivo.mimetype,

                        contratoBytes:
                            archivo.size,

                        contratoStoragePath:
                            storagePath,
                    },
                });

        /*
         * El nuevo contrato ya quedó registrado.
         * Ahora sí podemos borrar el anterior.
         */
        if (
            contratoAnterior &&
            contratoAnterior !==
            storagePath
        ) {
            const {
                error:
                deleteAnteriorError,
            } =
                await supabaseAdmin
                    .storage
                    .from(
                        CONTRATOS_EMPRESAS_BUCKET
                    )
                    .remove([
                        contratoAnterior,
                    ]);

            if (
                deleteAnteriorError
            ) {
                console.warn(
                    "No fue posible eliminar el contrato anterior:",
                    deleteAnteriorError
                );
            }
        }

        return actualizado;
    } catch (
    error
    ) {
        /*
         * Si PostgreSQL falla después de subir el PDF,
         * eliminamos el archivo nuevo para no dejar
         * archivos huérfanos.
         */
        await supabaseAdmin
            .storage
            .from(
                CONTRATOS_EMPRESAS_BUCKET
            )
            .remove([
                storagePath,
            ]);

        throw error;
    }
}

/* =========================================================
   OBTENER URL FIRMADA
========================================================= */

export async function obtenerContratoSuscripcion(
    empresaId: number,
    suscripcionId: number
) {
    const suscripcion =
        await obtenerSuscripcionEmpresa(
            empresaId,
            suscripcionId
        );

    if (
        !suscripcion
    ) {
        throw new Error(
            "SUSCRIPCION_NO_ENCONTRADA"
        );
    }

    if (
        !suscripcion
            .contratoStoragePath
    ) {
        throw new Error(
            "CONTRATO_NO_ENCONTRADO"
        );
    }

    const {
        data,
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CONTRATOS_EMPRESAS_BUCKET
            )
            .createSignedUrl(
                suscripcion
                    .contratoStoragePath,
                60 * 10
            );

    if (
        error ||
        !data?.signedUrl
    ) {
        console.error(
            "Error generando URL firmada:",
            error
        );

        throw new Error(
            "ERROR_GENERANDO_URL_CONTRATO"
        );
    }

    return {
        nombre:
            suscripcion
                .contratoNombre,

        mimeType:
            suscripcion
                .contratoMimeType,

        bytes:
            suscripcion
                .contratoBytes,

        url:
            data.signedUrl,

        expiresIn:
            600,
    };
}

/* =========================================================
   ELIMINAR CONTRATO
========================================================= */

export async function eliminarContratoSuscripcion(
    empresaId: number,
    suscripcionId: number
) {
    const suscripcion =
        await obtenerSuscripcionEmpresa(
            empresaId,
            suscripcionId
        );

    if (
        !suscripcion
    ) {
        throw new Error(
            "SUSCRIPCION_NO_ENCONTRADA"
        );
    }

    if (
        !suscripcion
            .contratoStoragePath
    ) {
        throw new Error(
            "CONTRATO_NO_ENCONTRADO"
        );
    }

    const storagePath =
        suscripcion
            .contratoStoragePath;

    const {
        error,
    } =
        await supabaseAdmin
            .storage
            .from(
                CONTRATOS_EMPRESAS_BUCKET
            )
            .remove([
                storagePath,
            ]);

    if (
        error
    ) {
        console.error(
            "Error eliminando contrato de Supabase:",
            error
        );

        throw new Error(
            "ERROR_ELIMINANDO_CONTRATO"
        );
    }

    return prisma
        .suscripcionContrato
        .update({
            where: {
                id:
                    suscripcionId,
            },

            data: {
                contratoNombre:
                    null,

                contratoMimeType:
                    null,

                contratoBytes:
                    null,

                contratoStoragePath:
                    null,
            },
        });
}

/* =========================================================
   LISTAR
========================================================= */

export async function listarSuscripcionesEmpresa(
    empresaId:
        number
) {
    return prisma
        .suscripcionContrato
        .findMany({
            where: {
                empresaId,
            },

            orderBy: [
                {
                    activo:
                        "desc",
                },
                {
                    fechaRenovacion:
                        "asc",
                },
                {
                    createdAt:
                        "desc",
                },
            ],
        });
}

/* =========================================================
   OBTENER
========================================================= */

export async function obtenerSuscripcionEmpresa(
    empresaId:
        number,

    suscripcionId:
        number
) {
    return prisma
        .suscripcionContrato
        .findFirst({
            where: {
                id:
                    suscripcionId,

                empresaId,
            },
        });
}

/* =========================================================
   CREAR
========================================================= */

export async function crearSuscripcionEmpresa(
    empresaId:
        number,

    input:
        CrearSuscripcionContratoInput
) {
    const empresa =
        await prisma
            .empresa
            .findUnique({
                where: {
                    id_empresa:
                        empresaId,
                },

                select: {
                    id_empresa:
                        true,

                    isActive:
                        true,
                },
            });

    if (
        !empresa
    ) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    const proveedor =
        normalizarTexto(
            input.proveedor
        );

    const fabricante =
        normalizarTexto(
            input.fabricante
        );

    const productoPlan =
        normalizarTexto(
            input.productoPlan
        );

    if (
        !proveedor ||
        !fabricante ||
        !productoPlan
    ) {
        throw new Error(
            "DATOS_OBLIGATORIOS"
        );
    }

    const cantidadLicencias =
        Math.max(
            1,
            Number(
                input.cantidadLicencias ??
                1
            )
        );

    return prisma
        .suscripcionContrato
        .create({
            data: {
                empresaId,

                proveedor,

                fabricante,

                productoPlan,

                cantidadLicencias,

                costoMensual:
                    input.costoMensual ??
                    null,

                moneda:
                    normalizarTexto(
                        input.moneda
                    ) ??
                    "CLP",

                fechaInicio:
                    normalizarFecha(
                        input.fechaInicio
                    ),

                fechaTermino:
                    normalizarFecha(
                        input.fechaTermino
                    ),

                fechaRenovacion:
                    normalizarFecha(
                        input.fechaRenovacion
                    ),

                numeroContrato:
                    normalizarTexto(
                        input.numeroContrato
                    ),

                numeroOferta:
                    normalizarTexto(
                        input.numeroOferta
                    ),

                ejecutivoNombre:
                    normalizarTexto(
                        input.ejecutivoNombre
                    ),

                ejecutivoEmail:
                    normalizarTexto(
                        input.ejecutivoEmail
                    ),

                ejecutivoTelefono:
                    normalizarTexto(
                        input.ejecutivoTelefono
                    ),

                soporteTelefono:
                    normalizarTexto(
                        input.soporteTelefono
                    ),

                soporteEmail:
                    normalizarTexto(
                        input.soporteEmail
                    ),

                observaciones:
                    normalizarTexto(
                        input.observaciones
                    ),

                activo:
                    input.activo ??
                    true,
            },
        });
}

/* =========================================================
   ACTUALIZAR
========================================================= */

export async function actualizarSuscripcionEmpresa(
    empresaId:
        number,

    suscripcionId:
        number,

    input:
        ActualizarSuscripcionContratoInput
) {
    const actual =
        await obtenerSuscripcionEmpresa(
            empresaId,
            suscripcionId
        );

    if (
        !actual
    ) {
        throw new Error(
            "SUSCRIPCION_NO_ENCONTRADA"
        );
    }

    return prisma
        .suscripcionContrato
        .update({
            where: {
                id:
                    suscripcionId,
            },

            data: {
                ...(input.proveedor !==
                    undefined
                    ? {
                        proveedor:
                            normalizarTexto(
                                input.proveedor
                            ) ??
                            actual.proveedor,
                    }
                    : {}),

                ...(input.fabricante !==
                    undefined
                    ? {
                        fabricante:
                            normalizarTexto(
                                input.fabricante
                            ) ??
                            actual.fabricante,
                    }
                    : {}),

                ...(input.productoPlan !==
                    undefined
                    ? {
                        productoPlan:
                            normalizarTexto(
                                input.productoPlan
                            ) ??
                            actual.productoPlan,
                    }
                    : {}),

                ...(input.cantidadLicencias !==
                    undefined
                    ? {
                        cantidadLicencias:
                            Math.max(
                                1,
                                Number(
                                    input
                                        .cantidadLicencias
                                )
                            ),
                    }
                    : {}),

                ...(input.costoMensual !==
                    undefined
                    ? {
                        costoMensual:
                            input
                                .costoMensual,
                    }
                    : {}),

                ...(input.moneda !==
                    undefined
                    ? {
                        moneda:
                            normalizarTexto(
                                input.moneda
                            ) ??
                            actual.moneda,
                    }
                    : {}),

                ...(input.fechaInicio !==
                    undefined
                    ? {
                        fechaInicio:
                            normalizarFecha(
                                input.fechaInicio
                            ),
                    }
                    : {}),

                ...(input.fechaTermino !==
                    undefined
                    ? {
                        fechaTermino:
                            normalizarFecha(
                                input.fechaTermino
                            ),
                    }
                    : {}),

                ...(input.fechaRenovacion !==
                    undefined
                    ? {
                        fechaRenovacion:
                            normalizarFecha(
                                input.fechaRenovacion
                            ),
                    }
                    : {}),

                ...(input.numeroContrato !==
                    undefined
                    ? {
                        numeroContrato:
                            normalizarTexto(
                                input.numeroContrato
                            ),
                    }
                    : {}),

                ...(input.numeroOferta !==
                    undefined
                    ? {
                        numeroOferta:
                            normalizarTexto(
                                input.numeroOferta
                            ),
                    }
                    : {}),

                ...(input.ejecutivoNombre !==
                    undefined
                    ? {
                        ejecutivoNombre:
                            normalizarTexto(
                                input.ejecutivoNombre
                            ),
                    }
                    : {}),

                ...(input.ejecutivoEmail !==
                    undefined
                    ? {
                        ejecutivoEmail:
                            normalizarTexto(
                                input.ejecutivoEmail
                            ),
                    }
                    : {}),

                ...(input.ejecutivoTelefono !==
                    undefined
                    ? {
                        ejecutivoTelefono:
                            normalizarTexto(
                                input.ejecutivoTelefono
                            ),
                    }
                    : {}),

                ...(input.soporteTelefono !==
                    undefined
                    ? {
                        soporteTelefono:
                            normalizarTexto(
                                input.soporteTelefono
                            ),
                    }
                    : {}),

                ...(input.soporteEmail !==
                    undefined
                    ? {
                        soporteEmail:
                            normalizarTexto(
                                input.soporteEmail
                            ),
                    }
                    : {}),

                ...(input.observaciones !==
                    undefined
                    ? {
                        observaciones:
                            normalizarTexto(
                                input.observaciones
                            ),
                    }
                    : {}),

                ...(input.activo !==
                    undefined
                    ? {
                        activo:
                            Boolean(
                                input.activo
                            ),
                    }
                    : {}),
            },
        });
}

/* =========================================================
   ELIMINAR
========================================================= */

export async function eliminarSuscripcionEmpresa(
    empresaId:
        number,

    suscripcionId:
        number
) {
    const actual =
        await obtenerSuscripcionEmpresa(
            empresaId,
            suscripcionId
        );

    if (
        !actual
    ) {
        throw new Error(
            "SUSCRIPCION_NO_ENCONTRADA"
        );
    }

    /*
     * Primero eliminar el PDF si existe.
     */
    if (
        actual
            .contratoStoragePath
    ) {
        const {
            error,
        } =
            await supabaseAdmin
                .storage
                .from(
                    CONTRATOS_EMPRESAS_BUCKET
                )
                .remove([
                    actual
                        .contratoStoragePath,
                ]);

        if (
            error
        ) {
            console.error(
                "Error eliminando PDF de la suscripción:",
                error
            );

            throw new Error(
                "ERROR_ELIMINANDO_CONTRATO"
            );
        }
    }

    await prisma
        .suscripcionContrato
        .delete({
            where: {
                id:
                    suscripcionId,
            },
        });

    return {
        ok:
            true,
    };
}