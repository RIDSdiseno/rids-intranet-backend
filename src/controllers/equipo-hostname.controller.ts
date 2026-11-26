// src/controllers/equipo-hostname.controller.ts
import type { Request, Response } from "express";
import { obtenerHostnameSugerido } from "../service/equipos/hostname-sugerido.service.js";

/* GET /api/equipos/:id/hostname-sugerido (solo internos; solo lectura) */
export async function getHostnameSugerido(req: Request, res: Response) {
    const id = Number(req.params.id);

    const resultado = await obtenerHostnameSugerido(id);

    if (!resultado) {
        res.status(404).json({ ok: false, error: "Equipo no encontrado" });
        return;
    }

    res.json(resultado);
}