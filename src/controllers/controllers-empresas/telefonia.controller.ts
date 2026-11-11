// src/controllers/controllers-empresas/telefonia.controller.ts
//
// Ficha de empresa → Telefonía: parlantes IP y usuarios de la app de telefonía
// (Linkus). Las contraseñas se guardan en texto plano, por eso las rutas solo
// admiten roles internos (ver ficha-empresas.routes.ts).

import type { Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";

/* =========================================================
   VALIDACIÓN
========================================================= */

/** Texto opcional: "" o espacios → null. */
const texto = (max: number) =>
    z
        .union([z.string(), z.null()])
        .optional()
        .transform((v) => {
            if (v === undefined) return undefined;
            const t = (v ?? "").trim();
            return t ? t.slice(0, max) : null;
        });

/** Puerto opcional 1–65535: "" o null → null. */
const puerto = z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
        if (v === undefined) return undefined;
        if (v === null || String(v).trim() === "") return null;

        const n = Number(v);

        if (!Number.isInteger(n) || n < 1 || n > 65535) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "El puerto debe ser un número entre 1 y 65535",
            });
            return z.NEVER;
        }

        return n;
    });

const parlanteSchema = z.object({
    ubicacion: texto(200),
    marcaModelo: texto(200),
    anexo: texto(50),
    macAddress: texto(50),
    contrasenaAdmin: texto(200),
    observaciones: texto(1000),
});

const usuarioSchema = z.object({
    nombre: texto(200),
    anexo: texto(50),
    contrasena: texto(200),
    ipPrivada: texto(100),
    puertoPrivado: puerto,
    ipPublica: texto(100),
    puertoPublico: puerto,
});

type ParlanteInput = z.infer<typeof parlanteSchema>;
type UsuarioInput = z.infer<typeof usuarioSchema>;

/* =========================================================
   HELPERS
========================================================= */

function idParam(value: unknown): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/** Solo los campos que vinieron en el body (undefined = no tocar). */
function definidos<T extends Record<string, unknown>>(obj: T) {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

function errorValidacion(res: Response, error: z.ZodError) {
    return res.status(400).json({
        error: error.issues[0]?.message ?? "Datos inválidos",
    });
}

async function empresaActiva(empresaId: number) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { isActive: true },
    });

    return Boolean(empresa?.isActive);
}

/** MAC en mayúsculas, como en Equipos y Adicionales. */
function conMacMayuscula(data: ParlanteInput): ParlanteInput {
    return {
        ...data,
        macAddress: data.macAddress
            ? data.macAddress.toUpperCase()
            : data.macAddress,
    };
}

/* =========================================================
   LISTAR
========================================================= */

export async function obtenerTelefoniaEmpresa(req: Request, res: Response) {
    const empresaId = idParam(req.params.empresaId);

    if (!empresaId) {
        return res.status(400).json({ error: "Empresa inválida" });
    }

    try {
        const [parlantes, usuarios] = await Promise.all([
            prisma.telefoniaParlante.findMany({
                where: { empresaId },
                orderBy: [{ anexo: "asc" }, { id: "asc" }],
            }),
            prisma.telefoniaUsuario.findMany({
                where: { empresaId },
                orderBy: [{ nombre: "asc" }, { id: "asc" }],
            }),
        ]);

        return res.json({ parlantes, usuarios });
    } catch (error) {
        console.error("Error obteniendo telefonía:", error);
        return res.status(500).json({ error: "Error obteniendo telefonía" });
    }
}

/* =========================================================
   PARLANTES
========================================================= */

export async function crearTelefoniaParlante(req: Request, res: Response) {
    const empresaId = idParam(req.params.empresaId);

    if (!empresaId) {
        return res.status(400).json({ error: "Empresa inválida" });
    }

    const parsed = parlanteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return errorValidacion(res, parsed.error);

    try {
        if (!(await empresaActiva(empresaId))) {
            return res.status(404).json({ error: "La empresa no existe o está inactiva" });
        }

        const data: ParlanteInput = conMacMayuscula(parsed.data);

        const parlante = await prisma.telefoniaParlante.create({
            data: {
                empresaId,
                ...definidos(data),
            },
        });

        return res.status(201).json(parlante);
    } catch (error) {
        console.error("Error creando parlante:", error);
        return res.status(500).json({ error: "Error creando parlante" });
    }
}

export async function actualizarTelefoniaParlante(req: Request, res: Response) {
    const id = idParam(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "ID inválido" });
    }

    const parsed = parlanteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return errorValidacion(res, parsed.error);

    try {
        const existe = await prisma.telefoniaParlante.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existe) {
            return res.status(404).json({ error: "Parlante no encontrado" });
        }

        const parlante = await prisma.telefoniaParlante.update({
            where: { id },
            data: definidos(conMacMayuscula(parsed.data)),
        });

        return res.json(parlante);
    } catch (error) {
        console.error("Error actualizando parlante:", error);
        return res.status(500).json({ error: "Error actualizando parlante" });
    }
}

