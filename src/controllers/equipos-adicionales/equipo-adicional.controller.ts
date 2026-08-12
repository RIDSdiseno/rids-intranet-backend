// src/controllers/equipos-adicionales/equipo-adicional.controller.ts
import type { Request, Response } from "express";
import {
    EstadoEquipoAdicional,
    OrigenEquipoAdicional,
    Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";

/* =========================================================
   SCHEMAS
========================================================= */

const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500).default(20),

    search: z.string().trim().optional(),

    empresaId: z.coerce.number().int().positive().optional(),
    equipoId: z.coerce.number().int().positive().optional(),

    tipo: z.string().trim().optional(),

    origen: z.nativeEnum(OrigenEquipoAdicional).optional(),
    estado: z.nativeEnum(EstadoEquipoAdicional).optional(),

    sortBy: z
        .enum([
            "empresa",
            "id",
            "tipo",
            "descripcion",
            "serialAdicional",
            "cantidad",
            "origen",
            "estado",
            "createdAt",
            "updatedAt",
        ])
        .default("empresa"),

    sortDir: z
        .enum([
            "asc",
            "desc",
        ])
        .default("asc"),
});

const createSchema = z.object({
    equipoId: z.coerce.number().int().positive(),

    tipo: z.string().trim().min(1, "El tipo es obligatorio"),

    descripcion: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable(),

    cantidad: z.coerce
        .number()
        .int()
        .positive()
        .default(1),

    serialAdicional: z
        .string()
        .trim()
        .max(200)
        .optional()
        .nullable(),

    estado: z
        .nativeEnum(EstadoEquipoAdicional)
        .default(EstadoEquipoAdicional.ASIGNADO),
});

const updateSchema = z.object({
    equipoId: z.coerce.number().int().positive().optional(),

    tipo: z.string().trim().min(1).optional(),

    descripcion: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable(),

    cantidad: z.coerce
        .number()
        .int()
        .positive()
        .optional(),

    serialAdicional: z
        .string()
        .trim()
        .max(200)
        .optional()
        .nullable(),

    estado: z
        .nativeEnum(EstadoEquipoAdicional)
        .optional(),
});

/* =========================================================
   HELPERS
========================================================= */

function canManage(user: any) {
    const rol = String(user?.rol ?? "")
        .trim()
        .toUpperCase();

    return [
        "ADMIN",
        "ADMINISTRACION",
        "TECNICO",
        "VENTAS",
    ].includes(rol);
}

function buildEmpresaActivaWhere(): Prisma.EquipoWhereInput {
    return {
        deletedAt: null,

        OR: [
            {
                empresaId: {
                    not: null,
                },
                empresa: {
                    is: {
                        isActive: true,
                    },
                },
            },
            {
                empresaId: null,
                solicitante: {
                    is: {
                        empresa: {
                            is: {
                                isActive: true,
                            },
                        },
                    },
                },
            },
            {
                empresaId: null,
                idSolicitante: null,
            },
        ],
    };
}

async function getEquipoVisible(
    equipoId: number,
    user: any
) {
    const rol = String(
        user?.rol ?? ""
    )
        .trim()
        .toUpperCase();

    const esCliente =
        rol === "CLIENTE";

    const empresaClienteId =
        esCliente
            ? Number(user?.empresaId)
            : null;

    /*
     * Un CLIENTE sin empresa válida
     * nunca puede consultar un equipo.
     */
    if (
        esCliente &&
        (
            !Number.isInteger(
                empresaClienteId
            ) ||
            Number(
                empresaClienteId
            ) <= 0
        )
    ) {
        return null;
    }

    const andConditions:
        Prisma.EquipoWhereInput[] = [
            buildEmpresaActivaWhere(),
        ];

    if (
        esCliente &&
        empresaClienteId
    ) {
        andConditions.push({
            OR: [
                {
                    empresaId:
                        empresaClienteId,
                },
                {
                    empresaId: null,

                    solicitante: {
                        is: {
                            empresaId:
                                empresaClienteId,
                        },
                    },
                },
            ],
        });
    }

    return prisma.equipo.findFirst({
        where: {
            id_equipo:
                equipoId,

            AND:
                andConditions,
        },

        select: {
            id_equipo: true,
            serial: true,
            marca: true,
            modelo: true,
            empresaId: true,
            idSolicitante: true,
        },
    });
}

