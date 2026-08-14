// src/controllers/equipos-adicionales/equipo-adicional.controller.ts

import type {
    Request,
    Response,
} from "express";

import XLSX from "xlsx-js-style";

import {
    EstadoEquipoAdicional,
    OrigenEquipoAdicional,
    Prisma,
} from "@prisma/client";

import { z } from "zod";

import {
    prisma,
} from "../../lib/prisma.js";

/* =========================================================
   SCHEMAS
========================================================= */

const listQuerySchema =
    z.object({
        page:
            z.coerce
                .number()
                .int()
                .positive()
                .default(1),

        pageSize:
            z.coerce
                .number()
                .int()
                .positive()
                .max(500)
                .default(20),

        search:
            z.string()
                .trim()
                .optional(),

        empresaId:
            z.coerce
                .number()
                .int()
                .positive()
                .optional(),

        equipoId:
            z.coerce
                .number()
                .int()
                .positive()
                .optional(),

        tipo:
            z.string()
                .trim()
                .optional(),

        minCantidadPorEquipo:
            z.coerce
                .number()
                .int()
                .min(2)
                .max(100)
                .optional(),

        origen:
            z.nativeEnum(
                OrigenEquipoAdicional
            )
                .optional(),

        estado:
            z.nativeEnum(
                EstadoEquipoAdicional
            )
                .optional(),

        sortBy:
            z.enum([
                "empresa",
                "id",
                "nombre",
                "tipo",
                "marca",
                "modelo",
                "descripcion",
                "serialAdicional",
                "macAddress",
                "ipAddress",
                "hostname",
                "ubicacion",
                "cantidad",
                "origen",
                "estado",
                "createdAt",
                "updatedAt",
            ])
                .default(
                    "empresa"
                ),

        sortDir:
            z.enum([
                "asc",
                "desc",
            ])
                .default(
                    "asc"
                ),
    });

const exportQuerySchema =
    listQuerySchema.omit({
        page: true,
        pageSize: true,
    });

/* =========================================================
   CREAR
========================================================= */

const createSchema =
    z.object({
        nombre:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        tipo:
            z.string()
                .trim()
                .min(
                    1,
                    "El tipo es obligatorio"
                ),

        marca:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        modelo:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        serialAdicional:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        macAddress:
            z.string()
                .trim()
                .max(100)
                .optional()
                .nullable(),

        ipAddress:
            z.string()
                .trim()
                .max(100)
                .optional()
                .nullable(),

        hostname:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        ubicacion:
            z.string()
                .trim()
                .max(300)
                .optional()
                .nullable(),

        descripcion:
            z.string()
                .trim()
                .max(1000)
                .optional()
                .nullable(),

        cantidad:
            z.coerce
                .number()
                .int()
                .positive()
                .default(1),

        estado:
            z.nativeEnum(
                EstadoEquipoAdicional
            )
                .default(
                    EstadoEquipoAdicional.ASIGNADO
                ),

        /*
         * Un adicional puede tener:
         *
         * - 0 equipos
         * - 1 equipo
         * - varios equipos
         */
        equipoIds:
            z.array(
                z.coerce
                    .number()
                    .int()
                    .positive()
            )
                .default([]),
    });

/* =========================================================
   ACTUALIZAR
========================================================= */

const updateSchema =
    z.object({
        nombre:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        tipo:
            z.string()
                .trim()
                .min(1)
                .optional(),

        marca:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        modelo:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        serialAdicional:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        macAddress:
            z.string()
                .trim()
                .max(100)
                .optional()
                .nullable(),

        ipAddress:
            z.string()
                .trim()
                .max(100)
                .optional()
                .nullable(),

        hostname:
            z.string()
                .trim()
                .max(200)
                .optional()
                .nullable(),

        ubicacion:
            z.string()
                .trim()
                .max(300)
                .optional()
                .nullable(),

        descripcion:
            z.string()
                .trim()
                .max(1000)
                .optional()
                .nullable(),

        cantidad:
            z.coerce
                .number()
                .int()
                .positive()
                .optional(),

        estado:
            z.nativeEnum(
                EstadoEquipoAdicional
            )
                .optional(),

        /*
         * IMPORTANTE:
         *
         * undefined:
         * mantener relaciones actuales.
         *
         * []:
         * quitar todas las relaciones.
         *
         * [1,2,3]&#58;          * reemplazar por esos equipos.
         */
        equipoIds:
            z.array(
                z.coerce
                    .number()
                    .int()
                    .positive()
            )
                .optional(),
    });

/* =========================================================
   HELPERS — PERMISOS
========================================================= */

function canManage(
    user: any
): boolean {

    const rol =
        String(
            user?.rol ??
            ""
        )
            .trim()
            .toUpperCase();

    return [
        "ADMIN",
        "ADMINISTRACION",
        "TECNICO",
        "VENTAS",
    ].includes(
        rol
    );
}

/* =========================================================
   HELPERS — EQUIPOS VISIBLES
========================================================= */

function buildEmpresaActivaWhere():
    Prisma.EquipoWhereInput {

    return {
        deletedAt:
            null,

        OR: [
            /*
             * Equipo relacionado
             * directamente a empresa.
             */
            {
                empresaId: {
                    not:
                        null,
                },

                empresa: {
                    is: {
                        isActive:
                            true,
                    },
                },
            },

            /*
             * Equipo sin empresa directa,
             * pero asociado a solicitante.
             */
            {
                empresaId:
                    null,

                solicitante: {
                    is: {
                        empresa: {
                            is: {
                                isActive:
                                    true,
                            },
                        },
                    },
                },
            },

            /*
             * Equipo todavía sin
             * empresa ni solicitante.
             */
            {
                empresaId:
                    null,

                idSolicitante:
                    null,
            },
        ],
    };
}

/* =========================================================
   WHERE DE EQUIPO SEGÚN USUARIO / EMPRESA
========================================================= */

