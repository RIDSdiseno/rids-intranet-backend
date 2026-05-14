// src/controllers/tecnicos.controller.ts
import * as argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import type { Request, Response } from "express";

const VALID_ROLES = [
    "ADMIN",
    "TECNICO",
    "VENTAS",
    "ADMINISTRACION",
] as const;

function normalizeRole(rol: unknown): string | undefined {
    if (!rol) return undefined;

    const value = String(rol).trim().toUpperCase();

    if (!VALID_ROLES.includes(value as any)) {
        return undefined;
    }

    return value;
}

// Listar técnicos válidos para selects / asignaciones
export async function listTecnicos(_req: Request, res: Response) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
            where: {
                status: true,
                rol: {
                    in: ["ADMIN", "TECNICO", "ADMINISTRACION","VENTAS"],
                },
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
            },
            orderBy: { nombre: "asc" },
        });

        return res.status(200).json(tecnicos);
    } catch (error) {
        console.error("Error al listar técnicos:", error);
        return res.status(500).json({ error: "Error al listar técnicos" });
    }
}
// Listar todos los usuarios
export async function listUsuarios(_req: Request, res: Response) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
            where: {
                status: true,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
            },
            orderBy: { nombre: "asc" },
        });

        return res.status(200).json(tecnicos);
    } catch (error) {
        console.error("Error al listar usuarios:", error);
        return res.status(500).json({ error: "Error al listar usuarios" });
    }
}

// Actualizar técnico
export async function updateTecnico(req: Request, res: Response) {
    console.log("updateTecnico body:", req.body);

    try {
        const id = Number(req.params.id);
        const { nombre, email, status, rol } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }

        const normalizedRole = normalizeRole(rol);

        if (rol && !normalizedRole) {
            return res.status(400).json({
                error: "Rol inválido. Roles permitidos: ADMIN, TECNICO, CLIENTE, VENTAS, ADMINISTRACION",
            });
        }

        const tecnico = await prisma.tecnico.update({
            where: { id_tecnico: id },
            data: {
                ...(nombre !== undefined && { nombre: String(nombre).trim() }),
                ...(email !== undefined && { email: String(email).trim().toLowerCase() }),
                ...(status !== undefined && { status: Boolean(status) }),
                ...(normalizedRole && { rol: normalizedRole }),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
            },
        });

        return res.json(tecnico);
    } catch (error) {
        console.error("Error al actualizar tecnico:", error);
        return res.status(500).json({ error: "Error al actualizar tecnico" });
    }
}

// Eliminar técnico
export async function deleteTecnico(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }

        await prisma.refreshToken.deleteMany({
            where: { userId: id },
        });

        await prisma.tecnico.delete({
            where: { id_tecnico: id },
        });

        return res.json({ ok: true, message: "Técnico eliminado" });
    } catch (error) {
        console.error("Error al eliminar tecnico:", error);
        return res.status(500).json({ error: "Error al eliminar técnico" });
    }
}

// Crear técnico
export async function createTecnico(req: Request, res: Response) {
    try {
        const { nombre, email, password, rol, status } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({
                error: "Nombre, email y contraseña son requeridos",
            });
        }

        const normalizedRole = normalizeRole(rol) ?? "TECNICO";

        if (rol && !normalizeRole(rol)) {
            return res.status(400).json({
                error: "Rol inválido. Roles permitidos: ADMIN, TECNICO, CLIENTE, VENTAS",
            });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        const exists = await prisma.tecnico.findUnique({
            where: { email: cleanEmail },
        });

        if (exists) {
            return res.status(409).json({ error: "El email ya está registrado" });
        }

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 4096,
            timeCost: 2,
            parallelism: 1,
        });

        const tecnico = await prisma.tecnico.create({
            data: {
                nombre: String(nombre).trim(),
                email: cleanEmail,
                passwordHash,
                rol: normalizedRole,
                status: status ?? true,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
            },
        });

        return res.status(201).json(tecnico);
    } catch (error) {
        console.error("Error al crear tecnico:", error);
        return res.status(500).json({ error: "Error al crear tecnico" });
    }
}