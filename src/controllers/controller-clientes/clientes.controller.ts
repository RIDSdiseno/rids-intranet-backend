// src/controller/controller-clientes/clientes.controller.ts
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";

function parsePositiveInt(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeEmail(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

// Controlador para gestionar clientes (técnicos con rol CLIENTE)
export async function listClientes(req: Request, res: Response): Promise<void> {
    try {
        const search = String(req.query.search ?? "").trim();

        const clientes = await prisma.tecnico.findMany({
            where: {
                rol: "CLIENTE",
                ...(search
                    ? {
                        OR: [
                            {
                                nombre: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                email: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                empresa: {
                                    nombre: {
                                        contains: search,
                                        mode: "insensitive",
                                    },
                                },
                            },
                        ],
                    }
                    : {}),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                rut: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                nombre: "asc",
            },
        });

        res.json({
            ok: true,
            data: clientes,
        });
    } catch (error) {
        console.error("❌ Error listClientes:", error);

        res.status(500).json({
            ok: false,
            error: "Error al listar clientes",
        });
    }
}

// End-Point para obtener clientes
export async function getClienteById(req: Request, res: Response): Promise<void> {
    try {
        const id = parsePositiveInt(req.params.id);

        if (!id) {
            res.status(400).json({
                ok: false,
                error: "ID inválido",
            });
            return;
        }

        const cliente = await prisma.tecnico.findFirst({
            where: {
                id_tecnico: id,
                rol: "CLIENTE",
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                rut: true,
                            },
                        },
                    },
                },
            },
        });

        if (!cliente) {
            res.status(404).json({
                ok: false,
                error: "Cliente no encontrado",
            });
            return;
        }

        res.json({
            ok: true,
            data: cliente,
        });
    } catch (error) {
        console.error("❌ Error getClienteById:", error);

        res.status(500).json({
            ok: false,
            error: "Error al obtener cliente",
        });
    }
}

// End-Point para crear clientes es decir, técnicos con rol CLIENTE
export async function createCliente(req: Request, res: Response): Promise<void> {
    try {
        const nombre = String(req.body.nombre ?? "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password ?? "");
        const empresaId = parsePositiveInt(req.body.empresaId);

        if (!nombre || !email || !password || !empresaId) {
            res.status(400).json({
                ok: false,
                error: "Nombre, email, contraseña y empresa son obligatorios",
            });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({
                ok: false,
                error: "La contraseña debe tener al menos 6 caracteres",
            });
            return;
        }

        const empresa = await prisma.empresa.findUnique({
            where: {
                id_empresa: empresaId,
            },
            select: {
                id_empresa: true,
                nombre: true,
                detalleEmpresa: {
                    select: {
                        rut: true,
                    },
                },
            },
        });

        if (!empresa) {
            res.status(404).json({
                ok: false,
                error: "Empresa no encontrada",
            });
            return;
        }

        if (!empresa.detalleEmpresa?.rut) {
            res.status(400).json({
                ok: false,
                error: "La empresa seleccionada no tiene RUT configurado en la ficha",
            });
            return;
        }

        const existe = await prisma.tecnico.findUnique({
            where: {
                email,
            },
            select: {
                id_tecnico: true,
            },
        });

        if (existe) {
            res.status(409).json({
                ok: false,
                error: "Ya existe un usuario con ese email",
            });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const cliente = await prisma.tecnico.create({
            data: {
                nombre,
                email,
                passwordHash,
                empresaId,
                rol: "CLIENTE",
                status: true,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                rut: true,
                            },
                        },
                    },
                },
            },
        });

        res.status(201).json({
            ok: true,
            data: cliente,
        });
    } catch (error) {
        console.error("❌ Error createCliente:", error);

        res.status(500).json({
            ok: false,
            error: "Error al crear cliente",
        });
    }
}

