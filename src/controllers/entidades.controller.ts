// src/controllers/entidades.controller.ts
import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";
import { TipoEntidadGestioo, OrigenGestioo } from "@prisma/client";
import { prismaBase as prisma } from "../lib/prisma.js";

/* =====================================================
   HELPERS
===================================================== */

function normalizeRutGestioo(value?: string | null): string | null {
    if (!value) return null;

    const clean = value
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();

    if (!clean) return null;
    if (clean.length <= 1) return clean;

    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1);

    return `${cuerpo}-${dv}`;
}

function rutKey(value?: string | null): string {
    return (value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}

function normalizeNombreEntidad(value?: string | null): string {
    return (value ?? "")
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[-\s]+$/g, "")
        .toUpperCase();
}

function normalizeTipoEntidad(value?: string | null): TipoEntidadGestioo {
    if (value === "PERSONA") return TipoEntidadGestioo.PERSONA;
    return TipoEntidadGestioo.EMPRESA;
}

function normalizeOrigenEntidad(value?: string | null): OrigenGestioo {
    if (value === "RIDS") return OrigenGestioo.RIDS;
    if (value === "ECONNET") return OrigenGestioo.ECONNET;
    return OrigenGestioo.OTRO;
}

function normalizeSearchText(value?: string | null): string {
    return (value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeDigits(value?: string | null): string {
    return (value ?? "").replace(/\D/g, "");
}

function buildEntidadSearchWhere(search: string) {
    const q = normalizeSearchText(search);

    if (!q) return {};

    const terms = q
        .split(" ")
        .map((term) => term.trim())
        .filter(Boolean);

    const qRutKey = rutKey(q);
    const qRutNormalizado = normalizeRutGestioo(q);
    const qDigits = normalizeDigits(q);

    return {
        AND: [
            ...terms.map((term) => {
                const termRutKey = rutKey(term);
                const termRutNormalizado = normalizeRutGestioo(term);
                const termDigits = normalizeDigits(term);

                return {
                    OR: [
                        {
                            nombre: {
                                contains: term,
                                mode: "insensitive" as const,
                            },
                        },
                        {
                            rut: {
                                contains: term,
                                mode: "insensitive" as const,
                            },
                        },
                        {
                            correo: {
                                contains: term,
                                mode: "insensitive" as const,
                            },
                        },
                        {
                            telefono: {
                                contains: term,
                                mode: "insensitive" as const,
                            },
                        },
                        {
                            direccion: {
                                contains: term,
                                mode: "insensitive" as const,
                            },
                        },
                        ...(termRutNormalizado
                            ? [
                                {
                                    rut: {
                                        contains: termRutNormalizado,
                                        mode: "insensitive" as const,
                                    },
                                },
                            ]
                            : []),
                        ...(termRutKey
                            ? [
                                {
                                    rut: {
                                        contains: termRutKey,
                                        mode: "insensitive" as const,
                                    },
                                },
                            ]
                            : []),
                        ...(termDigits
                            ? [
                                {
                                    telefono: {
                                        contains: termDigits,
                                        mode: "insensitive" as const,
                                    },
                                },
                            ]
                            : []),
                    ],
                };
            }),
            {
                OR: [
                    {
                        nombre: {
                            contains: q,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        rut: {
                            contains: q,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        correo: {
                            contains: q,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        telefono: {
                            contains: q,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        direccion: {
                            contains: q,
                            mode: "insensitive" as const,
                        },
                    },
                    ...(qRutNormalizado
                        ? [
                            {
                                rut: {
                                    contains: qRutNormalizado,
                                    mode: "insensitive" as const,
                                },
                            },
                        ]
                        : []),
                    ...(qRutKey
                        ? [
                            {
                                rut: {
                                    contains: qRutKey,
                                    mode: "insensitive" as const,
                                },
                            },
                        ]
                        : []),
                    ...(qDigits
                        ? [
                            {
                                telefono: {
                                    contains: qDigits,
                                    mode: "insensitive" as const,
                                },
                            },
                        ]
                        : []),
                ],
            },
        ],
    };
}

/* =====================================================
   SEED RIDS
===================================================== */

export async function seedEntidadesRIDS(_req: Request, res: Response) {
    try {
        const filePath = path.resolve("prisma/entidades_rids_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesRIDS = JSON.parse(fileContent);

        const data = entidadesRIDS.map((e: any) => ({
            nombre: e.nombre,
            rut: e.rut,
            correo: e.correo,
            telefono: e.telefono,
            direccion: e.direccion,
            tipo: TipoEntidadGestioo.EMPRESA,
            origen: OrigenGestioo.RIDS,
        }));

        const result = await prisma.entidadGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        return res.status(201).json({
            data: {
                inserted: result.count,
                message: `Se insertaron ${result.count} entidades RIDS.`,
            },
        });
    } catch (error: any) {
        console.error("❌ Error seed RIDS:", error);
        return res.status(500).json({
            error: "Error al poblar entidades RIDS",
            detalles: error.message,
        });
    }
}

/* =====================================================
   SEED ECONNET
===================================================== */

export async function seedEntidadesECONNET(_req: Request, res: Response) {
    try {
        const filePath = path.resolve("prisma/entidades_econnet_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesECONNET = JSON.parse(fileContent);

        const data = entidadesECONNET.map((e: any) => ({
            nombre: e.nombre,
            rut: e.rut,
            correo: e.correo,
            telefono: e.telefono,
            direccion: e.direccion,
            tipo: TipoEntidadGestioo.EMPRESA,
            origen: OrigenGestioo.ECONNET,
        }));

        const result = await prisma.entidadGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        return res.status(201).json({
            data: {
                inserted: result.count,
                message: `Se insertaron ${result.count} entidades ECONNET.`,
            },
        });
    } catch (error: any) {
        console.error("❌ Error seed ECONNET:", error);
        return res.status(500).json({
            error: "Error al poblar entidades ECONNET",
            detalles: error.message,
        });
    }
}

/* =====================================================
   CRUD ENTIDADES
===================================================== */

// Crear entidad
export async function createEntidad(req: Request, res: Response) {
    try {
        const data = req.body;

        const rutNormalizado = normalizeRutGestioo(data.rut);
        const nombreNormalizado = normalizeNombreEntidad(data.nombre);
        const tipoNormalizado = normalizeTipoEntidad(data.tipo);
        const origenNormalizado = normalizeOrigenEntidad(data.origen);

        if (!nombreNormalizado) {
            return res.status(400).json({
                error: "El nombre es obligatorio",
            });
        }

        if (rutNormalizado) {
            const entidadesConRut = await prisma.entidadGestioo.findMany({
                where: {
                    rut: {
                        not: null,
                    },
                },
                select: {
                    id: true,
                    nombre: true,
                    rut: true,
                    tipo: true,
                    origen: true,
                },
            });

            const existente = entidadesConRut.find(
                (e) => rutKey(e.rut) === rutKey(rutNormalizado)
            );

            if (existente) {
                return res.status(409).json({
                    error: `Ya existe una entidad con este RUT: ${existente.nombre}`,
                    entidad: existente,
                });
            }
        }

        const nuevaEntidad = await prisma.entidadGestioo.create({
            data: {
                nombre: nombreNormalizado,
                rut: rutNormalizado,
                correo: data.correo || null,
                telefono: data.telefono || null,
                direccion: data.direccion || null,
                tipo: tipoNormalizado,
                origen: origenNormalizado,
            },
        });

        return res.status(201).json({ data: nuevaEntidad });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({
                error: "El RUT ya está registrado",
            });
        }

        console.error("❌ Error al crear entidad:", error);
        return res.status(500).json({ error: "Error al crear entidad" });
    }
}

// Obtener todas
export async function getEntidades(req: Request, res: Response) {
    try {
        const { tipo, origen, search } = req.query;

        const where: any = {};

        if (tipo === "EMPRESA" || tipo === "PERSONA") {
            where.tipo = tipo;
        }

        if (
            origen === "RIDS" ||
            origen === "ECONNET" ||
            origen === "OTRO"
        ) {
            where.origen = origen;
        }

        if (typeof search === "string" && search.trim()) {
            Object.assign(where, buildEntidadSearchWhere(search));
        }

        const entidades = await prisma.entidadGestioo.findMany({
            where,
            orderBy: [
                { tipo: "asc" },
                { nombre: "asc" },
            ],
            include: {
                productos: true,
            },
        });

        return res.json({ data: entidades });
    } catch (error: any) {
        console.error("❌ Error al obtener entidades:", error);
        return res.status(500).json({ error: "Error al obtener entidades" });
    }
}

// Obtener por ID
export async function getEntidadById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        const entidad = await prisma.entidadGestioo.findUnique({
            where: { id },
            include: { productos: true },
        });

        if (!entidad) {
            return res.status(404).json({ error: "Entidad no encontrada" });
        }

        return res.json({ data: entidad });
    } catch (error: any) {
        console.error("❌ Error al obtener entidad:", error);
        return res.status(500).json({ error: "Error al obtener entidad" });
    }
}

// Actualizar
export async function updateEntidad(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const data = req.body;

        const entidadActual = await prisma.entidadGestioo.findUnique({
            where: { id },
        });

        if (!entidadActual) {
            return res.status(404).json({
                error: "Entidad no encontrada",
            });
        }

        const rutNormalizado = normalizeRutGestioo(data.rut);
        const nombreNormalizado = normalizeNombreEntidad(data.nombre);

        const tipoNormalizado =
            data.tipo === "EMPRESA" || data.tipo === "PERSONA"
                ? normalizeTipoEntidad(data.tipo)
                : entidadActual.tipo;

        const origenNormalizado =
            data.origen === "RIDS" ||
                data.origen === "ECONNET" ||
                data.origen === "OTRO"
                ? normalizeOrigenEntidad(data.origen)
                : entidadActual.origen;

        if (!nombreNormalizado) {
            return res.status(400).json({
                error: "El nombre es obligatorio",
            });
        }

        if (rutNormalizado) {
            const entidadesConRut = await prisma.entidadGestioo.findMany({
                where: {
                    rut: {
                        not: null,
                    },
                },
                select: {
                    id: true,
                    nombre: true,
                    rut: true,
                    tipo: true,
                    origen: true,
                },
            });

            const existente = entidadesConRut.find(
                (e) =>
                    e.id !== id &&
                    rutKey(e.rut) === rutKey(rutNormalizado)
            );

            if (existente) {
                return res.status(409).json({
                    error: `Ya existe otra entidad con este RUT: ${existente.nombre}`,
                    entidad: existente,
                });
            }
        }

        const entidadActualizada = await prisma.entidadGestioo.update({
            where: { id },
            data: {
                nombre: nombreNormalizado,
                rut: rutNormalizado,
                correo: data.correo || null,
                telefono: data.telefono || null,
                direccion: data.direccion || null,
                tipo: tipoNormalizado,
                origen: origenNormalizado,
            },
        });

        return res.json({ data: entidadActualizada });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({
                error: "El RUT ya está registrado",
            });
        }

        console.error("❌ Error al actualizar entidad:", error);
        return res.status(500).json({ error: "Error al actualizar entidad" });
    }
}

// Eliminar
export async function deleteEntidad(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        await prisma.entidadGestioo.delete({ where: { id } });

        return res.json({ message: "Entidad eliminada correctamente" });
    } catch (error: any) {
        console.error("❌ Error al eliminar entidad:", error);
        return res.status(500).json({ error: "Error al eliminar entidad" });
    }
}
