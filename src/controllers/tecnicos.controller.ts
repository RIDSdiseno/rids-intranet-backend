// src/controllers/tecnicos.controller.ts
import { prisma } from "../lib/prisma.js";
import type { Request, Response } from "express";

export async function listTecnicos(req: Request, res: Response) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
            },
            orderBy: { nombre: "asc" },
        });

        return res.status(200).json(tecnicos);
    } catch (error) {
        console.error("Error al listar técnicos:", error);
        return res.status(500).json({ error: "Error al listar técnicos" });
    }
}
