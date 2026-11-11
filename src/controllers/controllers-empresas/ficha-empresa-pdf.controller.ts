// src/controllers/controllers-empresas/ficha-empresa-pdf.controller.ts
import type { Request, Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { generarFichaEmpresaPdf } from "../../service/empresas/ficha-empresa-pdf.service.js";

const ROLES_INTERNOS = new Set(["ADMIN", "ADMINISTRACION", "TECNICO"]);

/**
 * GET /api/ficha-empresa/:empresaId/pdf
 *
 * - Internos: ficha completa, con contraseñas y relación comercial.
 * - CLIENTE: solo su empresa (onlyOwnEmpresa), sin contraseñas
 *   ni relación comercial.
 */
export async function descargarFichaEmpresaPdf(req: Request, res: Response) {
    const empresaId = Number(req.params.empresaId);

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
        return res.status(400).json({ error: "empresaId inválido" });
    }

    const user = (req as any).user as
        | { id: number; rol: string; email?: string | null }
        | undefined;

    const esInterno = ROLES_INTERNOS.has(String(user?.rol ?? ""));

    try {
        const autor = user?.id
            ? await prisma.tecnico.findUnique({
                where: { id_tecnico: user.id },
                select: { nombre: true },
            })
            : null;

        const pdf = await generarFichaEmpresaPdf(empresaId, {
            incluirSecretos: esInterno,
            incluirRelacionComercial: esInterno,
            generadoPor: autor?.nombre ?? user?.email ?? null,
        });

        if (!pdf) {
            return res.status(404).json({ error: "Empresa no encontrada" });
        }

        if (esInterno) {
            /* Queda en los logs de Railway quién descargó credenciales */
            console.info(
                `[FICHA PDF] Usuario ${user?.id} (${user?.rol}) descargó la ficha con credenciales de la empresa ${empresaId}`,
            );
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${pdf.nombreArchivo}"`,
        );
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Length", String(pdf.buffer.length));

        return res.end(pdf.buffer);
    } catch (error) {
        console.error("Error generando PDF de ficha de empresa:", error);
        return res.status(500).json({ error: "No se pudo generar el PDF de la ficha" });
    }
}