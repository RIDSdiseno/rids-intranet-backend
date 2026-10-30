// src/service/empresas/empresa-entidad.service.ts

import {
    prisma,
} from "../../lib/prisma.js";


/* =====================================================
   NORMALIZADORES
===================================================== */

export function normalizarRutRelacion(
    value:
        string |
        null |
        undefined
): string {

    return String(
        value ?? ""
    )
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();
}


function normalizarNombreRelacion(
    value:
        string |
        null |
        undefined
): string {

    return String(
        value ?? ""
    )
        .trim()
        .replace(/\s+/g, " ")
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toUpperCase();
}


/* =====================================================
   OBTENER ESTADO ACTUAL
===================================================== */

export async function obtenerRelacionEmpresaEntidades(
    empresaId:
        number
) {

    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                isActive:
                    true,

                detalleEmpresa: {
                    select: {
                        rut:
                            true,

                        direccion:
                            true,

                        email:
                            true,

                        telefono:
                            true,
                    },
                },

                entidadGestioos: {
                    select: {
                        id:
                            true,

                        nombre:
                            true,

                        rut:
                            true,

                        correo:
                            true,

                        telefono:
                            true,

                        direccion:
                            true,

                        tipo:
                            true,

                        origen:
                            true,

                        empresaId:
                            true,
                    },

                    orderBy: {
                        nombre:
                            "asc",
                    },
                },
            },
        });


    if (
        !empresa
    ) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }


    const rutEmpresa =
        normalizarRutRelacion(
            empresa
                .detalleEmpresa
                ?.rut
        );


    const nombreEmpresa =
        normalizarNombreRelacion(
            empresa.nombre
        );


    /*
     * Solo buscamos entidades EMPRESA
     * que todavía no tengan empresa asociada.
     */
    const candidatas =
        await prisma.entidadGestioo.findMany({
            where: {
                tipo:
                    "EMPRESA",

                empresaId:
                    null,
            },

            select: {
                id:
                    true,

                nombre:
                    true,

                rut:
                    true,

                correo:
                    true,

                telefono:
                    true,

                direccion:
                    true,

                tipo:
                    true,

                origen:
                    true,

                empresaId:
                    true,
            },

            orderBy: {
                nombre:
                    "asc",
            },
        });


    const sugerencias =
        candidatas
            .map(
                (
                    entidad
                ) => {

                    const rutEntidad =
                        normalizarRutRelacion(
                            entidad.rut
                        );


                    const nombreEntidad =
                        normalizarNombreRelacion(
                            entidad.nombre
                        );


                    const coincideRut =
                        Boolean(
                            rutEmpresa
                        ) &&
                        Boolean(
                            rutEntidad
                        ) &&
                        rutEmpresa ===
                        rutEntidad;


                    const coincideNombre =
                        Boolean(
                            nombreEmpresa
                        ) &&
                        nombreEmpresa ===
                        nombreEntidad;


                    if (
                        !coincideRut &&
                        !coincideNombre
                    ) {
                        return null;
                    }


                    return {
                        ...entidad,

                        coincidencia:
                            coincideRut
                                ? "RUT_EXACTO"
                                : "NOMBRE_EXACTO",

                        vinculacionAutomaticaDisponible:
                            coincideRut,
                    };
                }
            )
            .filter(
                (
                    item
                ): item is NonNullable<
                    typeof item
                > =>
                    item !== null
            )
            .sort(
                (
                    a,
                    b
                ) => {

                    if (
                        a.coincidencia ===
                        "RUT_EXACTO" &&
                        b.coincidencia !==
                        "RUT_EXACTO"
                    ) {
                        return -1;
                    }


                    if (
                        b.coincidencia ===
                        "RUT_EXACTO" &&
                        a.coincidencia !==
                        "RUT_EXACTO"
                    ) {
                        return 1;
                    }


                    return a.nombre.localeCompare(
                        b.nombre,
                        "es"
                    );
                }
            );


    return {
        empresa,
        entidadesRelacionadas:
            empresa.entidadGestioos,

        sugerencias,
    };
}


/* =====================================================
   BUSCAR ENTIDADES DISPONIBLES
===================================================== */

