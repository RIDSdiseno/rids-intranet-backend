// src/service/baseapi/facturas/facturas-receptores.service.ts
import {
    Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../../../lib/prisma.js";

type ListarReceptoresParams = {
    search?: string;
    origen?: string;
    activo?: boolean;
    recibeFacturas?: boolean;
    sinContactos?: boolean;
    empresaId?: number;
};

function normalizeRut(
    value: unknown
): string {
    return String(
        value ?? ""
    )
        .replace(
            /[^0-9kK]/g,
            ""
        )
        .toUpperCase()
        .trim();
}

function normalizeEmail(
    value: unknown
): string {
    return String(
        value ?? ""
    )
        .trim()
        .toLowerCase();
}

export async function listarReceptoresFacturacion(
    params: ListarReceptoresParams = {}
) {
    const where:
        Prisma.ReceptorFacturacionWhereInput =
        {};

    if (
        params.origen
    ) {
        where.origen =
            params.origen;
    }

    if (
        params.activo !==
        undefined
    ) {
        where.activo =
            params.activo;
    }

    if (
        params.recibeFacturas !==
        undefined
    ) {
        where.recibeFacturas =
            params.recibeFacturas;
    }

    if (
        params.empresaId !==
        undefined
    ) {
        where.empresaId =
            params.empresaId;
    }

    if (
        params.sinContactos ===
        true
    ) {
        where.contactos = {
            none: {},
        };
    }

    const search =
        params.search
            ?.trim();

    if (
        search
    ) {
        const rutSearch =
            normalizeRut(
                search
            );

        where.OR = [
            {
                razonSocial: {
                    contains:
                        search,

                    mode:
                        "insensitive",
                },
            },

            ...(rutSearch
                ? [
                    {
                        rut: {
                            contains:
                                rutSearch,
                        },
                    },
                ]
                : []),
        ];
    }

    return prisma
        .receptorFacturacion
        .findMany({
            where,

            include: {
                empresa: {
                    select: {
                        id_empresa:
                            true,

                        nombre:
                            true,
                    },
                },

                contactos: {
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
                    recibeFacturas:
                        "desc",
                },

                {
                    razonSocial:
                        "asc",
                },

                {
                    id:
                        "asc",
                },
            ],
        });
}

export async function obtenerReceptorFacturacion(
    id: number
) {
    return prisma
        .receptorFacturacion
        .findUnique({
            where: {
                id,
            },

            include: {
                empresa: {
                    select: {
                        id_empresa:
                            true,

                        nombre:
                            true,
                    },
                },

                contactos: {
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

export async function crearReceptorFacturacion(
    data: {
        rut:
        string;

        razonSocial?:
        string | null;

        activo?:
        boolean;
    }
) {
    const rut =
        normalizeRut(
            data.rut
        );

    if (
        !rut
    ) {
        throw new Error(
            "El RUT es obligatorio"
        );
    }

    /*
     * Validación mínima estructural.
     *
     * El RUT normalizado debe contener
     * cuerpo + dígito verificador.
     */
    if (
        rut.length <
        2
    ) {
        throw new Error(
            "El RUT ingresado no es válido"
        );
    }

    const existente =
        await prisma
            .receptorFacturacion
            .findUnique({
                where: {
                    rut,
                },

                select: {
                    id:
                        true,

                    razonSocial:
                        true,
                },
            });

    if (
        existente
    ) {
        throw new Error(
            "Ya existe un receptor de facturación con este RUT"
        );
    }

    const razonSocial =
        data.razonSocial
            ?.trim() ||
        null;

    return prisma
        .receptorFacturacion
        .create({
            data: {
                rut,

                razonSocial,

                activo:
                    data.activo ??
                    true,

                /*
                 * Un receptor nuevo nunca queda
                 * autorizado automáticamente.
                 *
                 * Primero debe tener al menos un
                 * contacto válido.
                 */
                recibeFacturas:
                    false,

                empresaId:
                    null,

                origen:
                    "MANUAL",
            },

            include: {
                empresa: {
                    select: {
                        id_empresa:
                            true,

                        nombre:
                            true,
                    },
                },

                contactos: {
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

export async function actualizarReceptorFacturacion(
    id: number,

    data: {
        razonSocial?:
        string | null;

        activo?:
        boolean;

        recibeFacturas?:
        boolean;
    }
) {
    const receptor =
        await prisma
            .receptorFacturacion
            .findUnique({
                where: {
                    id,
                },

                include: {
                    contactos: {
                        where: {
                            activo:
                                true,

                            recibeFacturas:
                                true,
                        },

                        select: {
                            id:
                                true,
                        },
                    },
                },
            });

    if (
        !receptor
    ) {
        throw new Error(
            "Receptor de facturación no encontrado"
        );
    }

    /*
     * Si se intenta habilitar el envío de facturas,
     * debe existir al menos un contacto válido.
     */
    if (
        data.recibeFacturas ===
        true &&
        receptor
            .contactos
            .length ===
        0
    ) {
        throw new Error(
            "No se puede habilitar el receptor para recibir facturas porque no tiene contactos activos y habilitados para facturación"
        );
    }

    return prisma
        .receptorFacturacion
        .update({
            where: {
                id,
            },

            data: {
                ...(data.razonSocial !==
                    undefined
                    ? {
                        razonSocial:
                            data.razonSocial,
                    }
                    : {}),

                ...(data.activo !==
                    undefined
                    ? {
                        activo:
                            data.activo,
                    }
                    : {}),

                ...(data.recibeFacturas !==
                    undefined
                    ? {
                        recibeFacturas:
                            data.recibeFacturas,
                    }
                    : {}),
            },
        });
}

export async function crearContactoReceptor(
    receptorId: number,

    data: {
        nombre?:
        string | null;

        email:
        string;

        principal?:
        boolean;

        activo?:
        boolean;

        recibeFacturas?:
        boolean;
    }
) {
    const email =
        normalizeEmail(
            data.email
        );

    if (
        !email
    ) {
        throw new Error(
            "El email es obligatorio"
        );
    }

    const receptor =
        await prisma
            .receptorFacturacion
            .findUnique({
                where: {
                    id:
                        receptorId,
                },

                select: {
                    id:
                        true,
                },
            });

    if (
        !receptor
    ) {
        throw new Error(
            "Receptor de facturación no encontrado"
        );
    }

    return prisma.$transaction(
        async (
            tx
        ) => {
            if (
                data.principal ===
                true
            ) {
                await tx
                    .receptorFacturacionContacto
                    .updateMany({
                        where: {
                            receptorId,

                            principal:
                                true,
                        },

                        data: {
                            principal:
                                false,
                        },
                    });
            }

            return tx
                .receptorFacturacionContacto
                .create({
                    data: {
                        receptorId,

                        nombre:
                            data.nombre ??
                            null,

                        email,

                        principal:
                            data.principal ??
                            false,

                        activo:
                            data.activo ??
                            true,

                        recibeFacturas:
                            data.recibeFacturas ??
                            true,

                        origen:
                            "MANUAL",
                    },
                });
        }
    );
}

export async function actualizarContactoReceptor(
    receptorId: number,
    contactoId: number,

    data: {
        nombre?:
        string | null;

        email?:
        string;

        principal?:
        boolean;

        activo?:
        boolean;

        recibeFacturas?:
        boolean;
    }
) {
    const contacto =
        await prisma
            .receptorFacturacionContacto
            .findFirst({
                where: {
                    id:
                        contactoId,

                    receptorId,
                },
            });

    if (
        !contacto
    ) {
        throw new Error(
            "Contacto no encontrado"
        );
    }

    /*
     * Calculamos cómo quedaría el contacto
     * después del PATCH.
     */
    const activoFinal =
        data.activo ??
        contacto.activo;

    const recibeFacturasFinal =
        data.recibeFacturas ??
        contacto.recibeFacturas;

    /*
     * Si el contacto dejará de ser válido,
     * revisamos si es el último contacto válido
     * de un receptor habilitado.
     */
    if (
        !activoFinal ||
        !recibeFacturasFinal
    ) {
        const receptor =
            await prisma
                .receptorFacturacion
                .findUnique({
                    where: {
                        id:
                            receptorId,
                    },

                    select: {
                        recibeFacturas:
                            true,
                    },
                });

        if (
            receptor
                ?.recibeFacturas
        ) {
            const otrosContactosValidos =
                await prisma
                    .receptorFacturacionContacto
                    .count({
                        where: {
                            receptorId,

                            id: {
                                not:
                                    contactoId,
                            },

                            activo:
                                true,

                            recibeFacturas:
                                true,
                        },
                    });

            if (
                otrosContactosValidos ===
                0
            ) {
                throw new Error(
                    "No se puede deshabilitar este contacto porque es el último contacto válido de un receptor habilitado para recibir facturas"
                );
            }
        }
    }

    const emailNormalizado =
        data.email !==
            undefined
            ? normalizeEmail(
                data.email
            )
            : undefined;

    if (
        data.email !==
        undefined &&
        !emailNormalizado
    ) {
        throw new Error(
            "El email no puede quedar vacío"
        );
    }

    return prisma.$transaction(
        async (
            tx
        ) => {
            if (
                data.principal ===
                true
            ) {
                await tx
                    .receptorFacturacionContacto
                    .updateMany({
                        where: {
                            receptorId,

                            id: {
                                not:
                                    contactoId,
                            },

                            principal:
                                true,
                        },

                        data: {
                            principal:
                                false,
                        },
                    });
            }

            return tx
                .receptorFacturacionContacto
                .update({
                    where: {
                        id:
                            contactoId,
                    },

                    data: {
                        ...(data.nombre !==
                            undefined
                            ? {
                                nombre:
                                    data.nombre,
                            }
                            : {}),

                        ...(emailNormalizado !==
                            undefined
                            ? {
                                email:
                                    emailNormalizado,
                            }
                            : {}),

                        ...(data.principal !==
                            undefined
                            ? {
                                principal:
                                    data.principal,
                            }
                            : {}),

                        ...(data.activo !==
                            undefined
                            ? {
                                activo:
                                    data.activo,
                            }
                            : {}),

                        ...(data.recibeFacturas !==
                            undefined
                            ? {
                                recibeFacturas:
                                    data.recibeFacturas,
                            }
                            : {}),
                    },
                });
        }
    );
}

export async function eliminarContactoReceptor(
    receptorId: number,
    contactoId: number
) {
    const contacto =
        await prisma
            .receptorFacturacionContacto
            .findFirst({
                where: {
                    id:
                        contactoId,

                    receptorId,
                },

                select: {
                    id:
                        true,

                    activo:
                        true,

                    recibeFacturas:
                        true,
                },
            });

    if (
        !contacto
    ) {
        throw new Error(
            "Contacto no encontrado"
        );
    }

    const receptor =
        await prisma
            .receptorFacturacion
            .findUnique({
                where: {
                    id:
                        receptorId,
                },

                select: {
                    recibeFacturas:
                        true,
                },
            });

    /*
     * Solo necesitamos protegerlo cuando:
     *
     * - receptor está habilitado
     * - contacto que se elimina es válido
     */
    if (
        receptor
            ?.recibeFacturas &&
        contacto.activo &&
        contacto.recibeFacturas
    ) {
        const otrosContactosValidos =
            await prisma
                .receptorFacturacionContacto
                .count({
                    where: {
                        receptorId,

                        id: {
                            not:
                                contactoId,
                        },

                        activo:
                            true,

                        recibeFacturas:
                            true,
                    },
                });

        if (
            otrosContactosValidos ===
            0
        ) {
            throw new Error(
                "No se puede eliminar este contacto porque es el último contacto válido de un receptor habilitado para recibir facturas"
            );
        }
    }

    return prisma
        .receptorFacturacionContacto
        .delete({
            where: {
                id:
                    contactoId,
            },
        });
}

export async function eliminarReceptorFacturacion(
    id: number
) {
    const receptor =
        await prisma
            .receptorFacturacion
            .findUnique({
                where: {
                    id,
                },

                include: {
                    contactos: {
                        select: {
                            id:
                                true,
                        },
                    },
                },
            });

    if (
        !receptor
    ) {
        throw new Error(
            "Receptor de facturación no encontrado"
        );
    }

    /*
     * No permitimos eliminar un receptor que todavía
     * tenga contactos asociados.
     */
    if (
        receptor
            .contactos
            .length >
        0
    ) {
        throw new Error(
            "No se puede eliminar el receptor porque todavía tiene contactos asociados. Elimina primero sus contactos o desactiva el receptor."
        );
    }

    /*
     * Revisamos si existen envíos históricos asociados
     * al RUT del receptor.
     *
     * Esto protege la trazabilidad de facturas ya
     * preparadas, enviadas, canceladas o con error.
     */
    const enviosRelacionados =
        await prisma
            .rcvFacturaEnvio
            .count({
                where: {
                    rutContraparte:
                        receptor.rut,
                },
            });

    if (
        enviosRelacionados >
        0
    ) {
        throw new Error(
            "No se puede eliminar el receptor porque existen envíos de facturas asociados a su RUT. Puedes desactivarlo en lugar de eliminarlo."
        );
    }

    return prisma
        .receptorFacturacion
        .delete({
            where: {
                id,
            },
        });
}