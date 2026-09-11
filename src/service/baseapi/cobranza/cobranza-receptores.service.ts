// src/service/baseapi/cobranza/cobranza-receptores.service.ts

import {
    Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../../../lib/prisma.js";

/* =========================================================
   TYPES
========================================================= */

export type ListarReceptoresCobranzaParams = {
    search?: string;
    origen?: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    sinContactos?: boolean;
    empresaId?: number;
};

type CrearReceptorCobranzaInput = {
    rut: string;
    razonSocial?: string | null;
    activo?: boolean;
    recibeCobranza?: boolean;
    diasCredito?: number | null;
    empresaId?: number | null;
    origen?: string;
};

type ActualizarReceptorCobranzaInput = {
    razonSocial?: string | null;
    activo?: boolean;
    recibeCobranza?: boolean;
    diasCredito?: number | null;
    empresaId?: number | null;
    origen?: string;
};

type CrearContactoCobranzaInput = {
    nombre?: string | null;
    email: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    principal?: boolean;
    origen?: string;
};

type ActualizarContactoCobranzaInput = {
    nombre?: string | null;
    email?: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    principal?: boolean;
    origen?: string;
};

/* =========================================================
   HELPERS
========================================================= */

export function normalizarRutCobranza(
    value: string
) {
    return String(
        value ?? ""
    )
        .replace(
            /[^0-9kK]/g,
            ""
        )
        .toUpperCase();
}

function normalizarEmail(
    value: string
) {
    return String(
        value ?? ""
    )
        .trim()
        .toLowerCase();
}

function normalizarTextoOpcional(
    value:
        string |
        null |
        undefined
) {
    if (
        value ===
        undefined
    ) {
        return undefined;
    }

    if (
        value ===
        null
    ) {
        return null;
    }

    const clean =
        value.trim();

    return clean ||
        null;
}

function validarDiasCredito(
    value:
        number |
        null |
        undefined
) {
    if (
        value ===
        undefined ||
        value ===
        null
    ) {
        return;
    }

    if (
        !Number.isInteger(
            value
        ) ||
        value <
        0 ||
        value >
        365
    ) {
        throw new Error(
            "Los días de crédito deben ser un número entero entre 0 y 365"
        );
    }
}

function validarEmail(
    email: string
) {
    const clean =
        normalizarEmail(
            email
        );

    if (
        !clean
    ) {
        throw new Error(
            "El correo es obligatorio"
        );
    }

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            clean
        )
    ) {
        throw new Error(
            "El correo no es válido"
        );
    }

    return clean;
}

async function validarEmpresa(
    empresaId:
        number |
        null |
        undefined
) {
    if (
        empresaId ===
        undefined ||
        empresaId ===
        null
    ) {
        return;
    }

    if (
        !Number.isInteger(
            empresaId
        ) ||
        empresaId <=
        0
    ) {
        throw new Error(
            "La empresa no es válida"
        );
    }

    const empresa =
        await prisma.empresa.findUnique({
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
            "La empresa indicada no existe"
        );
    }
}

/* =========================================================
   INCLUDE COMÚN
========================================================= */

const receptorCobranzaInclude =
    Prisma.validator<Prisma.ReceptorCobranzaInclude>()({
        empresa: {
            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                razonSocial:
                    true,

                isActive:
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
                    nombre:
                        "asc",
                },

                {
                    email:
                        "asc",
                },
            ],
        },
    });

/* =========================================================
   LISTAR
========================================================= */