function buildEquipoVisibleWhere(
    user: any,
    empresaFiltroId?: number | null
):
    Prisma.EquipoWhereInput {

    const rol =
        String(
            user?.rol ??
            ""
        )
            .trim()
            .toUpperCase();

    const esCliente =
        rol ===
        "CLIENTE";

    const empresaClienteIdRaw =
        esCliente
            ? Number(
                user?.empresaId
            )
            : null;

    const empresaClienteId =
        typeof empresaClienteIdRaw === "number" &&
            Number.isInteger(
                empresaClienteIdRaw
            ) &&
            empresaClienteIdRaw > 0
            ? empresaClienteIdRaw
            : null;

    const and:
        Prisma.EquipoWhereInput[] =
        [
            buildEmpresaActivaWhere(),
        ];

    /*
     * CLIENTE:
     * solamente puede acceder a
     * equipos de su empresa.
     */
    if (
        esCliente &&
        empresaClienteId !== null
    ) {
        and.push({
            OR: [
                {
                    empresaId:
                        empresaClienteId,
                },

                {
                    empresaId:
                        null,

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

    /*
     * Usuario interno aplicando
     * filtro explícito de empresa.
     */
    if (
        !esCliente &&
        empresaFiltroId &&
        Number.isInteger(
            empresaFiltroId
        ) &&
        empresaFiltroId > 0
    ) {
        and.push({
            OR: [
                {
                    empresaId:
                        empresaFiltroId,
                },

                {
                    empresaId:
                        null,

                    solicitante: {
                        is: {
                            empresaId:
                                empresaFiltroId,
                        },
                    },
                },
            ],
        });
    }

    return {
        AND:
            and,
    };
}

/* =========================================================
   OBTENER EQUIPO VISIBLE
========================================================= */

async function getEquipoVisible(
    equipoId: number,
    user: any
) {

    const rol =
        String(
            user?.rol ??
            ""
        )
            .trim()
            .toUpperCase();

    const esCliente =
        rol ===
        "CLIENTE";

    if (esCliente) {
        const empresaId =
            Number(
                user?.empresaId
            );

        if (
            !Number.isInteger(
                empresaId
            ) ||
            empresaId <=
            0
        ) {
            return null;
        }
    }

    return prisma.equipo.findFirst({
        where: {
            id_equipo:
                equipoId,

            AND: [
                buildEquipoVisibleWhere(
                    user
                ),
            ],
        },

        select: {
            id_equipo:
                true,

            serial:
                true,

            marca:
                true,

            modelo:
                true,

            empresaId:
                true,

            idSolicitante:
                true,
        },
    });
}

/* =========================================================
   VALIDAR VARIOS EQUIPOS
========================================================= */

async function validarEquiposVisibles(
    equipoIds: number[],
    user: any
): Promise<boolean> {

    const ids =
        Array.from(
            new Set(
                equipoIds
            )
        );

    for (
        const equipoId
        of ids
    ) {
        const equipo =
            await getEquipoVisible(
                equipoId,
                user
            );

        if (!equipo) {
            return false;
        }
    }

    return true;
}

/* =========================================================
   NORMALIZAR SERIAL
========================================================= */

function normalizarSerialAdicional(
    value?: string | null
): string | null {

    const serial =
        String(
            value ??
            ""
        )
            .trim()
            .toUpperCase();

    if (!serial) {
        return null;
    }

    return serial;
}

/* =========================================================
   NORMALIZAR MAC
========================================================= */

function normalizarMac(
    value?: string | null
): string | null {

    const raw =
        String(
            value ??
            ""
        )
            .trim()
            .toUpperCase();

    if (!raw) {
        return null;
    }

    const hex =
        raw.replace(
            /[^0-9A-F]/g,
            ""
        );

    /*
     * Si no parece una MAC
     * estándar, mantenemos lo
     * ingresado para no perder
     * información.
     */
    if (
        hex.length !==
        12
    ) {
        return raw;
    }

    return (
        hex
            .match(
                /.{2}/g
            )
            ?.join(
                ":"
            ) ??
        raw
    );
}

/* =========================================================
   EXCEL — HELPERS
========================================================= */

function formatEstadoAdicionalExcel(
    estado?: string | null
): string {

    switch (
    String(
        estado ?? ""
    ).toUpperCase()
    ) {

        case "ASIGNADO":
            return "Asignado";

        case "EN_STOCK":
            return "En stock";

        case "EN_REPARACION":
            return "En reparación";

        case "DADO_DE_BAJA":
            return "Dado de baja";

        default:
            return (
                estado ??
                ""
            );
    }
}

function formatOrigenAdicionalExcel(
    origen?: string | null
): string {

    return (
        String(
            origen ?? ""
        ).toUpperCase() ===
            "AGENTE"
            ? "Agente"
            : "Manual"
    );
}

function formatFechaExcel(
    value?: Date | string | null
): string {

    if (!value) {
        return "";
    }

    const date =
        value instanceof Date
            ? value
            : new Date(
                value
            );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    return new Intl.DateTimeFormat(
        "es-CL",
        {
            timeZone:
                "America/Santiago",

            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit",

            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false,
        }
    ).format(
        date
    );
}

function formatEmpresasExcel(
    item: any
): string {

    return (
        item.empresas ??
        []
    )
        .map(
            (
                empresa: any
            ) =>
                String(
                    empresa.nombre ??
                    ""
                ).trim()
        )
        .filter(
            Boolean
        )
        .join(
            "\n"
        );
}

function formatSolicitantesExcel(
    item: any
): string {

    return (
        item.solicitantes ??
        []
    )
        .map(
            (
                solicitante: any
            ) => {

                const nombre =
                    String(
                        solicitante.nombre ??
                        ""
                    ).trim();

                const email =
                    String(
                        solicitante.email ??
                        ""
                    ).trim();

                return [
                    nombre,
                    email
                        ? `<${email}>`
                        : null,
                ]
                    .filter(
                        Boolean
                    )
                    .join(
                        " "
                    );
            }
        )
        .filter(
            Boolean
        )
        .join(
            "\n"
        );
}

function formatEquiposExcel(
    item: any
): string {

    return (
        item.equipos ??
        []
    )
        .map(
            (
                relacion: any
            ) => {

                const equipo =
                    relacion.equipo;

                if (!equipo) {
                    return "";
                }

                const partes = [
                    `#${equipo.id_equipo}`,

                    equipo.serial
                        ? `Serial: ${equipo.serial}`
                        : null,

                    equipo.marca ||
                        equipo.modelo
                        ? [
                            equipo.marca,
                            equipo.modelo,
                        ]
                            .filter(
                                Boolean
                            )
                            .join(
                                " "
                            )
                        : null,
                ];

                return partes
                    .filter(
                        Boolean
                    )
                    .join(
                        " | "
                    );
            }
        )
        .filter(
            Boolean
        )
        .join(
            "\n"
        );
}

function styleAdicionalesSheet(
    ws: XLSX.WorkSheet,
    rows: number,
    cols: number
) {

    /* ===============================
       HEADER
    =============================== */

    for (
        let c = 0;
        c < cols;
        c++
    ) {

        const cell =
            ws[
            XLSX.utils.encode_cell({
                r: 0,
                c,
            })
            ];

        if (!cell) {
            continue;
        }

        cell.s = {
            fill: {
                fgColor: {
                    rgb:
                        "FF0891B2",
                },
            },

            font: {
                bold:
                    true,

                color: {
                    rgb:
                        "FFFFFFFF",
                },
            },

            alignment: {
                horizontal:
                    "center",

                vertical:
                    "center",

                wrapText:
                    true,
            },
        };
    }

    /* ===============================
       CUERPO
    =============================== */

    for (
        let r = 1;
        r <= rows;
        r++
    ) {

        for (
            let c = 0;
            c < cols;
            c++
        ) {

            const cell =
                ws[
                XLSX.utils.encode_cell({
                    r,
                    c,
                })
                ];

            if (!cell) {
                continue;
            }

            cell.s = {
                alignment: {
                    vertical:
                        "top",

                    wrapText:
                        true,
                },
            };
        }
    }

    /* ===============================
       AUTOFILTRO
    =============================== */

    ws["!autofilter"] = {
        ref:
            XLSX.utils.encode_range({
                s: {
                    r: 0,
                    c: 0,
                },

                e: {
                    r: rows,
                    c:
                        cols -
                        1,
                },
            }),
    };

    /* ===============================
       ANCHOS
    =============================== */

    ws["!cols"] = [
        { wch: 10 }, // A - CÓDIGO
        { wch: 8 },  // B - ID
        { wch: 28 }, // C - NOMBRE
        { wch: 18 }, // D - TIPO
        { wch: 18 }, // E - MARCA
        { wch: 24 }, // F - MODELO
        { wch: 32 }, // G - SERIAL
        { wch: 12 }, // H - CANTIDAD
        { wch: 18 }, // I - ESTADO
        { wch: 14 }, // J - ORIGEN
        { wch: 30 }, // K - EMPRESAS
        { wch: 32 }, // L - SOLICITANTES
        { wch: 48 }, // M - EQUIPOS ASOCIADOS
        { wch: 22 }, // N - MAC
        { wch: 18 }, // O - IP
        { wch: 24 }, // P - HOSTNAME
        { wch: 28 }, // Q - UBICACIÓN
        { wch: 50 }, // R - DESCRIPCIÓN
        { wch: 20 }, // S - FECHA CREACIÓN
        { wch: 20 }, // T - ÚLTIMA ACTUALIZACIÓN
    ];
}

/* =========================================================
   NORMALIZAR TEXTO PARA ORDEN
========================================================= */

function normalizeSortText(
    value?: string | null
): string {

    return String(
        value ??
        ""
    )
        .trim()
        .toLocaleLowerCase(
            "es"
        );
}

/* =========================================================
   FORMATEAR RESPUESTA ADICIONAL
========================================================= */

function formatAdicionalResponse(
    item: any
) {

    const empresasMap =
        new Map<
            number,
            {
                id: number;
                nombre: string;
            }
        >();

    const solicitantesMap =
        new Map<
            number,
            {
                id: number;
                nombre: string;
                email: string | null;
                rut: string | null;
            }
        >();

    for (
        const relacion
        of item.equipos ??
        []
    ) {
        const equipo =
            relacion.equipo;

        if (!equipo) {
            continue;
        }

        const empresa =
            equipo.empresa ??
            equipo.solicitante
                ?.empresa ??
            null;

        if (empresa) {
            empresasMap.set(
                empresa.id_empresa,
                {
                    id:
                        empresa.id_empresa,

                    nombre:
                        empresa.nombre,
                }
            );
        }

        if (
            equipo.solicitante
        ) {
            solicitantesMap.set(
                equipo.solicitante
                    .id_solicitante,

                {
                    id:
                        equipo.solicitante
                            .id_solicitante,

                    nombre:
                        equipo.solicitante
                            .nombre,

                    email:
                        equipo.solicitante
                            .email ??
                        null,

                    rut:
                        equipo.solicitante
                            .rut ??
                        null,
                }
            );
        }
    }

    const empresas =
        Array.from(
            empresasMap.values()
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.nombre.localeCompare(
                        b.nombre,
                        "es",
                        {
                            sensitivity:
                                "base",
                        }
                    )
            );

    const solicitantes =
        Array.from(
            solicitantesMap.values()
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.nombre.localeCompare(
                        b.nombre,
                        "es",
                        {
                            sensitivity:
                                "base",
                        }
                    )
            );

    return {
        ...item,

        empresas,

        solicitantes,

        totalEquipos:
            Array.isArray(
                item.equipos
            )
                ? item.equipos.length
                : 0,
    };
}

type AdicionalesFilterQuery =
    z.infer<
        typeof exportQuerySchema
    >;

/* =========================================================
   SELECT EQUIPO RELACIONADO
========================================================= */

const equipoRelacionSelect = {
    id_equipo:
        true,

    serial:
        true,

    tipo:
        true,

    marca:
        true,

    modelo:
        true,

    estado:
        true,

    empresaId:
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

    solicitante: {
        select: {
            id_solicitante:
                true,

            nombre:
                true,

            email:
                true,

            rut:
                true,

            empresaId:
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
    },
} satisfies Prisma.EquipoSelect;

async function getAdicionalesFiltrados(
    q: AdicionalesFilterQuery,
    user: any
) {

    // =====================================================
    // Toda la lógica actual:
    //
    // - permisos cliente
    // - empresa
    // - equipo
    // - tipo
    // - origen
    // - estado
    // - minCantidadPorEquipo
    // - search
    // - prisma.adicional.findMany
    // - formatAdicionalResponse
    // - ordenamiento
    // =====================================================

    const esCliente =
        String(
            user?.rol ?? ""
        ).toUpperCase() ===
        "CLIENTE";


    const and:
        Prisma.AdicionalWhereInput[] =
        [];


    /* =====================================================
       FILTRO CLIENTE
    ===================================================== */

    if (esCliente) {
        and.push({
            equipos: {
                some: {
                    equipo: {
                        is:
                            buildEquipoVisibleWhere(
                                user
                            ),
                    },
                },
            },
        });
    }

    /* =====================================================
       FILTRO EMPRESA
    ===================================================== */

    if (
        !esCliente &&
        q.empresaId
    ) {
        and.push({
            equipos: {
                some: {
                    equipo: {
                        is:
                            buildEquipoVisibleWhere(
                                user,
                                q.empresaId
                            ),
                    },
                },
            },
        });
    }

    /* =====================================================
       FILTRO EQUIPO
    ===================================================== */

    if (q.equipoId) {
        and.push({
            equipos: {
                some: {
                    equipoId:
                        q.equipoId,

                    equipo: {
                        is:
                            buildEquipoVisibleWhere(
                                user
                            ),
                    },
                },
            },
        });
    }

    /* =====================================================
       FILTRO TIPO
    ===================================================== */

    if (q.tipo) {
        and.push({
            tipo: {
                equals:
                    q.tipo,

                mode:
                    "insensitive",
            },
        });
    }

    /* =====================================================
       FILTRO ORIGEN
    ===================================================== */

    if (q.origen) {
        and.push({
            origen:
                q.origen,
        });
    }

    /* =====================================================
       FILTRO ESTADO
    ===================================================== */

    if (q.estado) {
        and.push({
            estado:
                q.estado,
        });
    }

    /* =====================================================
FILTRO CANTIDAD DEL MISMO TIPO POR EQUIPO
===================================================== */

    let equiposConCantidad:
        number[] |
        null =
        null;

    if (
        q.tipo &&
        q.minCantidadPorEquipo
    ) {
        /*
         * Solo contamos relaciones pertenecientes
         * a equipos que este usuario puede ver.
         *
         * Si existe filtro de empresa, también
         * queda considerado aquí.
         */
        const equipoVisibleCantidad =
            buildEquipoVisibleWhere(
                user,
                !esCliente
                    ? q.empresaId
                    : undefined
            );

        const relaciones =
            await prisma.adicionalEquipo.findMany({
                where: {
                    equipo: {
                        is:
                            equipoVisibleCantidad,
                    },

                    adicional: {
                        is: {
                            tipo: {
                                equals:
                                    q.tipo,

                                mode:
                                    "insensitive",
                            },
                        },
                    },
                },

                select: {
                    equipoId:
                        true,
                },
            });

        const conteoPorEquipo =
            new Map<
                number,
                number
            >();

        for (
            const relacion
            of relaciones
        ) {
            conteoPorEquipo.set(
                relacion.equipoId,

                (
                    conteoPorEquipo.get(
                        relacion.equipoId
                    ) ??
                    0
                ) + 1
            );
        }

        equiposConCantidad =
            Array.from(
                conteoPorEquipo.entries()
            )
                .filter(
                    ([
                        ,
                        cantidad,
                    ]) =>
                        cantidad >=
                        q.minCantidadPorEquipo!
                )
                .map(
                    ([
                        equipoId,
                    ]) =>
                        equipoId
                );
    }

    /* =====================================================
APLICAR FILTRO DE CANTIDAD POR EQUIPO
===================================================== */

    if (
        equiposConCantidad !==
        null
    ) {
        and.push({
            equipos: {
                some: {
                    equipoId: {
                        in:
                            equiposConCantidad,
                    },

                    equipo: {
                        is:
                            buildEquipoVisibleWhere(
                                user,
                                !esCliente
                                    ? q.empresaId
                                    : undefined
                            ),
                    },
                },
            },
        });
    }

    /* =====================================================
       BÚSQUEDA GENERAL
    ===================================================== */

    if (q.search) {

        const search =
            q.search;

        const searchNumber =
            Number(
                search
            );

        const equipoVisibleSearch =
            buildEquipoVisibleWhere(
                user
            );

        and.push({
            OR: [
                {
                    nombre: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    tipo: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    marca: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    modelo: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    descripcion: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    serialAdicional: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    macAddress: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    ipAddress: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    hostname: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                {
                    ubicacion: {
                        contains:
                            search,

                        mode:
                            "insensitive",
                    },
                },

                /* =========================================
                   EQUIPO — SERIAL
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            serial: {
                                                contains:
                                                    search,

                                                mode:
                                                    "insensitive",
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   EQUIPO — MARCA
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            marca: {
                                                contains:
                                                    search,

                                                mode:
                                                    "insensitive",
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   EQUIPO — MODELO
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            modelo: {
                                                contains:
                                                    search,

                                                mode:
                                                    "insensitive",
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   SOLICITANTE
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            solicitante: {
                                                is: {
                                                    nombre: {
                                                        contains:
                                                            search,

                                                        mode:
                                                            "insensitive",
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   EMPRESA DIRECTA
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            empresa: {
                                                is: {
                                                    nombre: {
                                                        contains:
                                                            search,

                                                        mode:
                                                            "insensitive",
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   EMPRESA VÍA SOLICITANTE
                ========================================= */

                {
                    equipos: {
                        some: {
                            equipo: {
                                is: {
                                    AND: [
                                        equipoVisibleSearch,

                                        {
                                            solicitante: {
                                                is: {
                                                    empresa: {
                                                        is: {
                                                            nombre: {
                                                                contains:
                                                                    search,

                                                                mode:
                                                                    "insensitive",
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },

                /* =========================================
                   BÚSQUEDA NUMÉRICA
                ========================================= */

                ...(
                    Number.isFinite(
                        searchNumber
                    )
                        ? [
                            {
                                id:
                                    searchNumber,
                            },

                            {
                                equipos: {
                                    some: {
                                        equipoId:
                                            searchNumber,

                                        equipo: {
                                            is:
                                                equipoVisibleSearch,
                                        },
                                    },
                                },
                            },
                        ]
                        : []
                ),
            ],
        });
    }

    const where:
        Prisma.AdicionalWhereInput =
        and.length >
            0
            ? {
                AND:
                    and,
            }
            : {};

    /* =====================================================
       RELACIONES QUE PUEDE VER EL USUARIO
    ===================================================== */

    const relacionesWhere:
        Prisma.AdicionalEquipoWhereInput =
    {
        equipo: {
            is:
                buildEquipoVisibleWhere(
                    user,

                    !esCliente
                        ? q.empresaId
                        : undefined
                ),
        },
    };

    /* =====================================================
       CONSULTA
    ===================================================== */

    const itemsRaw =
        await prisma.adicional.findMany({
            where,

            include: {
                equipos: {
                    where:
                        relacionesWhere,

                    include: {
                        equipo: {
                            select:
                                equipoRelacionSelect,
                        },
                    },

                    orderBy: [
                        {
                            equipoId:
                                "asc",
                        },
                        {
                            id:
                                "asc",
                        },
                    ],
                },
            },
        });

    /* =====================================================
       NORMALIZAR RESPUESTA
    ===================================================== */

    const resultAll =
        itemsRaw.map(
            (
                item
            ) =>
                formatAdicionalResponse(
                    item
                )
        );

    /* =====================================================
       ORDEN GLOBAL
    ===================================================== */

    resultAll.sort(
        (
            a,
            b
        ) => {

            const direction =
                q.sortDir ===
                    "desc"
                    ? -1
                    : 1;

            /*
             * EMPRESA.
             *
             * Si un adicional tiene
             * múltiples empresas,
             * utilizamos la primera
             * alfabéticamente.
             */
            if (
                q.sortBy ===
                "empresa"
            ) {
                const empresaA =
                    normalizeSortText(
                        a.empresas?.[0]
                            ?.nombre
                    );

                const empresaB =
                    normalizeSortText(
                        b.empresas?.[0]
                            ?.nombre
                    );

                /*
                 * Sin empresa al final.
                 */
                if (
                    !empresaA &&
                    empresaB
                ) {
                    return 1;
                }

                if (
                    empresaA &&
                    !empresaB
                ) {
                    return -1;
                }

                const empresaCompare =
                    empresaA.localeCompare(
                        empresaB,
                        "es",
                        {
                            sensitivity:
                                "base",
                        }
                    );

                if (
                    empresaCompare !==
                    0
                ) {
                    return (
                        empresaCompare *
                        direction
                    );
                }

                /*
                 * Segundo criterio:
                 * primer solicitante.
                 */
                const solicitanteA =
                    normalizeSortText(
                        a.solicitantes?.[0]
                            ?.nombre
                    );

                const solicitanteB =
                    normalizeSortText(
                        b.solicitantes?.[0]
                            ?.nombre
                    );

                const solicitanteCompare =
                    solicitanteA.localeCompare(
                        solicitanteB,
                        "es",
                        {
                            sensitivity:
                                "base",
                        }
                    );

                if (
                    solicitanteCompare !==
                    0
                ) {
                    return (
                        solicitanteCompare
                    );
                }

                return (
                    a.id -
                    b.id
                );
            }

            switch (
            q.sortBy
            ) {

                case "id":
                    return (
                        (
                            a.id -
                            b.id
                        ) *
                        direction
                    );

                case "cantidad":
                    return (
                        (
                            a.cantidad -
                            b.cantidad
                        ) *
                        direction
                    );

                case "nombre":
                case "tipo":
                case "marca":
                case "modelo":
                case "descripcion":
                case "serialAdicional":
                case "macAddress":
                case "ipAddress":
                case "hostname":
                case "ubicacion":
                case "origen":
                case "estado": {

                    const field =
                        q.sortBy;

                    return (
                        normalizeSortText(
                            a[field]
                        )
                            .localeCompare(
                                normalizeSortText(
                                    b[field]
                                ),
                                "es",
                                {
                                    sensitivity:
                                        "base",
                                }
                            ) *
                        direction
                    );
                }

                case "createdAt":
                    return (
                        (
                            new Date(
                                a.createdAt
                            )
                                .getTime() -
                            new Date(
                                b.createdAt
                            )
                                .getTime()
                        ) *
                        direction
                    );

                case "updatedAt":
                    return (
                        (
                            new Date(
                                a.updatedAt
                            )
                                .getTime() -
                            new Date(
                                b.updatedAt
                            )
                                .getTime()
                        ) *
                        direction
                    );

                default:
                    return (
                        a.id -
                        b.id
                    );
            }
        }
    );

    return resultAll;
}

/* =========================================================
   GET /api/equipos-adicionales
========================================================= */

export async function listEquipoAdicionales(
    req: Request,
    res: Response
) {

    try {

        const q =
            listQuerySchema.parse(
                req.query
            );

        const user =
            (req as any).user;

        const resultAll =
            await getAdicionalesFiltrados(
                q,
                user
            );

        /* =====================================================
           PAGINACIÓN
        ===================================================== */

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

        const safePage =
            Math.min(
                q.page,
                totalPages
            );

        const skip =
            (
                safePage -
                1
            ) *
            q.pageSize;

        const result =
            resultAll.slice(
                skip,
                skip +
                q.pageSize
            );

        return res.json({
            page:
                safePage,

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

        if (
            error instanceof
            z.ZodError
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Parámetros inválidos",

                    details:
                        error.flatten(),
                });
        }

        return res
            .status(500)
            .json({
                error:
                    "Error al listar adicionales",
            });
    }
}

/* =========================================================
   GET /api/equipos-adicionales/export
========================================================= */

export async function exportEquipoAdicionales(
    req: Request,
    res: Response
) {

    try {

        const q =
            exportQuerySchema.parse(
                req.query
            );

        const user =
            (req as any).user;

        const items =
            await getAdicionalesFiltrados(
                q,
                user
            );

        if (
            items.length ===
            0
        ) {
            return res
                .status(404)
                .json({
                    error:
                        "No existen adicionales para los filtros seleccionados.",
                });
        }

        /* =====================================================
           FILAS
        ===================================================== */

        const rows =
            items.map(
                (
                    item,
                    index
                ) => ({
                    "N°":
                        index + 1,

                    "ID":
                        item.id,

                    "NOMBRE":
                        item.nombre ??
                        "",

                    "TIPO":
                        item.tipo ??
                        "",

                    "MARCA":
                        item.marca ??
                        "",

                    "MODELO":
                        item.modelo ??
                        "",

                    "SERIAL":
                        item.serialAdicional ??
                        "",

                    "CANTIDAD":
                        item.cantidad ??
                        1,

                    "ESTADO":
                        formatEstadoAdicionalExcel(
                            item.estado
                        ),

                    "ORIGEN":
                        formatOrigenAdicionalExcel(
                            item.origen
                        ),

                    "EMPRESAS":
                        formatEmpresasExcel(
                            item
                        ),

                    "SOLICITANTES":
                        formatSolicitantesExcel(
                            item
                        ),

                    "EQUIPOS ASOCIADOS":
                        formatEquiposExcel(
                            item
                        ),

                    "MAC":
                        item.macAddress ??
                        "",

                    "IP":
                        item.ipAddress ??
                        "",

                    "HOSTNAME":
                        item.hostname ??
                        "",

                    "UBICACIÓN":
                        item.ubicacion ??
                        "",

                    "DESCRIPCIÓN":
                        item.descripcion ??
                        "",

                    "FECHA CREACIÓN":
                        formatFechaExcel(
                            item.createdAt
                        ),

                    "ÚLTIMA ACTUALIZACIÓN":
                        formatFechaExcel(
                            item.updatedAt
                        ),
                })
            );

        const headers = [
            "N°",
            "ID",
            "NOMBRE",
            "TIPO",
            "MARCA",
            "MODELO",
            "SERIAL",
            "CANTIDAD",
            "ESTADO",
            "ORIGEN",
            "EMPRESAS",
            "SOLICITANTES",
            "EQUIPOS ASOCIADOS",
            "MAC",
            "IP",
            "HOSTNAME",
            "UBICACIÓN",
            "DESCRIPCIÓN",
            "FECHA CREACIÓN",
            "ÚLTIMA ACTUALIZACIÓN",
        ];

        /* =====================================================
           WORKBOOK
        ===================================================== */

        const workbook =
            XLSX.utils.book_new();

        const worksheet =
            XLSX.utils.json_to_sheet(
                rows,
                {
                    header:
                        headers,
                }
            );

        styleAdicionalesSheet(
            worksheet,
            rows.length,
            headers.length
        );

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Adicionales"
        );

        const buffer =
            XLSX.write(
                workbook,
                {
                    type:
                        "buffer",

                    bookType:
                        "xlsx",
                }
            );

        /* =====================================================
           ARCHIVO
        ===================================================== */

        const today =
            new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                        "America/Santiago",

                    year:
                        "numeric",

                    month:
                        "2-digit",

                    day:
                        "2-digit",
                }
            ).format(
                new Date()
            );

        const empresaSuffix =
            q.empresaId
                ? `_EMPRESA_${q.empresaId}`
                : "";

        const fileName =
            `Adicionales${empresaSuffix}_${today}.xlsx`;

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(
                fileName
            )}"`
        );

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return res.send(
            buffer
        );

    } catch (error) {

        console.error(
            "[exportEquipoAdicionales]",
            error
        );

        if (
            error instanceof
            z.ZodError
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Parámetros inválidos",

                    details:
                        error.flatten(),
                });
        }

        return res
            .status(500)
            .json({
                error:
                    "Error exportando adicionales",
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
            Number(
                req.params
                    .equipoId
            );

        if (
            !Number.isInteger(
                equipoId
            ) ||
            equipoId <=
            0
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID de equipo inválido",
            });
        }

        const user =
            (req as any).user;

        const equipo =
            await getEquipoVisible(
                equipoId,
                user
            );

        if (!equipo) {
            return res.status(
                404
            ).json({
                error:
                    "Equipo no encontrado",
            });
        }

        const itemsRaw =
            await prisma.adicional.findMany({
                where: {
                    equipos: {
                        some: {
                            equipoId,
                        },
                    },
                },

                include: {
                    equipos: {
                        where: {
                            equipo: {
                                is:
                                    buildEquipoVisibleWhere(
                                        user
                                    ),
                            },
                        },

                        include: {
                            equipo: {
                                select:
                                    equipoRelacionSelect,
                            },
                        },

                        orderBy: [
                            {
                                equipoId:
                                    "asc",
                            },
                        ],
                    },
                },

                orderBy: [
                    {
                        tipo:
                            "asc",
                    },
                    {
                        id:
                            "asc",
                    },
                ],
            });

        const items =
            itemsRaw.map(
                (
                    item
                ) =>
                    formatAdicionalResponse(
                        item
                    )
            );

        return res.json({
            total:
                items.length,

            items,
        });

    } catch (
    error
    ) {

        console.error(
            "[listAdicionalesByEquipo]",
            error
        );

        return res.status(
            500
        ).json({
            error:
                "Error al obtener adicionales del equipo",
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
        const id =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                id
            ) ||
            id <=
            0
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID inválido",
            });
        }

        const user =
            (req as any).user;

        const rol =
            String(
                user?.rol ??
                ""
            )
                .trim()
                .toUpperCase();

        const esCliente =
            rol ===
            "CLIENTE";

        const adicional =
            await prisma.adicional.findUnique({
                where: {
                    id,
                },

                include: {
                    equipos: {
                        where: {
                            equipo: {
                                is:
                                    buildEquipoVisibleWhere(
                                        user
                                    ),
                            },
                        },

                        include: {
                            equipo: {
                                select:
                                    equipoRelacionSelect,
                            },
                        },

                        orderBy: [
                            {
                                equipoId:
                                    "asc",
                            },
                        ],
                    },
                },
            });

        if (!adicional) {
            return res.status(
                404
            ).json({
                error:
                    "Adicional no encontrado",
            });
        }

        /*
         * CLIENTE:
         *
         * Si no tiene ninguna relación
         * visible con sus equipos,
         * no puede consultar el adicional.
         */
        if (
            esCliente &&
            adicional.equipos.length ===
            0
        ) {
            return res.status(
                404
            ).json({
                error:
                    "Adicional no encontrado",
            });
        }

        return res.json({
            item:
                formatAdicionalResponse(
                    adicional
                ),
        });

    } catch (
    error
    ) {

        console.error(
            "[getEquipoAdicional]",
            error
        );

        return res.status(
            500
        ).json({
            error:
                "Error al obtener adicional",
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
        const user =
            (req as any).user;

        if (
            !canManage(
                user
            )
        ) {
            return res.status(
                403
            ).json({
                error:
                    "No autorizado para crear adicionales",
            });
        }

        const data =
            createSchema.parse(
                req.body
            );

        const equipoIds =
            Array.from(
                new Set(
                    data.equipoIds
                )
            );

        /* =====================================================
           VALIDAR EQUIPOS
        ===================================================== */

        if (
            equipoIds.length >
            0
        ) {
            const validos =
                await validarEquiposVisibles(
                    equipoIds,
                    user
                );

            if (!validos) {
                return res.status(
                    404
                ).json({
                    error:
                        "Uno o más equipos seleccionados no existen o no están disponibles",
                });
            }
        }

        /* =====================================================
           SERIAL
        ===================================================== */

        const serialNormalizado =
            normalizarSerialAdicional(
                data.serialAdicional
            );

        if (
            serialNormalizado
        ) {
            const duplicate =
                await prisma.adicional.findUnique({
                    where: {
                        serialAdicional:
                            serialNormalizado,
                    },

                    select: {
                        id:
                            true,

                        tipo:
                            true,

                        origen:
                            true,
                    },
                });

            if (
                duplicate
            ) {
                return res.status(
                    409
                ).json({
                    code:
                        "SERIAL_ADICIONAL_DUPLICADO",

                    error:
                        `Ya existe un adicional con el serial ${serialNormalizado}.`,
                });
            }
        }

        /* =====================================================
           TRANSACCIÓN
        ===================================================== */

        const createdId =
            await prisma.$transaction(
                async (
                    tx
                ) => {

                    const adicional =
                        await tx.adicional.create({
                            data: {
                                nombre:
                                    data.nombre?.trim() ||
                                    null,

                                tipo:
                                    data.tipo
                                        .trim()
                                        .toUpperCase(),

                                marca:
                                    data.marca?.trim() ||
                                    null,

                                modelo:
                                    data.modelo?.trim() ||
                                    null,

                                serialAdicional:
                                    serialNormalizado,

                                macAddress:
                                    normalizarMac(
                                        data.macAddress
                                    ),

                                ipAddress:
                                    data.ipAddress?.trim() ||
                                    null,

                                hostname:
                                    data.hostname?.trim() ||
                                    null,

                                ubicacion:
                                    data.ubicacion?.trim() ||
                                    null,

                                descripcion:
                                    data.descripcion?.trim() ||
                                    null,

                                cantidad:
                                    data.cantidad,

                                estado:
                                    data.estado,

                                origen:
                                    OrigenEquipoAdicional.MANUAL,
                            },
                        });

                    if (
                        equipoIds.length >
                        0
                    ) {
                        await tx.adicionalEquipo.createMany({
                            data:
                                equipoIds.map(
                                    (
                                        equipoId
                                    ) => ({
                                        adicionalId:
                                            adicional.id,

                                        equipoId,

                                        origen:
                                            OrigenEquipoAdicional.MANUAL,
                                    })
                                ),

                            skipDuplicates:
                                true,
                        });
                    }

                    return adicional.id;
                }
            );

        /* =====================================================
           DEVOLVER OBJETO COMPLETO
        ===================================================== */

        const created =
            await prisma.adicional.findUnique({
                where: {
                    id:
                        createdId,
                },

                include: {
                    equipos: {
                        include: {
                            equipo: {
                                select:
                                    equipoRelacionSelect,
                            },
                        },
                    },
                },
            });

        return res.status(
            201
        ).json({
            ok:
                true,

            item:
                created
                    ? formatAdicionalResponse(
                        created
                    )
                    : null,
        });

    } catch (
    error
    ) {

        console.error(
            "[createEquipoAdicional]",
            error
        );

        if (
            error instanceof
            z.ZodError
        ) {
            return res.status(
                400
            ).json({
                error:
                    "Datos inválidos",

                details:
                    error.flatten(),
            });
        }

        /*
         * Protección final UNIQUE.
         */
        if (
            error instanceof
            Prisma.PrismaClientKnownRequestError &&
            error.code ===
            "P2002"
        ) {
            return res.status(
                409
            ).json({
                code:
                    "SERIAL_ADICIONAL_DUPLICADO",

                error:
                    "Ya existe un adicional registrado con ese serial.",
            });
        }

        return res.status(
            500
        ).json({
            error:
                "Error al crear adicional",
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
        const user =
            (req as any).user;

        if (
            !canManage(
                user
            )
        ) {
            return res.status(
                403
            ).json({
                error:
                    "No autorizado para editar adicionales",
            });
        }

        const id =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                id
            ) ||
            id <=
            0
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID inválido",
            });
        }

        const data =
            updateSchema.parse(
                req.body
            );

        const existing =
            await prisma.adicional.findUnique({
                where: {
                    id,
                },

                include: {
                    equipos:
                        true,
                },
            });

        if (!existing) {
            return res.status(
                404
            ).json({
                error:
                    "Adicional no encontrado",
            });
        }

        /* =====================================================
           EQUIPOS
        ===================================================== */

        const equipoIds =
            data.equipoIds !==
                undefined
                ? Array.from(
                    new Set(
                        data.equipoIds
                    )
                )
                : null;

        if (
            equipoIds !==
            null &&
            equipoIds.length >
            0
        ) {
            const validos =
                await validarEquiposVisibles(
                    equipoIds,
                    user
                );

            if (!validos) {
                return res.status(
                    404
                ).json({
                    error:
                        "Uno o más equipos seleccionados no existen o no están disponibles",
                });
            }
        }

        /* =====================================================
           SERIAL
        ===================================================== */

        const serialFinal =
            data.serialAdicional !==
                undefined
                ? normalizarSerialAdicional(
                    data.serialAdicional
                )
                : normalizarSerialAdicional(
                    existing.serialAdicional
                );

        if (
            serialFinal
        ) {
            const duplicate =
                await prisma.adicional.findFirst({
                    where: {
                        id: {
                            not:
                                id,
                        },

                        serialAdicional:
                            serialFinal,
                    },

                    select: {
                        id:
                            true,
                    },
                });

            if (
                duplicate
            ) {
                return res.status(
                    409
                ).json({
                    code:
                        "SERIAL_ADICIONAL_DUPLICADO",

                    error:
                        `Ya existe otro adicional con el serial ${serialFinal}.`,
                });
            }
        }

        /* =====================================================
           ACTUALIZAR
        ===================================================== */

        await prisma.$transaction(
            async (
                tx
            ) => {

                await tx.adicional.update({
                    where: {
                        id,
                    },

                    data: {
                        ...(
                            data.nombre !==
                                undefined
                                ? {
                                    nombre:
                                        data.nombre?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.tipo !==
                                undefined
                                ? {
                                    tipo:
                                        data.tipo
                                            .trim()
                                            .toUpperCase(),
                                }
                                : {}
                        ),

                        ...(
                            data.marca !==
                                undefined
                                ? {
                                    marca:
                                        data.marca?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.modelo !==
                                undefined
                                ? {
                                    modelo:
                                        data.modelo?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.serialAdicional !==
                                undefined
                                ? {
                                    serialAdicional:
                                        serialFinal,
                                }
                                : {}
                        ),

                        ...(
                            data.macAddress !==
                                undefined
                                ? {
                                    macAddress:
                                        normalizarMac(
                                            data.macAddress
                                        ),
                                }
                                : {}
                        ),

                        ...(
                            data.ipAddress !==
                                undefined
                                ? {
                                    ipAddress:
                                        data.ipAddress?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.hostname !==
                                undefined
                                ? {
                                    hostname:
                                        data.hostname?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.ubicacion !==
                                undefined
                                ? {
                                    ubicacion:
                                        data.ubicacion?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.descripcion !==
                                undefined
                                ? {
                                    descripcion:
                                        data.descripcion?.trim() ||
                                        null,
                                }
                                : {}
                        ),

                        ...(
                            data.cantidad !==
                                undefined
                                ? {
                                    cantidad:
                                        data.cantidad,
                                }
                                : {}
                        ),

                        ...(
                            data.estado !==
                                undefined
                                ? {
                                    estado:
                                        data.estado,
                                }
                                : {}
                        ),

                        /*
                         * Una intervención desde
                         * el CRM convierte el
                         * adicional en MANUAL.
                         */
                        origen:
                            OrigenEquipoAdicional.MANUAL,
                    },
                });

                /* =============================================
                   RELACIONES
                ============================================= */

                if (
                    equipoIds !==
                    null
                ) {
                    /*
                     * Se solicitó reemplazar
                     * explícitamente las relaciones.
                     */
                    await tx.adicionalEquipo.deleteMany({
                        where: {
                            adicionalId:
                                id,
                        },
                    });

                    if (
                        equipoIds.length >
                        0
                    ) {
                        await tx.adicionalEquipo.createMany({
                            data:
                                equipoIds.map(
                                    (
                                        equipoId
                                    ) => ({
                                        adicionalId:
                                            id,

                                        equipoId,

                                        origen:
                                            OrigenEquipoAdicional.MANUAL,
                                    })
                                ),

                            skipDuplicates:
                                true,
                        });
                    }

                } else {

                    /*
                     * No se modificaron equipos,
                     * pero el registro fue editado
                     * manualmente.
                     *
                     * Las relaciones existentes pasan
                     * también a administración manual.
                     */
                    await tx.adicionalEquipo.updateMany({
                        where: {
                            adicionalId:
                                id,
                        },

                        data: {
                            origen:
                                OrigenEquipoAdicional.MANUAL,
                        },
                    });
                }
            }
        );

        /* =====================================================
           DEVOLVER OBJETO ACTUALIZADO
        ===================================================== */

        const updated =
            await prisma.adicional.findUnique({
                where: {
                    id,
                },

                include: {
                    equipos: {
                        include: {
                            equipo: {
                                select:
                                    equipoRelacionSelect,
                            },
                        },

                        orderBy: [
                            {
                                equipoId:
                                    "asc",
                            },
                        ],
                    },
                },
            });

        return res.json({
            ok:
                true,

            item:
                updated
                    ? formatAdicionalResponse(
                        updated
                    )
                    : null,
        });

    } catch (
    error
    ) {

        console.error(
            "[updateEquipoAdicional]",
            error
        );

        if (
            error instanceof
            z.ZodError
        ) {
            return res.status(
                400
            ).json({
                error:
                    "Datos inválidos",

                details:
                    error.flatten(),
            });
        }

        if (
            error instanceof
            Prisma.PrismaClientKnownRequestError &&
            error.code ===
            "P2002"
        ) {
            return res.status(
                409
            ).json({
                code:
                    "SERIAL_ADICIONAL_DUPLICADO",

                error:
                    "Ya existe otro adicional registrado con ese serial.",
            });
        }

        return res.status(
            500
        ).json({
            error:
                "Error al actualizar adicional",
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
        const user =
            (req as any).user;

        if (
            !canManage(
                user
            )
        ) {
            return res.status(
                403
            ).json({
                error:
                    "No autorizado para eliminar adicionales",
            });
        }

        const id =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                id
            ) ||
            id <=
            0
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID inválido",
            });
        }

        const existing =
            await prisma.adicional.findUnique({
                where: {
                    id,
                },

                select: {
                    id:
                        true,
                },
            });

        if (!existing) {
            return res.status(
                404
            ).json({
                error:
                    "Adicional no encontrado",
            });
        }

        /*
         * relationMode = "prisma":
         *
         * eliminamos explícitamente
         * las relaciones antes del
         * dispositivo.
         */
        await prisma.$transaction(
            async (
                tx
            ) => {

                await tx.adicionalEquipo.deleteMany({
                    where: {
                        adicionalId:
                            id,
                    },
                });

                await tx.adicional.delete({
                    where: {
                        id,
                    },
                });
            }
        );

        return res.json({
            ok:
                true,
        });

    } catch (
    error
    ) {

        console.error(
            "[deleteEquipoAdicional]",
            error
        );

        return res.status(
            500
        ).json({
            error:
                "Error al eliminar adicional",
        });
    }
}