/* =========================================================
   ORDENAMIENTO LISTADO ADICIONALES
========================================================= */

function normalizeSortText(
    value?: string | null
): string {
    return String(value ?? "")
        .trim()
        .toLocaleLowerCase("es");
}

/* =========================================================
   GET /api/equipos-adicionales
========================================================= */

export async function listEquipoAdicionales(
    req: Request,
    res: Response
) {
    try {
        const q = listQuerySchema.parse(req.query);

        const user = (req as any).user;

        const and: Prisma.EquipoAdicionalWhereInput[] = [];

        /*
         * Nunca mostrar adicionales de equipos eliminados
         * o pertenecientes a empresas inactivas.
         */
        and.push({
            equipo: {
                is: buildEmpresaActivaWhere(),
            },
        });

        const rol = String(
            user?.rol ?? ""
        )
            .trim()
            .toUpperCase();

        const esCliente =
            rol === "CLIENTE";

        if (esCliente) {
            const empresaId =
                Number(user?.empresaId);

            /*
             * Seguridad adicional:
             * un CLIENTE necesariamente
             * debe tener empresa.
             */
            if (
                !Number.isInteger(
                    empresaId
                ) ||
                empresaId <= 0
            ) {
                return res.status(403).json({
                    error:
                        "Usuario cliente sin empresa válida.",
                });
            }

            and.push({
                equipo: {
                    is: {
                        OR: [
                            {
                                empresaId,
                            },
                            {
                                empresaId: null,

                                solicitante: {
                                    is: {
                                        empresaId,
                                    },
                                },
                            },
                        ],
                    },
                },
            });
        } else if (q.empresaId) {
            and.push({
                equipo: {
                    is: {
                        OR: [
                            {
                                empresaId:
                                    q.empresaId,
                            },
                            {
                                empresaId: null,

                                solicitante: {
                                    is: {
                                        empresaId:
                                            q.empresaId,
                                    },
                                },
                            },
                        ],
                    },
                },
            });
        }

        if (q.equipoId) {
            and.push({
                equipoId: q.equipoId,
            });
        }

        if (q.tipo) {
            and.push({
                tipo: {
                    equals: q.tipo,
                    mode: "insensitive",
                },
            });
        }

        if (q.origen) {
            and.push({
                origen: q.origen,
            });
        }

        if (q.estado) {
            and.push({
                estado: q.estado,
            });
        }

        if (q.search) {
            const search = q.search;

            const searchNumber = Number(search);

            and.push({
                OR: [
                    {
                        tipo: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        descripcion: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        serialAdicional: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },

                    /*
                     * Equipo relacionado.
                     */
                    {
                        equipo: {
                            is: {
                                serial: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        equipo: {
                            is: {
                                marca: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        equipo: {
                            is: {
                                modelo: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },

                    /*
                     * Solicitante.
                     */
                    {
                        equipo: {
                            is: {
                                solicitante: {
                                    is: {
                                        nombre: {
                                            contains: search,
                                            mode: "insensitive",
                                        },
                                    },
                                },
                            },
                        },
                    },

                    /*
                     * Empresa directa.
                     */
                    {
                        equipo: {
                            is: {
                                empresa: {
                                    is: {
                                        nombre: {
                                            contains: search,
                                            mode: "insensitive",
                                        },
                                    },
                                },
                            },
                        },
                    },

                    /*
                     * Empresa vía solicitante.
                     */
                    {
                        equipo: {
                            is: {
                                solicitante: {
                                    is: {
                                        empresa: {
                                            is: {
                                                nombre: {
                                                    contains: search,
                                                    mode: "insensitive",
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },

                    ...(Number.isFinite(searchNumber)
                        ? [
                            {
                                id: searchNumber,
                            },
                            {
                                equipoId: searchNumber,
                            },
                        ]
                        : []),
                ],
            });
        }

        const where: Prisma.EquipoAdicionalWhereInput =
            and.length
                ? {
                    AND: and,
                }
                : {};

        /*
  * =========================================================
  * ORDENAMIENTO GLOBAL + PAGINACIÓN
  * =========================================================
  *
  * IMPORTANTE:
  *
  * La empresa efectiva de un equipo puede encontrarse en:
  *
  * 1. Equipo.empresa
  * 2. Equipo.solicitante.empresa
  *
  * Por eso obtenemos primero los registros filtrados,
  * determinamos la empresa efectiva, ordenamos todo el
  * resultado y recién después aplicamos la paginación.
  *
  * De esta forma el orden alfabético se respeta entre
  * todas las páginas y no solamente dentro de la página
  * visible.
  */

        const itemsRaw =
            await prisma.equipoAdicional.findMany({
                where,

                include: {
                    equipo: {
                        select: {
                            id_equipo: true,
                            serial: true,
                            tipo: true,
                            marca: true,
                            modelo: true,
                            estado: true,

                            empresaId: true,

                            empresa: {
                                select: {
                                    id_empresa: true,
                                    nombre: true,
                                    isActive: true,
                                },
                            },

                            solicitante: {
                                select: {
                                    id_solicitante: true,
                                    nombre: true,
                                    email: true,
                                    rut: true,
                                    empresaId: true,

                                    empresa: {
                                        select: {
                                            id_empresa: true,
                                            nombre: true,
                                            isActive: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

        /*
         * Convertimos cada registro al formato que utiliza
         * actualmente el frontend.
         */
        const resultAll =
            itemsRaw.map((item) => {
                const empresa =
                    item.equipo.empresa ??
                    item.equipo.solicitante?.empresa ??
                    null;

                return {
                    ...item,

                    empresa: empresa
                        ? {
                            id:
                                empresa.id_empresa,

                            nombre:
                                empresa.nombre,
                        }
                        : null,

                    solicitante:
                        item.equipo.solicitante
                            ? {
                                id:
                                    item.equipo.solicitante
                                        .id_solicitante,

                                nombre:
                                    item.equipo.solicitante
                                        .nombre,

                                email:
                                    item.equipo.solicitante
                                        .email,

                                rut:
                                    item.equipo.solicitante
                                        .rut,
                            }
                            : null,
                };
            });

        /*
         * =========================================================
         * ORDEN
         * =========================================================
         */

        resultAll.sort((a, b) => {
            /*
             * Orden principal:
             * Empresa A → Z
             */
            if (q.sortBy === "empresa") {
                const empresaA =
                    normalizeSortText(
                        a.empresa?.nombre
                    );

                const empresaB =
                    normalizeSortText(
                        b.empresa?.nombre
                    );

                /*
                 * Equipos sin empresa quedan al final.
                 */
                if (!empresaA && empresaB) {
                    return 1;
                }

                if (empresaA && !empresaB) {
                    return -1;
                }

                const empresaCompare =
                    empresaA.localeCompare(
                        empresaB,
                        "es",
                        {
                            sensitivity: "base",
                        }
                    );

                if (empresaCompare !== 0) {
                    return q.sortDir === "desc"
                        ? -empresaCompare
                        : empresaCompare;
                }

                /*
                 * Segundo criterio:
                 * Solicitante A → Z dentro de la empresa.
                 */
                const solicitanteA =
                    normalizeSortText(
                        a.solicitante?.nombre
                    );

                const solicitanteB =
                    normalizeSortText(
                        b.solicitante?.nombre
                    );

                const solicitanteCompare =
                    solicitanteA.localeCompare(
                        solicitanteB,
                        "es",
                        {
                            sensitivity: "base",
                        }
                    );

                if (solicitanteCompare !== 0) {
                    return solicitanteCompare;
                }

                /*
                 * Tercer criterio:
                 * Equipo menor → mayor.
                 */
                const equipoCompare =
                    a.equipo.id_equipo -
                    b.equipo.id_equipo;

                if (equipoCompare !== 0) {
                    return equipoCompare;
                }

                /*
                 * Último criterio:
                 * ID adicional menor → mayor.
                 */
                return a.id - b.id;
            }

            /*
             * =====================================================
             * OTROS ORDENAMIENTOS
             * =====================================================
             *
             * Se mantienen disponibles los sortBy existentes.
             */

            const direction =
                q.sortDir === "desc"
                    ? -1
                    : 1;

            switch (q.sortBy) {
                case "id":
                    return (
                        (a.id - b.id) *
                        direction
                    );

                case "cantidad":
                    return (
                        (a.cantidad - b.cantidad) *
                        direction
                    );

                case "tipo":
                    return (
                        normalizeSortText(
                            a.tipo
                        ).localeCompare(
                            normalizeSortText(
                                b.tipo
                            ),
                            "es",
                            {
                                sensitivity:
                                    "base",
                            }
                        ) *
                        direction
                    );

                case "descripcion":
                    return (
                        normalizeSortText(
                            a.descripcion
                        ).localeCompare(
                            normalizeSortText(
                                b.descripcion
                            ),
                            "es",
                            {
                                sensitivity:
                                    "base",
                            }
                        ) *
                        direction
                    );

                case "serialAdicional":
                    return (
                        normalizeSortText(
                            a.serialAdicional
                        ).localeCompare(
                            normalizeSortText(
                                b.serialAdicional
                            ),
                            "es",
                            {
                                sensitivity:
                                    "base",
                            }
                        ) *
                        direction
                    );

                case "origen":
                    return (
                        normalizeSortText(
                            a.origen
                        ).localeCompare(
                            normalizeSortText(
                                b.origen
                            ),
                            "es",
                            {
                                sensitivity:
                                    "base",
                            }
                        ) *
                        direction
                    );

                case "estado":
                    return (
                        normalizeSortText(
                            a.estado
                        ).localeCompare(
                            normalizeSortText(
                                b.estado
                            ),
                            "es",
                            {
                                sensitivity:
                                    "base",
                            }
                        ) *
                        direction
                    );

                case "createdAt":
                    return (
                        (
                            new Date(
                                a.createdAt
                            ).getTime() -
                            new Date(
                                b.createdAt
                            ).getTime()
                        ) *
                        direction
                    );

                case "updatedAt":
                    return (
                        (
                            new Date(
                                a.updatedAt
                            ).getTime() -
                            new Date(
                                b.updatedAt
                            ).getTime()
                        ) *
                        direction
                    );

                default:
                    return a.id - b.id;
            }
        });

        /*
         * =========================================================
         * PAGINACIÓN
         * =========================================================
         */

        const total =
            resultAll.length;

        const totalPages =
            Math.max(
                1,
                Math.ceil(
                    total /
                    q.pageSize
                )
            );

        /*
         * Si por una eliminación la página solicitada
         * quedara fuera del rango, usamos la última
         * página disponible.
         */
        const safePage =
            Math.min(
                q.page,
                totalPages
            );

        const skip =
            (safePage - 1) *
            q.pageSize;

        const result =
            resultAll.slice(
                skip,
                skip + q.pageSize
            );

        return res.json({
            page: safePage,

            pageSize:
                q.pageSize,

            total,

            totalPages,

            items:
                result,
        });
    } catch (error) {
        console.error(
            "[listEquipoAdicionales]",
            error
        );

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: "Parámetros inválidos",
                details: error.flatten(),
            });
        }

        return res.status(500).json({
            error:
                "Error al listar adicionales",
        });
    }
}

/* =========================================================
   GET /api/equipos-adicionales/:id
========================================================= */

export async function getEquipoAdicional(
    req: Request,
    res: Response
) {
    try {
        const id = Number(req.params.id);

        if (!Number.isFinite(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        const user = (req as any).user;

        const adicional =
            await prisma.equipoAdicional.findUnique({
                where: {
                    id,
                },

                include: {
                    equipo: {
                        include: {
                            empresa: true,
                            solicitante: {
                                include: {
                                    empresa: true,
                                },
                            },
                        },
                    },
                },
            });

        if (!adicional) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        const equipoVisible =
            await getEquipoVisible(
                adicional.equipoId,
                user
            );

        if (!equipoVisible) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        return res.json({
            item: adicional,
        });
    } catch (error) {
        console.error(
            "[getEquipoAdicional]",
            error
        );

        return res.status(500).json({
            error:
                "Error al obtener periférico",
        });
    }
}

/* =========================================================
   GET /api/equipos-adicionales/equipo/:equipoId
========================================================= */

export async function listAdicionalesByEquipo(
    req: Request,
    res: Response
) {
    try {
        const equipoId =
            Number(req.params.equipoId);

        if (!Number.isFinite(equipoId)) {
            return res.status(400).json({
                error: "ID de equipo inválido",
            });
        }

        const user = (req as any).user;

        const equipo =
            await getEquipoVisible(
                equipoId,
                user
            );

        if (!equipo) {
            return res.status(404).json({
                error: "Equipo no encontrado",
            });
        }

        const items =
            await prisma.equipoAdicional.findMany({
                where: {
                    equipoId,
                },

                orderBy: [
                    {
                        tipo: "asc",
                    },
                    {
                        id: "asc",
                    },
                ],
            });

        return res.json({
            total: items.length,
            items,
        });
    } catch (error) {
        console.error(
            "[listAdicionalesByEquipo]",
            error
        );

        return res.status(500).json({
            error:
                "Error al obtener adicionales del equipo",
        });
    }
}

/* =========================================================
   POST /api/equipos-adicionales
========================================================= */

export async function createEquipoAdicional(
    req: Request,
    res: Response
) {
    try {
        const user = (req as any).user;

        if (!canManage(user)) {
            return res.status(403).json({
                error:
                    "No autorizado para crear adicionales",
            });
        }

        const data =
            createSchema.parse(req.body);

        const equipo =
            await getEquipoVisible(
                data.equipoId,
                user
            );

        if (!equipo) {
            return res.status(404).json({
                error:
                    "El equipo seleccionado no existe o no está disponible",
            });
        }

        /*
         * Si tiene serial, evitamos el mismo serial
         * duplicado dentro del mismo equipo.
         */
        if (data.serialAdicional) {
            const duplicate =
                await prisma.equipoAdicional.findFirst({
                    where: {
                        equipoId:
                            data.equipoId,

                        serialAdicional: {
                            equals:
                                data.serialAdicional,
                            mode: "insensitive",
                        },
                    },
                });

            if (duplicate) {
                return res.status(409).json({
                    code:
                        "SERIAL_ADICIONAL_DUPLICADO",
                    error:
                        "Ya existe un periférico con ese serial asociado al equipo",
                });
            }
        }

        const created =
            await prisma.equipoAdicional.create({
                data: {
                    equipoId:
                        data.equipoId,

                    tipo:
                        data.tipo.toUpperCase(),

                    descripcion:
                        data.descripcion?.trim() ||
                        null,

                    cantidad:
                        data.cantidad,

                    serialAdicional:
                        data.serialAdicional?.trim() ||
                        null,

                    /*
                     * Todo registro creado desde el CRM
                     * es manual.
                     */
                    origen:
                        OrigenEquipoAdicional.MANUAL,

                    estado:
                        data.estado,
                },
            });

        return res.status(201).json({
            ok: true,
            item: created,
        });
    } catch (error) {
        console.error(
            "[createEquipoAdicional]",
            error
        );

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: error.flatten(),
            });
        }

        return res.status(500).json({
            error:
                "Error al crear periférico",
        });
    }
}

/* =========================================================
   PATCH /api/equipos-adicionales/:id
========================================================= */

export async function updateEquipoAdicional(
    req: Request,
    res: Response
) {
    try {
        const user = (req as any).user;

        if (!canManage(user)) {
            return res.status(403).json({
                error:
                    "No autorizado para editar adicionales",
            });
        }

        const id = Number(req.params.id);

        if (!Number.isFinite(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        const data =
            updateSchema.parse(req.body);

        const existing =
            await prisma.equipoAdicional.findUnique({
                where: {
                    id,
                },
            });

        if (!existing) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        /*
         * Comprobar acceso al equipo actual.
         */
        const equipoActual =
            await getEquipoVisible(
                existing.equipoId,
                user
            );

        if (!equipoActual) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        /*
         * Si se reasigna a otro equipo,
         * validar también el destino.
         */
        if (
            data.equipoId &&
            data.equipoId !==
            existing.equipoId
        ) {
            const nuevoEquipo =
                await getEquipoVisible(
                    data.equipoId,
                    user
                );

            if (!nuevoEquipo) {
                return res.status(404).json({
                    error:
                        "El equipo destino no existe o no está disponible",
                });
            }
        }

        const equipoIdFinal =
            data.equipoId ??
            existing.equipoId;

        const serialFinal =
            data.serialAdicional !== undefined
                ? data.serialAdicional?.trim() ||
                null
                : existing.serialAdicional;

        if (serialFinal) {
            const duplicate =
                await prisma.equipoAdicional.findFirst({
                    where: {
                        id: {
                            not: id,
                        },

                        equipoId:
                            equipoIdFinal,

                        serialAdicional: {
                            equals:
                                serialFinal,
                            mode: "insensitive",
                        },
                    },
                });

            if (duplicate) {
                return res.status(409).json({
                    code:
                        "SERIAL_ADICIONAL_DUPLICADO",
                    error:
                        "Ya existe otro periférico con ese serial en el equipo seleccionado",
                });
            }
        }

        const updated =
            await prisma.equipoAdicional.update({
                where: {
                    id,
                },

                data: {
                    ...(data.equipoId !== undefined
                        ? {
                            equipoId:
                                data.equipoId,
                        }
                        : {}),

                    ...(data.tipo !== undefined
                        ? {
                            tipo:
                                data.tipo.toUpperCase(),
                        }
                        : {}),

                    ...(data.descripcion !==
                        undefined
                        ? {
                            descripcion:
                                data.descripcion?.trim() ||
                                null,
                        }
                        : {}),

                    ...(data.cantidad !== undefined
                        ? {
                            cantidad:
                                data.cantidad,
                        }
                        : {}),

                    ...(data.serialAdicional !==
                        undefined
                        ? {
                            serialAdicional:
                                data.serialAdicional?.trim() ||
                                null,
                        }
                        : {}),

                    ...(data.estado !== undefined
                        ? {
                            estado:
                                data.estado,
                        }
                        : {}),

                    /*
                     * IMPORTANTE:
                     *
                     * Si una persona interviene un registro
                     * creado por el agente, desde ese momento
                     * pasa a ser administrado manualmente.
                     */
                    origen:
                        OrigenEquipoAdicional.MANUAL,
                },
            });

        return res.json({
            ok: true,
            item: updated,
        });
    } catch (error) {
        console.error(
            "[updateEquipoAdicional]",
            error
        );

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: error.flatten(),
            });
        }

        return res.status(500).json({
            error:
                "Error al actualizar periférico",
        });
    }
}

/* =========================================================
   DELETE /api/equipos-adicionales/:id
========================================================= */

export async function deleteEquipoAdicional(
    req: Request,
    res: Response
) {
    try {
        const user = (req as any).user;

        if (!canManage(user)) {
            return res.status(403).json({
                error:
                    "No autorizado para eliminar adicionales",
            });
        }

        const id =
            Number(req.params.id);

        if (!Number.isFinite(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        const existing =
            await prisma.equipoAdicional.findUnique({
                where: {
                    id,
                },
            });

        if (!existing) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        const equipo =
            await getEquipoVisible(
                existing.equipoId,
                user
            );

        if (!equipo) {
            return res.status(404).json({
                error:
                    "Periférico no encontrado",
            });
        }

        await prisma.equipoAdicional.delete({
            where: {
                id,
            },
        });

        return res.json({
            ok: true,
        });
    } catch (error) {
        console.error(
            "[deleteEquipoAdicional]",
            error
        );

        return res.status(500).json({
            error:
                "Error al eliminar periférico",
        });
    }
}