export async function buscarEntidadesDisponibles(
    empresaId:
        number,

    search:
        string
) {

    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
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


    const texto =
        search
            .trim();


    return prisma.entidadGestioo.findMany({
        where: {
            tipo:
                "EMPRESA",

            /*
             * Puede mostrarse:
             * - sin empresa
             * - ya vinculada a esta misma empresa
             *
             * Nunca una entidad vinculada a otra empresa.
             */
            OR: [
                {
                    empresaId:
                        null,
                },

                {
                    empresaId:
                        empresaId,
                },
            ],

            ...(texto
                ? {
                    AND: [
                        {
                            OR: [
                                {
                                    nombre: {
                                        contains:
                                            texto,

                                        mode:
                                            "insensitive",
                                    },
                                },

                                {
                                    rut: {
                                        contains:
                                            texto,

                                        mode:
                                            "insensitive",
                                    },
                                },

                                {
                                    correo: {
                                        contains:
                                            texto,

                                        mode:
                                            "insensitive",
                                    },
                                },
                            ],
                        },
                    ],
                }
                : {}),
        },

        select: {
            id:
                true,

            nombre:
                true,

            rut:
                true,

            correo:
                true,

            telefono:
                true,

            direccion:
                true,

            origen:
                true,

            empresaId:
                true,
        },

        orderBy: {
            nombre:
                "asc",
        },

        take:
            50,
    });
}


/* =====================================================
   VINCULACIÓN MANUAL
===================================================== */

export async function vincularEntidadEmpresaManual(
    empresaId:
        number,

    entidadId:
        number
) {

    const [
        empresa,
        entidad,
    ] =
        await Promise.all([
            prisma.empresa.findUnique({
                where: {
                    id_empresa:
                        empresaId,
                },

                select: {
                    id_empresa:
                        true,

                    nombre:
                        true,
                },
            }),

            prisma.entidadGestioo.findUnique({
                where: {
                    id:
                        entidadId,
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    rut:
                        true,

                    tipo:
                        true,

                    empresaId:
                        true,
                },
            }),
        ]);


    if (
        !empresa
    ) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }


    if (
        !entidad
    ) {
        throw new Error(
            "ENTIDAD_NO_ENCONTRADA"
        );
    }


    if (
        entidad.tipo !==
        "EMPRESA"
    ) {
        throw new Error(
            "ENTIDAD_NO_ES_EMPRESA"
        );
    }


    /*
     * Si ya está vinculada a otra empresa,
     * nunca reasignar silenciosamente.
     */
    if (
        entidad.empresaId !==
        null &&
        entidad.empresaId !==
        empresaId
    ) {
        throw new Error(
            "ENTIDAD_VINCULADA_OTRA_EMPRESA"
        );
    }


    if (
        entidad.empresaId ===
        empresaId
    ) {
        return prisma.entidadGestioo.findUnique({
            where: {
                id:
                    entidadId,
            },
        });
    }


    return prisma.entidadGestioo.update({
        where: {
            id:
                entidadId,
        },

        data: {
            empresaId,
        },
    });
}


/* =====================================================
   DESVINCULAR
===================================================== */

export async function desvincularEntidadEmpresa(
    empresaId:
        number,

    entidadId:
        number
) {

    const entidad =
        await prisma.entidadGestioo.findFirst({
            where: {
                id:
                    entidadId,

                empresaId:
                    empresaId,
            },
        });


    if (
        !entidad
    ) {
        throw new Error(
            "RELACION_NO_ENCONTRADA"
        );
    }


    return prisma.entidadGestioo.update({
        where: {
            id:
                entidadId,
        },

        data: {
            empresaId:
                null,
        },
    });
}


/* =====================================================
   AUTOMÁTICO DESDE EMPRESA

   SOLO RUT EXACTO.
===================================================== */