export async function listarReceptoresCobranza(
    params:
        ListarReceptoresCobranzaParams =
        {}
) {
    const where:
        Prisma.ReceptorCobranzaWhereInput =
        {};

    if (
        params.search?.trim()
    ) {
        const search =
            params.search.trim();

        const rutNormalizado =
            normalizarRutCobranza(
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

            {
                rut: {
                    contains:
                        rutNormalizado ||
                        search,

                    mode:
                        "insensitive",
                },
            },
        ];
    }

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
        params.recibeCobranza !==
        undefined
    ) {
        where.recibeCobranza =
            params.recibeCobranza;
    }

    if (
        params.empresaId !==
        undefined
    ) {
        where.empresaId =
            params.empresaId;
    }

    if (
        params.sinContactos === true
    ) {
        where.contactos = {
            none: {},
        };
    }

    return prisma.receptorCobranza.findMany({
        where,

        include:
            receptorCobranzaInclude,

        orderBy: [
            {
                activo:
                    "desc",
            },

            {
                recibeCobranza:
                    "desc",
            },

            {
                razonSocial:
                    "asc",
            },

            {
                rut:
                    "asc",
            },
        ],
    });
}

/* =========================================================
   OBTENER POR ID
========================================================= */

export async function obtenerReceptorCobranza(
    id: number
) {
    if (
        !Number.isInteger(
            id
        ) ||
        id <=
        0
    ) {
        throw new Error(
            "ID inválido"
        );
    }

    return prisma.receptorCobranza.findUnique({
        where: {
            id,
        },

        include:
            receptorCobranzaInclude,
    });
}

/* =========================================================
   OBTENER POR RUT
========================================================= */

export async function obtenerReceptorCobranzaPorRut(
    rut: string
) {
    const rutNormalizado =
        normalizarRutCobranza(
            rut
        );

    if (
        !rutNormalizado
    ) {
        throw new Error(
            "RUT inválido"
        );
    }

    return prisma.receptorCobranza.findUnique({
        where: {
            rut:
                rutNormalizado,
        },

        include:
            receptorCobranzaInclude,
    });
}

/* =========================================================
   CREAR RECEPTOR
========================================================= */

export async function crearReceptorCobranza(
    input: CrearReceptorCobranzaInput
) {
    const rut =
        normalizarRutCobranza(
            input.rut
        );

    if (!rut) {
        throw new Error(
            "El RUT es obligatorio"
        );
    }

    if (rut.length < 2) {
        throw new Error(
            "El RUT ingresado no es válido"
        );
    }

    validarDiasCredito(
        input.diasCredito
    );

    await validarEmpresa(
        input.empresaId
    );

    const existente =
        await prisma.receptorCobranza.findUnique({
            where: {
                rut,
            },

            select: {
                id: true,
            },
        });

    if (existente) {
        throw new Error(
            "Ya existe un receptor de cobranza con este RUT"
        );
    }

    const createData:
        Prisma.ReceptorCobranzaUncheckedCreateInput =
    {
        rut,

        razonSocial:
            input.razonSocial?.trim() ||
            null,

        activo:
            input.activo ??
            true,

        /*
         * Igual que facturación:
         * nunca habilitar automáticamente
         * un receptor nuevo.
         */
        recibeCobranza:
            false,

        diasCredito:
            input.diasCredito ??
            null,

        empresaId:
            input.empresaId ??
            null,

        origen:
            input.origen?.trim() ||
            "MANUAL",
    };

    return prisma.receptorCobranza.create({
        data:
            createData,

        include:
            receptorCobranzaInclude,
    });
}

/* =========================================================
   ACTUALIZAR RECEPTOR
========================================================= */

