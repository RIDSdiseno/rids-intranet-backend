// src/controllers/controllers-empresas/empresa-logo.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";

import {
    EmpresaLogoNoEncontradaError,
    LogoEmpresaInvalidoError,
    eliminarLogoEmpresa,
    logoEmpresaPngParaPdf,
    obtenerLogoEmpresa,
    subirLogoEmpresa,
} from "../../service/empresas/empresa-logo.service.js";

const paramsSchema = z.object({
    empresaId: z.coerce.number().int().positive(),
});

function manejarError(error: unknown, res: Response, contexto: string) {
    if (error instanceof EmpresaLogoNoEncontradaError) {
        return res.status(404).json({ success: false, code: "EMPRESA_NO_ENCONTRADA", message: error.message });
    }
    if (error instanceof LogoEmpresaInvalidoError) {
        return res.status(400).json({ success: false, code: "LOGO_INVALIDO", message: error.message });
    }

    console.error(`[EMPRESA LOGO] ${contexto}:`, error);
    return res.status(500).json({ success: false, code: "ERROR_INTERNO", message: "No fue posible procesar el logo." });
}

/** GET /empresas-logo/:empresaId */
export async function obtenerLogoEmpresaController(req: Request, res: Response) {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    try {
        const data = await obtenerLogoEmpresa(params.data.empresaId);
        return res.json({ success: true, data });
    } catch (error) {
        return manejarError(error, res, "Obtener");
    }
}

/**
 * GET /empresas-logo/:empresaId/png
 * Logo de la empresa en PNG, para incrustarlo en documentos (Word IA).
 * Sin logo → 404 SIN_LOGO (el informe sale solo con el logo de RIDS).
 */
export async function obtenerLogoEmpresaPngController(req: Request, res: Response) {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    try {
        const png = await logoEmpresaPngParaPdf(params.data.empresaId);
        if (!png) {
            return res.status(404).json({ success: false, code: "SIN_LOGO", message: "La empresa no tiene logo." });
        }

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(png);
    } catch (error) {
        return manejarError(error, res, "Obtener PNG");
    }
}

/** PUT /empresas-logo/:empresaId (multipart, campo "archivo") */
export async function subirLogoEmpresaController(req: Request, res: Response) {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    const archivo = req.file;
    if (!archivo?.buffer) {
        return res.status(400).json({ success: false, code: "SIN_ARCHIVO", message: "No se envió ningún archivo." });
    }

    try {
        const data = await subirLogoEmpresa(params.data.empresaId, archivo.buffer);
        return res.json({ success: true, data });
    } catch (error) {
        return manejarError(error, res, "Subir");
    }
}

/** DELETE /empresas-logo/:empresaId */
export async function eliminarLogoEmpresaController(req: Request, res: Response) {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    try {
        const data = await eliminarLogoEmpresa(params.data.empresaId);
        return res.json({ success: true, data });
    } catch (error) {
        return manejarError(error, res, "Eliminar");
    }
}