export async function intentarVincularEmpresaAutomaticamente(
    empresaId:
        number
) {

    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                isActive:
                    true,

                detalleEmpresa: {
                    select: {
                        rut:
                            true,
                    },
                },

                entidadGestioos: {
                    select: {
                        id:
                            true,

                        rut:
                            true,

                        nombre:
                            true,
                    },
                },
            },
        });


    if (
        !empresa
    ) {
        return {
            vinculada:
                false,

            motivo:
                "EMPRESA_NO_ENCONTRADA",
        };
    }

    if (
        !empresa.isActive
    ) {
        return {
            vinculada:
                false,

            motivo:
                "EMPRESA_INACTIVA",
        };
    }


    const rutEmpresa =
        normalizarRutRelacion(
            empresa
                .detalleEmpresa
                ?.rut
        );


    if (
        !rutEmpresa
    ) {
        return {
            vinculada:
                false,

            motivo:
                "EMPRESA_SIN_RUT",
        };
    }


    /*
     * Primero comprobar si ya existe
     * una entidad relacionada con ese RUT.
     */
    const yaRelacionada =
        empresa
            .entidadGestioos
            .find(
                (
                    entidad
                ) =>
                    normalizarRutRelacion(
                        entidad.rut
                    ) ===
                    rutEmpresa
            );


    if (
        yaRelacionada
    ) {
        return {
            vinculada:
                true,

            yaExistia:
                true,

            motivo:
                "YA_VINCULADA",

            entidad:
                yaRelacionada,
        };
    }


    const entidadesSinEmpresa =
        await prisma.entidadGestioo.findMany({
            where: {
                tipo:
                    "EMPRESA",

                empresaId:
                    null,

                rut: {
                    not:
                        null,
                },
            },

            select: {
                id:
                    true,

                nombre:
                    true,

                rut:
                    true,
            },
        });


    const coincidencias =
        entidadesSinEmpresa.filter(
            (
                entidad
            ) =>
                normalizarRutRelacion(
                    entidad.rut
                ) ===
                rutEmpresa
        );


    if (
        coincidencias.length ===
        0
    ) {
        return {
            vinculada:
                false,

            motivo:
                "SIN_COINCIDENCIA_RUT",
        };
    }


    /*
     * Por seguridad nunca elegimos
     * automáticamente entre múltiples
     * resultados normalizados.
     */
    if (
        coincidencias.length >
        1
    ) {
        return {
            vinculada:
                false,

            motivo:
                "MULTIPLES_COINCIDENCIAS",

            coincidencias,
        };
    }

    const coincidencia =
        coincidencias[0];


    if (
        !coincidencia
    ) {
        return {
            vinculada:
                false,

            motivo:
                "SIN_COINCIDENCIA_RUT",
        };
    }


    const entidad =
        await prisma.entidadGestioo.update({
            where: {
                id:
                    coincidencia.id,
            },

            data: {
                empresaId:
                    empresaId,
            },
        });


    return {
        vinculada:
            true,

        yaExistia:
            false,

        motivo:
            "RUT_EXACTO",

        entidad,
    };
}


/* =====================================================
   AUTOMÁTICO DESDE ENTIDAD

   Se ejecuta al crear/editar una EntidadGestioo.
===================================================== */

export async function intentarVincularEntidadAutomaticamente(
    entidadId:
        number
) {

    const entidad =
        await prisma.entidadGestioo.findUnique({
            where: {
                id:
                    entidadId,
            },

            select: {
                id:
                    true,

                nombre:
                    true,

                rut:
                    true,

                tipo:
                    true,

                empresaId:
                    true,
            },
        });


    if (
        !entidad
    ) {
        return {
            vinculada:
                false,

            motivo:
                "ENTIDAD_NO_ENCONTRADA",
        };
    }


    if (
        entidad.tipo !==
        "EMPRESA"
    ) {
        return {
            vinculada:
                false,

            motivo:
                "ENTIDAD_NO_ES_EMPRESA",
        };
    }


    if (
        entidad.empresaId
    ) {
        return {
            vinculada:
                true,

            yaExistia:
                true,

            motivo:
                "YA_VINCULADA",

            entidad,
        };
    }


    const rutEntidad =
        normalizarRutRelacion(
            entidad.rut
        );


    if (
        !rutEntidad
    ) {
        return {
            vinculada:
                false,

            motivo:
                "ENTIDAD_SIN_RUT",
        };
    }


    const detalles =
        await prisma.detalleEmpresa.findMany({
            where: {
                empresa: {
                    is: {
                        isActive:
                            true,
                    },
                },
            },

            select: {
                empresa_id:
                    true,

                rut:
                    true,

                empresa: {
                    select: {
                        id_empresa:
                            true,

                        nombre:
                            true,

                        isActive:
                            true,
                    },
                },
            },
        });


    const coincidencias =
        detalles.filter(
            (
                detalle
            ) =>
                normalizarRutRelacion(
                    detalle.rut
                ) ===
                rutEntidad
        );


    if (
        coincidencias.length !==
        1
    ) {
        return {
            vinculada:
                false,

            motivo:
                coincidencias.length > 1
                    ? "MULTIPLES_COINCIDENCIAS"
                    : "SIN_COINCIDENCIA_RUT",
        };
    }


    const coincidencia =
        coincidencias[0];


    if (
        !coincidencia
    ) {
        return {
            vinculada:
                false,

            motivo:
                "SIN_COINCIDENCIA_RUT",
        };
    }


    const empresaId =
        coincidencia
            .empresa_id;


    const actualizada =
        await prisma.entidadGestioo.update({
            where: {
                id:
                    entidadId,
            },

            data: {
                empresaId,
            },
        });


    return {
        vinculada:
            true,

        yaExistia:
            false,

        motivo:
            "RUT_EXACTO",

        entidad:
            actualizada,

        empresa:
            coincidencia
                .empresa,
    };
}