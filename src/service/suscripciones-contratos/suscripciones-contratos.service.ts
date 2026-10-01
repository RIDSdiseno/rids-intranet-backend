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

import {
    Prisma,
} from "@prisma/client";

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

            include: {
                ejecutivosComerciales: {
                    orderBy: [
                        {
                            principal:
                                "desc",
                        },
                        {
                            id:
                                "asc",
                        },
                    ],
                },

                contactosSoporte: {
                    orderBy: [
                        {
                            principal:
                                "desc",
                        },
                        {
                            id:
                                "asc",
                        },
                    ],
                },
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

            include: {
                ejecutivosComerciales: {
                    orderBy: [
                        {
                            principal:
                                "desc",
                        },
                        {
                            id:
                                "asc",
                        },
                    ],
                },

                contactosSoporte: {
                    orderBy: [
                        {
                            principal:
                                "desc",
                        },
                        {
                            id:
                                "asc",
                        },
                    ],
                },
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

    const ejecutivos =
        input
            .ejecutivosComerciales ??
        [];

    const contactosSoporte =
        input
            .contactosSoporte ??
        [];

    /*
     * Normalizamos principal para evitar
     * varios principales simultáneamente.
     */
    const ejecutivosNormalizados =
        ejecutivos.map(
            (
                ejecutivo,
                index
            ) => ({
                nombre:
                    normalizarTexto(
                        ejecutivo.nombre
                    ) ??
                    "",

                email:
                    normalizarTexto(
                        ejecutivo.email
                    ),

                telefono:
                    normalizarTexto(
                        ejecutivo.telefono
                    ),

                principal:
                    ejecutivos.some(
                        item =>
                            item.principal
                    )
                        ? Boolean(
                            ejecutivo.principal
                        )
                        : index ===
                        0,
            })
        )
            .filter(
                ejecutivo =>
                    Boolean(
                        ejecutivo.nombre
                    )
            );

    const soporteNormalizado =
        contactosSoporte
            .map(
                (
                    contacto,
                    index
                ) => ({
                    nombre:
                        normalizarTexto(
                            contacto.nombre
                        ),

                    email:
                        normalizarTexto(
                            contacto.email
                        ),

                    telefono:
                        normalizarTexto(
                            contacto.telefono
                        ),

                    principal:
                        contactosSoporte.some(
                            item =>
                                item.principal
                        )
                            ? Boolean(
                                contacto.principal
                            )
                            : index ===
                            0,
                })
            )
            .filter(
                contacto =>
                    Boolean(
                        contacto.nombre ||
                        contacto.email ||
                        contacto.telefono
                    )
            );

    return prisma
        .$transaction(
            async tx => {
                const suscripcion =
                    await tx
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

                                observaciones:
                                    normalizarTexto(
                                        input.observaciones
                                    ),

                                activo:
                                    input.activo ??
                                    true,
                            },
                        });

                if (
                    ejecutivosNormalizados.length >
                    0
                ) {
                    await tx
                        .suscripcionContratoEjecutivo
                        .createMany({
                            data:
                                ejecutivosNormalizados.map(
                                    ejecutivo => ({
                                        suscripcionId:
                                            suscripcion.id,

                                        ...ejecutivo,
                                    })
                                ),
                        });
                }

                if (
                    soporteNormalizado.length >
                    0
                ) {
                    await tx
                        .suscripcionContratoSoporte
                        .createMany({
                            data:
                                soporteNormalizado.map(
                                    contacto => ({
                                        suscripcionId:
                                            suscripcion.id,

                                        ...contacto,
                                    })
                                ),
                        });
                }

                return tx
                    .suscripcionContrato
                    .findUnique({
                        where: {
                            id:
                                suscripcion.id,
                        },

                        include: {
                            ejecutivosComerciales:
                                true,

                            contactosSoporte:
                                true,
                        },
                    });
            }
        );
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

    /* =====================================================
       DATA PRINCIPAL
    ===================================================== */

    const data:
        Prisma.SuscripcionContratoUpdateInput =
        {};

    /* =====================================================
       CAMPOS OBLIGATORIOS
    ===================================================== */

    if (
        input.proveedor !==
        undefined
    ) {
        const proveedor =
            normalizarTexto(
                input.proveedor
            );

        if (
            !proveedor
        ) {
            throw new Error(
                "DATOS_OBLIGATORIOS"
            );
        }

        data.proveedor =
            proveedor;
    }

    if (
        input.fabricante !==
        undefined
    ) {
        const fabricante =
            normalizarTexto(
                input.fabricante
            );

        if (
            !fabricante
        ) {
            throw new Error(
                "DATOS_OBLIGATORIOS"
            );
        }

        data.fabricante =
            fabricante;
    }

    if (
        input.productoPlan !==
        undefined
    ) {
        const productoPlan =
            normalizarTexto(
                input.productoPlan
            );

        if (
            !productoPlan
        ) {
            throw new Error(
                "DATOS_OBLIGATORIOS"
            );
        }

        data.productoPlan =
            productoPlan;
    }

    /* =====================================================
       LICENCIAS
    ===================================================== */

    if (
        input.cantidadLicencias !==
        undefined
    ) {
        data.cantidadLicencias =
            Math.max(
                1,
                Number(
                    input.cantidadLicencias
                )
            );
    }

    /* =====================================================
       COSTO
    ===================================================== */

    if (
        input.costoMensual !==
        undefined
    ) {
        data.costoMensual =
            input.costoMensual;
    }

    /* =====================================================
       MONEDA
    ===================================================== */

    if (
        input.moneda !==
        undefined
    ) {
        const moneda =
            normalizarTexto(
                input.moneda
            );

        if (
            moneda
        ) {
            data.moneda =
                moneda;
        }
    }

    /* =====================================================
       FECHAS
    ===================================================== */

    if (
        input.fechaInicio !==
        undefined
    ) {
        data.fechaInicio =
            normalizarFecha(
                input.fechaInicio
            );
    }

    if (
        input.fechaTermino !==
        undefined
    ) {
        data.fechaTermino =
            normalizarFecha(
                input.fechaTermino
            );
    }

    if (
        input.fechaRenovacion !==
        undefined
    ) {
        data.fechaRenovacion =
            normalizarFecha(
                input.fechaRenovacion
            );
    }

    /* =====================================================
       CONTRATO / OFERTA
    ===================================================== */

    if (
        input.numeroContrato !==
        undefined
    ) {
        data.numeroContrato =
            normalizarTexto(
                input.numeroContrato
            );
    }

    if (
        input.numeroOferta !==
        undefined
    ) {
        data.numeroOferta =
            normalizarTexto(
                input.numeroOferta
            );
    }

    /* =====================================================
       OBSERVACIONES
    ===================================================== */

    if (
        input.observaciones !==
        undefined
    ) {
        data.observaciones =
            normalizarTexto(
                input.observaciones
            );
    }

    /* =====================================================
       ESTADO
    ===================================================== */

    if (
        input.activo !==
        undefined
    ) {
        data.activo =
            input.activo;
    }

    /* =====================================================
       TRANSACCIÓN
    ===================================================== */

    return prisma.$transaction(
        async tx => {
            /* =============================================
               ACTUALIZAR SUSCRIPCIÓN
            ============================================= */

            await tx
                .suscripcionContrato
                .update({
                    where: {
                        id:
                            suscripcionId,
                    },

                    data,
                });

            /* =============================================
               EJECUTIVOS COMERCIALES
            ============================================= */

            if (
                input.ejecutivosComerciales !==
                undefined
            ) {
                await tx
                    .suscripcionContratoEjecutivo
                    .deleteMany({
                        where: {
                            suscripcionId,
                        },
                    });

                const ejecutivos =
                    input
                        .ejecutivosComerciales
                        .map(
                            ejecutivo => ({
                                nombre:
                                    normalizarTexto(
                                        ejecutivo.nombre
                                    ) ??
                                    "",

                                email:
                                    normalizarTexto(
                                        ejecutivo.email
                                    ),

                                telefono:
                                    normalizarTexto(
                                        ejecutivo.telefono
                                    ),

                                principal:
                                    Boolean(
                                        ejecutivo.principal
                                    ),
                            })
                        )
                        .filter(
                            ejecutivo =>
                                Boolean(
                                    ejecutivo.nombre
                                )
                        );

                /*
                 * Si ninguno viene marcado principal,
                 * dejamos el primero.
                 */
                if (
                    ejecutivos.length >
                    0 &&
                    !ejecutivos.some(
                        ejecutivo =>
                            ejecutivo.principal
                    )
                ) {
                    const primerEjecutivo =
                        ejecutivos[0];

                    if (
                        primerEjecutivo
                    ) {
                        primerEjecutivo.principal =
                            true;
                    }
                }

                /*
                 * Dejamos como máximo un principal.
                 */
                let principalEncontrado =
                    false;

                const ejecutivosNormalizados =
                    ejecutivos.map(
                        ejecutivo => {
                            let principal =
                                false;

                            if (
                                ejecutivo.principal &&
                                !principalEncontrado
                            ) {
                                principal =
                                    true;

                                principalEncontrado =
                                    true;
                            }

                            return {
                                suscripcionId,

                                nombre:
                                    ejecutivo.nombre,

                                email:
                                    ejecutivo.email,

                                telefono:
                                    ejecutivo.telefono,

                                principal,
                            };
                        }
                    );

                if (
                    ejecutivosNormalizados.length >
                    0
                ) {
                    await tx
                        .suscripcionContratoEjecutivo
                        .createMany({
                            data:
                                ejecutivosNormalizados,
                        });
                }
            }

            /* =============================================
               CONTACTOS SOPORTE
            ============================================= */

            if (
                input.contactosSoporte !==
                undefined
            ) {
                await tx
                    .suscripcionContratoSoporte
                    .deleteMany({
                        where: {
                            suscripcionId,
                        },
                    });

                const contactos =
                    input
                        .contactosSoporte
                        .map(
                            contacto => ({
                                nombre:
                                    normalizarTexto(
                                        contacto.nombre
                                    ),

                                email:
                                    normalizarTexto(
                                        contacto.email
                                    ),

                                telefono:
                                    normalizarTexto(
                                        contacto.telefono
                                    ),

                                principal:
                                    Boolean(
                                        contacto.principal
                                    ),
                            })
                        )
                        .filter(
                            contacto =>
                                Boolean(
                                    contacto.nombre ||
                                    contacto.email ||
                                    contacto.telefono
                                )
                        );

                /*
                 * Si ninguno viene marcado principal,
                 * dejamos el primero.
                 */
                if (
                    contactos.length >
                    0 &&
                    !contactos.some(
                        contacto =>
                            contacto.principal
                    )
                ) {
                    const primerContacto =
                        contactos[0];

                    if (
                        primerContacto
                    ) {
                        primerContacto.principal =
                            true;
                    }
                }

                /*
                 * Dejamos como máximo uno principal.
                 */
                let principalEncontrado =
                    false;

                const contactosNormalizados =
                    contactos.map(
                        contacto => {
                            let principal =
                                false;

                            if (
                                contacto.principal &&
                                !principalEncontrado
                            ) {
                                principal =
                                    true;

                                principalEncontrado =
                                    true;
                            }

                            return {
                                suscripcionId,

                                nombre:
                                    contacto.nombre,

                                email:
                                    contacto.email,

                                telefono:
                                    contacto.telefono,

                                principal,
                            };
                        }
                    );

                if (
                    contactosNormalizados.length >
                    0
                ) {
                    await tx
                        .suscripcionContratoSoporte
                        .createMany({
                            data:
                                contactosNormalizados,
                        });
                }
            }

            /* =============================================
               DEVOLVER REGISTRO FINAL
            ============================================= */

            return tx
                .suscripcionContrato
                .findUnique({
                    where: {
                        id:
                            suscripcionId,
                    },

                    include: {
                        ejecutivosComerciales: {
                            orderBy: [
                                {
                                    principal:
                                        "desc",
                                },
                                {
                                    id:
                                        "asc",
                                },
                            ],
                        },

                        contactosSoporte: {
                            orderBy: [
                                {
                                    principal:
                                        "desc",
                                },
                                {
                                    id:
                                        "asc",
                                },
                            ],
                        },
                    },
                });
        }
    );
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