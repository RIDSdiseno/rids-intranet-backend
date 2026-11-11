// src/controllers/controllers-oportunidades/oportunidades-documentos.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";

import {
    listarDocumentosOportunidad,
    subirDocumentoOportunidad,
    obtenerUrlDocumentoOportunidad,
    eliminarDocumentoOportunidad,
    DocumentoOportunidadError,
    TIPOS_DOCUMENTO_OPORTUNIDAD,
} from "../../service/oportunidades/oportunidades-documentos.service.js";

import { OportunidadNoEncontradaError } from "../../service/oportunidades/oportunidades.service.js";

/* =========================================================
   VALIDACIONES
========================================================= */

const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const documentoParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    documentoId: z.coerce.number().int().positive(),
});

/* multipart: los campos llegan como texto */
const subirDocumentoSchema = z.object({
    tipo: z
        .enum(TIPOS_DOCUMENTO_OPORTUNIDAD, { message: "Tipo de documento inválido." })
        .optional()
        .default("OTRO"),
    descripcion: z
        .string()
        .trim()
        .max(500, "La descripción no puede superar 500 caracteres.")
        .optional()
        .transform((v) => v || null),
});

function getActorId(req: Request): number | null {
    const user = (req as any).user;
    return user?.id ? Number(user.id) : null;
}

function manejarError(err: unknown, res: Response) {
    if (err instanceof OportunidadNoEncontradaError) {
        return res.status(404).json({
            success: false,
            code: "OPORTUNIDAD_NO_ENCONTRADA",
            message: err.message,
        });
    }

    if (err instanceof DocumentoOportunidadError) {
        return res.status(err.status).json({
            success: false,
            code: err.code,
            message: err.message,
        });
    }

    console.error("[oportunidades][documentos]", err);

    return res.status(500).json({
        success: false,
        code: "ERROR_INTERNO",
        message: "Error inesperado al procesar el documento.",
    });
}

/* =========================================================
   GET /oportunidades/:id/documentos
========================================================= */

export async function listarDocumentosController(req: Request, res: Response) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    try {
        const data = await listarDocumentosOportunidad(params.data.id);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        return manejarError(err, res);
    }
}

/* =========================================================
   POST /oportunidades/:id/documentos   (multipart: archivo, tipo, descripcion)
========================================================= */

export async function subirDocumentoController(req: Request, res: Response) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    if (!req.file) {
        return res.status(400).json({
            success: false,
            code: "ARCHIVO_REQUERIDO",
            message: "Debes adjuntar un archivo PDF.",
        });
    }

    const body = subirDocumentoSchema.safeParse(req.body ?? {});
    if (!body.success) {
        return res.status(400).json({
            success: false,
            code: "DATOS_INVALIDOS",
            message: body.error.issues[0]?.message ?? "Datos inválidos.",
        });
    }

    try {
        const data = await subirDocumentoOportunidad(
            params.data.id,
            getActorId(req),
            req.file,
            body.data,
        );

        return res.status(201).json({ success: true, data });
    } catch (err) {
        return manejarError(err, res);
    }
}

/* =========================================================
   GET /oportunidades/:id/documentos/:documentoId?descargar=1
========================================================= */

export async function obtenerDocumentoController(req: Request, res: Response) {
    const params = documentoParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    const descargar = String(req.query.descargar ?? "") === "1";

    try {
        const data = await obtenerUrlDocumentoOportunidad(
            params.data.id,
            params.data.documentoId,
            descargar,
        );

        return res.status(200).json({ success: true, data });
    } catch (err) {
        return manejarError(err, res);
    }
}

/* =========================================================
   DELETE /oportunidades/:id/documentos/:documentoId
========================================================= */

export async function eliminarDocumentoController(req: Request, res: Response) {
    const params = documentoParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ success: false, code: "ID_INVALIDO" });

    try {
        const data = await eliminarDocumentoOportunidad(params.data.id, params.data.documentoId);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        return manejarError(err, res);
    }
}