export async function eliminarTelefoniaParlante(req: Request, res: Response) {
    const id = idParam(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "ID inválido" });
    }

    try {
        const existe = await prisma.telefoniaParlante.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existe) {
            return res.status(404).json({ error: "Parlante no encontrado" });
        }

        await prisma.telefoniaParlante.delete({ where: { id } });

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error eliminando parlante:", error);
        return res.status(500).json({ error: "Error eliminando parlante" });
    }
}

/* =========================================================
   USUARIOS (APP DE TELEFONÍA)
========================================================= */

export async function crearTelefoniaUsuario(req: Request, res: Response) {
    const empresaId = idParam(req.params.empresaId);

    if (!empresaId) {
        return res.status(400).json({ error: "Empresa inválida" });
    }

    const parsed = usuarioSchema.safeParse(req.body ?? {});
    if (!parsed.success) return errorValidacion(res, parsed.error);

    const data: UsuarioInput = parsed.data;

    if (!data.nombre) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    try {
        if (!(await empresaActiva(empresaId))) {
            return res.status(404).json({ error: "La empresa no existe o está inactiva" });
        }

        const usuario = await prisma.telefoniaUsuario.create({
            data: {
                ...definidos(data),
                empresaId,
                nombre: data.nombre,
            },
        });

        return res.status(201).json(usuario);
    } catch (error) {
        console.error("Error creando usuario de telefonía:", error);
        return res.status(500).json({ error: "Error creando usuario de telefonía" });
    }
}

export async function actualizarTelefoniaUsuario(req: Request, res: Response) {
    const id = idParam(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "ID inválido" });
    }

    const parsed = usuarioSchema.safeParse(req.body ?? {});
    if (!parsed.success) return errorValidacion(res, parsed.error);

    if (parsed.data.nombre === null) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    try {
        const existe = await prisma.telefoniaUsuario.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existe) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const { nombre, ...resto } = parsed.data;

        const usuario = await prisma.telefoniaUsuario.update({
            where: { id },
            data: {
                ...definidos(resto),
                ...(nombre ? { nombre } : {}),
            },
        });

        return res.json(usuario);
    } catch (error) {
        console.error("Error actualizando usuario de telefonía:", error);
        return res.status(500).json({ error: "Error actualizando usuario de telefonía" });
    }
}

export async function eliminarTelefoniaUsuario(req: Request, res: Response) {
    const id = idParam(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "ID inválido" });
    }

    try {
        const existe = await prisma.telefoniaUsuario.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existe) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        await prisma.telefoniaUsuario.delete({ where: { id } });

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error eliminando usuario de telefonía:", error);
        return res.status(500).json({ error: "Error eliminando usuario de telefonía" });
    }
}

/* =========================================================
   CONFIGURACIÓN: ¿APLICA TELEFONÍA A LA EMPRESA?
   Igual que servidores-config: cuenta o no en la completitud.
========================================================= */

/** GET /api/ficha-empresa/:empresaId/telefonia-config */
export async function obtenerConfiguracionTelefonia(req: Request, res: Response) {
    const empresaId = idParam(req.params.empresaId);

    if (!empresaId) {
        return res.status(400).json({ success: false, error: "empresaId inválido" });
    }

    try {
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true },
        });

        if (!empresa) {
            return res.status(404).json({ success: false, error: "Empresa no encontrada" });
        }

        const ficha = await prisma.fichaEmpresa.findUnique({
            where: { empresaId },
            select: { telefoniaAplica: true },
        });

        return res.json({
            success: true,
            data: {
                empresaId,
                telefoniaAplica: ficha?.telefoniaAplica ?? false,
            },
        });
    } catch (error) {
        console.error("Error obteniendo configuración de telefonía:", error);
        return res.status(500).json({
            success: false,
            error: "No se pudo obtener la configuración de telefonía",
        });
    }
}

/** PATCH /api/ficha-empresa/:empresaId/telefonia-config  { telefoniaAplica: boolean } */
export async function actualizarConfiguracionTelefonia(req: Request, res: Response) {
    const empresaId = idParam(req.params.empresaId);
    const telefoniaAplica = req.body?.telefoniaAplica;

    if (!empresaId) {
        return res.status(400).json({ success: false, error: "empresaId inválido" });
    }

    if (typeof telefoniaAplica !== "boolean") {
        return res.status(400).json({
            success: false,
            error: "telefoniaAplica debe ser boolean",
        });
    }

    try {
        if (!(await empresaActiva(empresaId))) {
            return res.status(404).json({
                success: false,
                error: "La empresa no existe o está inactiva",
            });
        }

        const ficha = await prisma.fichaEmpresa.upsert({
            where: { empresaId },
            update: { telefoniaAplica },
            create: { empresaId, telefoniaAplica },
            select: { empresaId: true, telefoniaAplica: true },
        });

        return res.json({ success: true, data: ficha });
    } catch (error) {
        console.error("Error actualizando configuración de telefonía:", error);
        return res.status(500).json({
            success: false,
            error: "No se pudo actualizar la configuración de telefonía",
        });
    }
}