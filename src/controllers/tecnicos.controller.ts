// src/controllers/tecnicos.controller.ts
//import type { reseller_v1 } from "googleapis";
//import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import type { Request, Response } from "express";

// Listar técnicos
export async function listTecnicos(_req: Request, res: Response) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
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

// Actualizar técnico (nombre, email, status, rol)
export async function updateTecnico(req: Request, res: Response) {
    console.log(" updateTecnico body:", req.body);
    try {
        const id = Number(req.params.id);
        const { nombre, email, status, rol } =req.body;

        const tecnico = await prisma.tecnico.update({
            where: { id_tecnico: id },
            data: {
                ...(nombre && { nombre }),
                ...(email && { email }),
                ...(status !== undefined && { status}),
                ...(rol && { rol }),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
                rol: true,
            },
        })
        return res.json(tecnico);
    }catch (error) {
        console.error("Error al actualizar tecnico:", error);
        return res.status(500).json({ error: "Error al actualizar tecnico"});
    }
}

// Eliminar técnico (borrado físico)
export async function deleteTecnico(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        await prisma.refreshToken.deleteMany({
            where: { userId: id},
        });

        await prisma.tecnico.delete({
            where: { id_tecnico: id },
        });
        return res.json({ ok: true, message: "Técnico eliminado"});
    }catch (error) {
        console.error("Error al eliminar tecnico:", error);
        return res.status(500).json({ error: "Error al eliminar técnico" });
    }
}

// Crear técnico
export async function createTecnico(req: Request, res: Response) {
  try {
    const { nombre, email, password, rol, status } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Nombre, email y contraseña son requeridos" });
    }

    const exists = await prisma.tecnico.findUnique({
      where: { email: email.trim().toLowerCase() },
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
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        rol: rol ?? "TECNICO",
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