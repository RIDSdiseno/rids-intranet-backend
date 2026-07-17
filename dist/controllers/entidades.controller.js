// src/controllers/entidades.controller.ts
import fs from "fs/promises";
import path from "path";
import { TipoEntidadGestioo, OrigenGestioo } from "@prisma/client";
import { prismaBase as prisma } from "../lib/prisma.js";
/* =====================================================
   HELPERS
===================================================== */
function normalizeRutGestioo(value) {
    if (!value)
        return null;
    const clean = value
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
    if (!clean)
        return null;
    if (clean.length <= 1)
        return clean;
    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${cuerpo}-${dv}`;
}
function rutKey(value) {
    return (value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}
function normalizeNombreEntidad(value) {
    return (value ?? "")
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[-\s]+$/g, "")
        .toUpperCase();
}
function normalizeTipoEntidad(value) {
    if (value === "PERSONA")
        return TipoEntidadGestioo.PERSONA;
    return TipoEntidadGestioo.EMPRESA;
}
function normalizeOrigenEntidad(value) {
    if (value === "RIDS")
        return OrigenGestioo.RIDS;
    if (value === "ECONNET")
        return OrigenGestioo.ECONNET;
    return OrigenGestioo.OTRO;
}
function normalizeSearchText(value) {
    return (value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}
function normalizeDigits(value) {
    return (value ?? "").replace(/\D/g, "");
}
function buildEntidadSearchWhere(search) {
    const q = normalizeSearchText(search);
    if (!q)
        return {};
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
                                mode: "insensitive",
                            },
                        },
                        {
                            rut: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        {
                            correo: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        {
                            telefono: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        {
                            direccion: {
                                contains: term,
                                mode: "insensitive",
                            },
                        },
                        ...(termRutNormalizado
                            ? [
                                {
                                    rut: {
                                        contains: termRutNormalizado,
                                        mode: "insensitive",
                                    },
                                },
                            ]
                            : []),
                        ...(termRutKey
                            ? [
                                {
                                    rut: {
                                        contains: termRutKey,
                                        mode: "insensitive",
                                    },
                                },
                            ]
                            : []),
                        ...(termDigits
                            ? [
                                {
                                    telefono: {
                                        contains: termDigits,
                                        mode: "insensitive",
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
                            mode: "insensitive",
                        },
                    },
                    {
                        rut: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                    {
                        correo: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                    {
                        telefono: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                    {
                        direccion: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                    ...(qRutNormalizado
                        ? [
                            {
                                rut: {
                                    contains: qRutNormalizado,
                                    mode: "insensitive",
                                },
                            },
                        ]
                        : []),
                    ...(qRutKey
                        ? [
                            {
                                rut: {
                                    contains: qRutKey,
                                    mode: "insensitive",
                                },
                            },
                        ]
                        : []),
                    ...(qDigits
                        ? [
                            {
                                telefono: {
                                    contains: qDigits,
                                    mode: "insensitive",
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
export async function seedEntidadesRIDS(_req, res) {
    try {
        const filePath = path.resolve("prisma/entidades_rids_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesRIDS = JSON.parse(fileContent);
        const data = entidadesRIDS.map((e) => ({
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
    }
    catch (error) {
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
export async function seedEntidadesECONNET(_req, res) {
    try {
        const filePath = path.resolve("prisma/entidades_econnet_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesECONNET = JSON.parse(fileContent);
        const data = entidadesECONNET.map((e) => ({
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
    }
    catch (error) {
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
export async function createEntidad(req, res) {
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
            const existente = entidadesConRut.find((e) => rutKey(e.rut) === rutKey(rutNormalizado));
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
    }
    catch (error) {
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
export async function getEntidades(req, res) {
    try {
        const { tipo, origen, search } = req.query;
        const where = {};
        if (tipo === "EMPRESA" || tipo === "PERSONA") {
            where.tipo = tipo;
        }
        if (origen === "RIDS" ||
            origen === "ECONNET" ||
            origen === "OTRO") {
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
    }
    catch (error) {
        console.error("❌ Error al obtener entidades:", error);
        return res.status(500).json({ error: "Error al obtener entidades" });
    }
}
// Obtener por ID
export async function getEntidadById(req, res) {
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
    }
    catch (error) {
        console.error("❌ Error al obtener entidad:", error);
        return res.status(500).json({ error: "Error al obtener entidad" });
    }
}
// Actualizar
export async function updateEntidad(req, res) {
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
        const tipoNormalizado = data.tipo === "EMPRESA" || data.tipo === "PERSONA"
            ? normalizeTipoEntidad(data.tipo)
            : entidadActual.tipo;
        const origenNormalizado = data.origen === "RIDS" ||
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
            const existente = entidadesConRut.find((e) => e.id !== id &&
                rutKey(e.rut) === rutKey(rutNormalizado));
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
    }
    catch (error) {
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
export async function deleteEntidad(req, res) {
    try {
        const id = Number(req.params.id);
        await prisma.entidadGestioo.delete({ where: { id } });
        return res.json({ message: "Entidad eliminada correctamente" });
    }
    catch (error) {
        console.error("❌ Error al eliminar entidad:", error);
        return res.status(500).json({ error: "Error al eliminar entidad" });
    }
}
//# sourceMappingURL=entidades.controller.js.map