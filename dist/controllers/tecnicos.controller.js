// src/controllers/tecnicos.controller.ts
import * as argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
const VALID_ROLES = [
    "ADMIN",
    "TECNICO",
    "VENTAS",
    "ADMINISTRACION",
];
const VALID_AREAS = [
    "SOPORTE TECNICO",
    "INFORMATICA",
    "SOPORTE TECNICO E INFORMATICA",
    "VENTAS",
    "ADMINISTRACION",
];
function normalizeArea(area) {
    if (area === undefined)
        return undefined;
    if (area === null || String(area).trim() === "")
        return null;
    const value = String(area).trim().toUpperCase();
    if (!VALID_AREAS.includes(value)) {
        return undefined;
    }
    return value;
}
function normalizeCargo(cargo) {
    if (cargo === undefined)
        return undefined;
    if (cargo === null || String(cargo).trim() === "")
        return null;
    return String(cargo).trim();
}
function normalizeRole(rol) {
    if (!rol)
        return undefined;
    const value = String(rol).trim().toUpperCase();
    if (!VALID_ROLES.includes(value)) {
        return undefined;
    }
    return value;
}
// Listar técnicos válidos para selects / asignaciones
export async function listTecnicos(_req, res) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
            where: {
                status: true,
                rol: {
                    in: ["ADMIN", "TECNICO", "ADMINISTRACION", "VENTAS"],
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
    }
    catch (error) {
        console.error("Error al listar técnicos:", error);
        return res.status(500).json({ error: "Error al listar técnicos" });
    }
}
// Listar todos los usuarios
export const listUsuarios = async (req, res) => {
    try {
        const statusQ = String(req.query.status ?? "activo").toLowerCase();
        const where = statusQ === "todos"
            ? {}
            : statusQ === "inactivo"
                ? { status: false }
                : { status: true };
        const usuarios = await prisma.tecnico.findMany({
            where,
            orderBy: {
                nombre: "asc",
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
                area: true,
                cargo: true,
            },
        });
        return res.json(usuarios);
    }
    catch (error) {
        console.error("[listUsuarios] error:", error);
        return res.status(500).json({
            error: "Error al listar usuarios técnicos",
        });
    }
};
// Actualizar técnico
export async function updateTecnico(req, res) {
    console.log("updateTecnico body:", req.body);
    try {
        const id = Number(req.params.id);
        const { nombre, email, status, rol, area, cargo, } = req.body;
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }
        const normalizedRole = normalizeRole(rol);
        const normalizedArea = normalizeArea(area);
        const normalizedCargo = normalizeCargo(cargo);
        if (rol !== undefined && !normalizedRole) {
            return res.status(400).json({
                error: "Rol inválido. Roles permitidos: ADMIN, TECNICO, VENTAS, ADMINISTRACION",
            });
        }
        if (area !== undefined &&
            normalizedArea === undefined) {
            return res.status(400).json({
                error: "Área inválida. Áreas permitidas: SOPORTE TECNICO, INFORMATICA, SOPORTE TECNICO E INFORMATICA, VENTAS, ADMINISTRACION",
            });
        }
        const data = {};
        if (nombre !== undefined) {
            data.nombre = String(nombre).trim();
        }
        if (email !== undefined) {
            data.email = String(email)
                .trim()
                .toLowerCase();
        }
        if (status !== undefined) {
            data.status = Boolean(status);
        }
        if (normalizedRole !== undefined) {
            data.rol = normalizedRole;
        }
        if (area !== undefined) {
            /*
             * Llegados a este punto, normalizedArea solo puede ser:
             * string o null.
             */
            data.area = normalizedArea;
        }
        if (cargo !== undefined) {
            /*
             * Llegados a este punto, normalizedCargo solo puede ser:
             * string o null.
             */
            data.cargo = normalizedCargo;
        }
        const tecnico = await prisma.tecnico.update({
            where: {
                id_tecnico: id,
            },
            data,
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
                area: true,
                cargo: true,
            },
        });
        return res.json(tecnico);
    }
    catch (error) {
        console.error("Error al actualizar técnico:", {
            code: error?.code,
            message: error?.message,
            meta: error?.meta,
        });
        if (error?.code === "P2025") {
            return res.status(404).json({
                error: "Técnico no encontrado",
            });
        }
        if (error?.code === "P2002") {
            return res.status(409).json({
                error: "El email ya está registrado",
            });
        }
        return res.status(500).json({
            error: "Error al actualizar técnico",
        });
    }
}
// Eliminar técnico definitivamente
export async function deleteTecnico(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const tecnico = await prisma.tecnico.findUnique({
            where: { id_tecnico: id },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
        });
        if (!tecnico) {
            return res.status(404).json({
                error: "Técnico no encontrado",
            });
        }
        await prisma.refreshToken.deleteMany({
            where: { userId: id },
        });
        await prisma.tecnico.delete({
            where: { id_tecnico: id },
        });
        return res.json({
            ok: true,
            message: "Técnico eliminado definitivamente",
        });
    }
    catch (error) {
        console.error("Error al eliminar tecnico:", {
            code: error?.code,
            message: error?.message,
            meta: error?.meta,
        });
        if (error?.code === "P2003") {
            return res.status(409).json({
                error: "No se puede eliminar este técnico porque tiene registros asociados. Puedes desactivarlo para conservar el historial.",
            });
        }
        return res.status(500).json({
            error: "Error al eliminar técnico",
            detail: error?.message,
        });
    }
}
// Crear técnico
export async function createTecnico(req, res) {
    try {
        const { nombre, email, password, rol, status, area, cargo, } = req.body;
        if (!nombre || !email || !password) {
            return res.status(400).json({
                error: "Nombre, email y contraseña son requeridos",
            });
        }
        const normalizedArea = normalizeArea(area);
        const normalizedCargo = normalizeCargo(cargo);
        if (area !== undefined && normalizedArea === undefined) {
            return res.status(400).json({
                error: "Área inválida. Áreas permitidas: SOPORTE TECNICO, INFORMATICA, SOPORTE TECNICO E INFORMATICA, VENTAS, ADMINISTRACION",
            });
        }
        const normalizedRole = normalizeRole(rol);
        if (rol && !normalizedRole) {
            return res.status(400).json({
                error: "Rol inválido. Roles permitidos: ADMIN, TECNICO, VENTAS, ADMINISTRACION",
            });
        }
        const finalRole = normalizedRole ?? "TECNICO";
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
                rol: finalRole,
                status: status ?? true,
                area: normalizedArea ?? null,
                cargo: normalizedCargo ?? null,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
                area: true,
                cargo: true,
            },
        });
        return res.status(201).json(tecnico);
    }
    catch (error) {
        console.error("Error al crear tecnico:", error);
        return res.status(500).json({ error: "Error al crear tecnico" });
    }
}
export async function updateTecnicoPassword(req, res) {
    try {
        const id = Number(req.params.id);
        const { password } = req.body;
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }
        if (!password || typeof password !== "string") {
            return res.status(400).json({
                error: "La nueva contraseña es obligatoria",
            });
        }
        const cleanPassword = password.trim();
        if (cleanPassword.length < 8) {
            return res.status(400).json({
                error: "La contraseña debe tener al menos 8 caracteres",
            });
        }
        const tecnico = await prisma.tecnico.findUnique({
            where: { id_tecnico: id },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
        });
        if (!tecnico) {
            return res.status(404).json({
                error: "Técnico no encontrado",
            });
        }
        const passwordHash = await argon2.hash(cleanPassword, {
            type: argon2.argon2id,
            memoryCost: 4096,
            timeCost: 2,
            parallelism: 1,
        });
        await prisma.tecnico.update({
            where: { id_tecnico: id },
            data: {
                passwordHash,
            },
        });
        await prisma.refreshToken.deleteMany({
            where: { userId: id },
        });
        return res.json({
            ok: true,
            message: "Contraseña actualizada correctamente",
        });
    }
    catch (error) {
        console.error("Error al actualizar contraseña del técnico:", error);
        return res.status(500).json({
            error: "Error al actualizar contraseña del técnico",
            detail: error?.message,
        });
    }
}
//# sourceMappingURL=tecnicos.controller.js.map