export async function actualizarReceptorCobranza(
    id: number,
    input:
        ActualizarReceptorCobranzaInput
) {
    if (
        !Number.isInteger(
            id
        ) ||
        id <=
        0
    ) {
        throw new Error(
            "ID inválido"
        );
    }

    validarDiasCredito(
        input.diasCredito
    );

    await validarEmpresa(
        input.empresaId
    );

    const receptor =
        await prisma.receptorCobranza.findUnique({
            where: {
                id,
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
            "Receptor no encontrado"
        );
    }

    /*
     * Si se intenta activar la cobranza, exigimos al menos
     * un contacto válido y habilitado.
     */
    if (
        input.recibeCobranza ===
        true
    ) {
        const contactosValidos =
            await prisma.receptorCobranzaContacto.count({
                where: {
                    receptorId:
                        id,

                    activo:
                        true,

                    recibeCobranza:
                        true,

                    email: {
                        not:
                            "",
                    },
                },
            });

        if (
            contactosValidos ===
            0
        ) {
            throw new Error(
                "No puedes habilitar la cobranza sin al menos un contacto habilitado"
            );
        }
    }

    const updateData:
        Prisma.ReceptorCobranzaUncheckedUpdateInput =
        {};

    if (
        input.razonSocial !==
        undefined
    ) {
        updateData.razonSocial =
            input.razonSocial ===
                null
                ? null
                : input.razonSocial.trim() ||
                null;
    }

    if (
        input.activo !==
        undefined
    ) {
        updateData.activo =
            input.activo;
    }

    if (
        input.recibeCobranza !==
        undefined
    ) {
        updateData.recibeCobranza =
            input.recibeCobranza;
    }

    if (
        input.diasCredito !==
        undefined
    ) {
        updateData.diasCredito =
            input.diasCredito;
    }

    if (
        input.empresaId !==
        undefined
    ) {
        updateData.empresaId =
            input.empresaId;
    }

    if (
        input.origen !==
        undefined
    ) {
        updateData.origen =
            input.origen.trim() ||
            "MANUAL";
    }

    return prisma.receptorCobranza.update({
        where: {
            id,
        },

        data:
            updateData,

        include:
            receptorCobranzaInclude,
    });
}

/* =========================================================
   CREAR CONTACTO
========================================================= */

export async function crearContactoCobranza(
    receptorId:
        number,
    input:
        CrearContactoCobranzaInput
) {
    const receptor =
        await prisma.receptorCobranza.findUnique({
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
            "Receptor no encontrado"
        );
    }

    const email =
        validarEmail(
            input.email
        );

    const existente =
        await prisma.receptorCobranzaContacto.findUnique({
            where: {
                receptorId_email: {
                    receptorId,
                    email,
                },
            },
        });

    if (
        existente
    ) {
        throw new Error(
            "Este correo ya está registrado para el receptor"
        );
    }

    /*
     * Si el nuevo contacto queda como principal,
     * desmarcamos los demás.
     */
    if (
        input.principal ===
        true
    ) {
        await prisma.receptorCobranzaContacto.updateMany({
            where: {
                receptorId,
            },

            data: {
                principal:
                    false,
            },
        });
    }

    const createData:
        Prisma.ReceptorCobranzaContactoUncheckedCreateInput =
    {
        receptorId,

        nombre:
            input.nombre?.trim() ||
            null,

        email,

        activo:
            input.activo ??
            true,

        recibeCobranza:
            input.recibeCobranza ??
            true,

        principal:
            input.principal ??
            false,

        origen:
            input.origen?.trim() ||
            "MANUAL",
    };

    return prisma.receptorCobranzaContacto.create({
        data:
            createData,
    });
}

/* =========================================================
   ACTUALIZAR CONTACTO
========================================================= */

export async function actualizarContactoCobranza(
    receptorId: number,
    contactoId: number,
    input: ActualizarContactoCobranzaInput
) {
    const contacto =
        await prisma.receptorCobranzaContacto.findFirst({
            where: {
                id:
                    contactoId,

                receptorId,
            },
        });

    if (!contacto) {
        throw new Error(
            "Contacto no encontrado"
        );
    }

    /*
     * Estado que tendrá el contacto
     * después del PATCH.
     */
    const activoFinal =
        input.activo ??
        contacto.activo;

    const recibeCobranzaFinal =
        input.recibeCobranza ??
        contacto.recibeCobranza;

    /*
     * Protegemos el último contacto válido.
     */
    if (
        !activoFinal ||
        !recibeCobranzaFinal
    ) {
        const receptor =
            await prisma.receptorCobranza.findUnique({
                where: {
                    id:
                        receptorId,
                },

                select: {
                    recibeCobranza:
                        true,
                },
            });

        if (
            receptor?.recibeCobranza
        ) {
            const otrosContactosValidos =
                await prisma.receptorCobranzaContacto.count({
                    where: {
                        receptorId,

                        id: {
                            not:
                                contactoId,
                        },

                        activo:
                            true,

                        recibeCobranza:
                            true,
                    },
                });

            if (
                otrosContactosValidos ===
                0
            ) {
                throw new Error(
                    "No se puede deshabilitar este contacto porque es el último contacto válido de un receptor habilitado para cobranza"
                );
            }
        }
    }

    let email:
        string |
        undefined;

    if (
        input.email !==
        undefined
    ) {
        email =
            validarEmail(
                input.email
            );

        const duplicado =
            await prisma.receptorCobranzaContacto.findFirst({
                where: {
                    receptorId,

                    email,

                    id: {
                        not:
                            contactoId,
                    },
                },

                select: {
                    id:
                        true,
                },
            });

        if (duplicado) {
            throw new Error(
                "Este correo ya está registrado para el receptor"
            );
        }
    }

    const updateData:
        Prisma.ReceptorCobranzaContactoUncheckedUpdateInput =
        {};

    if (
        input.nombre !==
        undefined
    ) {
        updateData.nombre =
            input.nombre ===
                null
                ? null
                : input.nombre.trim() ||
                null;
    }

    if (
        email !==
        undefined
    ) {
        updateData.email =
            email;
    }

    if (
        input.activo !==
        undefined
    ) {
        updateData.activo =
            input.activo;
    }

    if (
        input.recibeCobranza !==
        undefined
    ) {
        updateData.recibeCobranza =
            input.recibeCobranza;
    }

    if (
        input.principal !==
        undefined
    ) {
        updateData.principal =
            input.principal;
    }

    if (
        input.origen !==
        undefined
    ) {
        updateData.origen =
            input.origen.trim() ||
            "MANUAL";
    }

    return prisma.$transaction(
        async (
            tx
        ) => {
            if (
                input.principal ===
                true
            ) {
                await tx
                    .receptorCobranzaContacto
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
                .receptorCobranzaContacto
                .update({
                    where: {
                        id:
                            contactoId,
                    },

                    data:
                        updateData,
                });
        }
    );
}
/* =========================================================
   ELIMINAR CONTACTO
========================================================= */

export async function eliminarContactoCobranza(
    receptorId: number,
    contactoId: number
) {
    const contacto =
        await prisma.receptorCobranzaContacto.findFirst({
            where: {
                id: contactoId,
                receptorId,
            },

            select: {
                id: true,
                activo: true,
                recibeCobranza: true,
            },
        });

    if (!contacto) {
        throw new Error(
            "Contacto no encontrado"
        );
    }

    const receptor =
        await prisma.receptorCobranza.findUnique({
            where: {
                id: receptorId,
            },

            select: {
                recibeCobranza: true,
            },
        });

    if (
        receptor?.recibeCobranza &&
        contacto.activo &&
        contacto.recibeCobranza
    ) {
        const otrosContactosValidos =
            await prisma.receptorCobranzaContacto.count({
                where: {
                    receptorId,

                    id: {
                        not: contactoId,
                    },

                    activo: true,
                    recibeCobranza: true,
                },
            });

        if (
            otrosContactosValidos === 0
        ) {
            throw new Error(
                "No se puede eliminar este contacto porque es el último contacto válido de un receptor habilitado para cobranza"
            );
        }
    }

    return prisma.receptorCobranzaContacto.delete({
        where: {
            id: contactoId,
        },
    });
}

/* =========================================================
   ELIMINAR RECEPTOR
========================================================= */

export async function eliminarReceptorCobranza(
    id: number
) {
    const receptor =
        await prisma.receptorCobranza.findUnique({
            where: {
                id,
            },

            include: {
                contactos: {
                    select: {
                        id: true,
                    },
                },
            },
        });

    if (!receptor) {
        throw new Error(
            "Receptor de cobranza no encontrado"
        );
    }

    /*
     * No permitimos eliminar mientras
     * tenga contactos asociados.
     */
    if (
        receptor.contactos.length > 0
    ) {
        throw new Error(
            "No se puede eliminar el receptor porque todavía tiene contactos asociados. Elimina primero sus contactos o desactiva el receptor."
        );
    }

    /*
     * Protegemos el historial de cobranza.
     */
    const enviosRelacionados =
        await prisma.rcvRecordatorioEnvio.count({
            where: {
                rutContraparte:
                    receptor.rut,
            },
        });

    if (
        enviosRelacionados > 0
    ) {
        throw new Error(
            "No se puede eliminar el receptor porque existen recordatorios de cobranza asociados a su RUT. Puedes desactivarlo en lugar de eliminarlo."
        );
    }

    return prisma.receptorCobranza.delete({
        where: {
            id,
        },
    });
}

/* =========================================================
   COPIAR CONTACTOS DESDE FACTURACIÓN
========================================================= */

export async function copiarContactosFacturacionACobranza(
    receptorCobranzaId:
        number
) {
    const receptorCobranza =
        await prisma.receptorCobranza.findUnique({
            where: {
                id:
                    receptorCobranzaId,
            },

            select: {
                id:
                    true,

                rut:
                    true,
            },
        });

    if (
        !receptorCobranza
    ) {
        throw new Error(
            "Receptor de cobranza no encontrado"
        );
    }

    const receptorFacturacion =
        await prisma.receptorFacturacion.findUnique({
            where: {
                rut:
                    receptorCobranza.rut,
            },

            include: {
                contactos: true,
            },
        });

    if (
        !receptorFacturacion
    ) {
        throw new Error(
            "No existe un receptor de facturación para este RUT"
        );
    }

    const contactosFacturacion =
        receptorFacturacion.contactos.filter(
            (contacto) =>
                contacto.activo &&
                contacto.recibeFacturas &&
                Boolean(
                    contacto.email?.trim()
                )
        );

    if (
        contactosFacturacion.length ===
        0
    ) {
        throw new Error(
            "El receptor de facturación no tiene contactos habilitados"
        );
    }

    let creados =
        0;

    let actualizados =
        0;

    for (
        const contacto
        of contactosFacturacion
    ) {
        const email =
            normalizarEmail(
                contacto.email
            );

        const existente =
            await prisma.receptorCobranzaContacto.findUnique({
                where: {
                    receptorId_email: {
                        receptorId:
                            receptorCobranza.id,

                        email,
                    },
                },

                select: {
                    id:
                        true,
                },
            });

        if (
            existente
        ) {
            await prisma.receptorCobranzaContacto.update({
                where: {
                    id:
                        existente.id,
                },

                data: {
                    nombre:
                        contacto.nombre,

                    activo:
                        true,

                    recibeCobranza:
                        true,

                    principal:
                        contacto.principal,

                    origen:
                        "FACTURACION",
                },
            });

            actualizados++;
        } else {
            await prisma.receptorCobranzaContacto.create({
                data: {
                    receptorId:
                        receptorCobranza.id,

                    nombre:
                        contacto.nombre,

                    email,

                    activo:
                        true,

                    recibeCobranza:
                        true,

                    principal:
                        contacto.principal,

                    origen:
                        "FACTURACION",
                },
            });

            creados++;
        }
    }

    return {
        creados,
        actualizados,
        total:
            contactosFacturacion.length,

        receptor:
            await obtenerReceptorCobranza(
                receptorCobranza.id
            ),
    };
}