// End-Point para actualizar clientes (técnicos con rol CLIENTE)
export async function updateCliente(req: Request, res: Response): Promise<void> {
    try {
        const id = parsePositiveInt(req.params.id);

        if (!id) {
            res.status(400).json({
                ok: false,
                error: "ID inválido",
            });
            return;
        }

        const existing = await prisma.tecnico.findFirst({
            where: {
                id_tecnico: id,
                rol: "CLIENTE",
            },
            select: {
                id_tecnico: true,
            },
        });

        if (!existing) {
            res.status(404).json({
                ok: false,
                error: "Cliente no encontrado",
            });
            return;
        }

        const nombre =
            req.body.nombre !== undefined
                ? String(req.body.nombre ?? "").trim()
                : undefined;

        const email =
            req.body.email !== undefined
                ? normalizeEmail(req.body.email)
                : undefined;

        const empresaId =
            req.body.empresaId !== undefined
                ? parsePositiveInt(req.body.empresaId)
                : undefined;

        const password =
            req.body.password !== undefined
                ? String(req.body.password ?? "")
                : undefined;

        const status =
            typeof req.body.status === "boolean" ? req.body.status : undefined;

        if (nombre !== undefined && !nombre) {
            res.status(400).json({
                ok: false,
                error: "El nombre no puede quedar vacío",
            });
            return;
        }

        if (email !== undefined && !email) {
            res.status(400).json({
                ok: false,
                error: "El email no puede quedar vacío",
            });
            return;
        }

        if (empresaId !== undefined) {
            if (!empresaId) {
                res.status(400).json({
                    ok: false,
                    error: "Empresa inválida",
                });
                return;
            }

            const empresa = await prisma.empresa.findUnique({
                where: {
                    id_empresa: empresaId,
                },
                select: {
                    id_empresa: true,
                    detalleEmpresa: {
                        select: {
                            rut: true,
                        },
                    },
                },
            });

            if (!empresa) {
                res.status(404).json({
                    ok: false,
                    error: "Empresa no encontrada",
                });
                return;
            }

            if (!empresa.detalleEmpresa?.rut) {
                res.status(400).json({
                    ok: false,
                    error: "La empresa seleccionada no tiene RUT configurado en la ficha",
                });
                return;
            }
        }

        const data: {
            nombre?: string;
            email?: string;
            empresaId?: number;
            status?: boolean;
            passwordHash?: string;
        } = {};

        if (nombre !== undefined) data.nombre = nombre;
        if (email !== undefined) data.email = email;
        if (empresaId !== undefined && empresaId !== null) data.empresaId = empresaId;
        if (status !== undefined) data.status = status;

        if (password && password.trim().length > 0) {
            if (password.length < 6) {
                res.status(400).json({
                    ok: false,
                    error: "La contraseña debe tener al menos 6 caracteres",
                });
                return;
            }

            data.passwordHash = await bcrypt.hash(password, 10);
        }

        const cliente = await prisma.tecnico.update({
            where: {
                id_tecnico: id,
            },
            data,
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                rut: true,
                            },
                        },
                    },
                },
            },
        });

        res.json({
            ok: true,
            data: cliente,
        });
    } catch (error: any) {
        console.error("❌ Error updateCliente:", error);

        if (error?.code === "P2002") {
            res.status(409).json({
                ok: false,
                error: "Ya existe un usuario con ese email",
            });
            return;
        }

        res.status(500).json({
            ok: false,
            error: "Error al actualizar cliente",
        });
    }
}

// End-Point para desactivar clientes (técnicos con rol CLIENTE)
export async function deleteCliente(req: Request, res: Response): Promise<void> {
    try {

        const id = parsePositiveInt(req.params.id);

        if (!id) {
            res.status(400).json({
                ok: false,
                error: "ID inválido",
            });
            return;
        }

        const existing = await prisma.tecnico.findFirst({
            where: {
                id_tecnico: id,
                rol: "CLIENTE",
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
            },
        });

        if (!existing) {
            res.status(404).json({
                ok: false,
                error: "Cliente no encontrado",
            });
            return;
        }

        if (!existing.status) {
            res.json({
                ok: true,
                message: "El cliente ya estaba desactivado",
                data: existing,
            });
            return;
        }

        const cliente = await prisma.tecnico.update({
            where: {
                id_tecnico: id,
            },
            data: {
                status: false,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                rut: true,
                            },
                        },
                    },
                },
            },
        });

        await prisma.refreshToken.updateMany({
            where: {
                userId: id,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        res.json({
            ok: true,
            message: "Cliente desactivado correctamente",
            data: cliente,
        });
    } catch (error) {
        console.error("❌ Error deleteCliente:", error);

        res.status(500).json({
            ok: false,
            error: "Error al desactivar cliente",
        });
    }
}