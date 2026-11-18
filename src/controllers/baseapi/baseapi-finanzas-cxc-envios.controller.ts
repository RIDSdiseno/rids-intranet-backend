// src/controllers/baseapi/baseapi-finanzas-cxc-envios.controller.ts

/* =========================================================
   ENVÍOS MANUALES DESDE LA PESTAÑA FACTURAS (Fase 2b)

   GET  /baseapi/finanzas/cxc/envios/opciones
        ?tipo=factura|recordatorio&empresa&tipoDoc&folio&rutContraparte
        Contactos del receptor, historial de envíos y modo (prueba / real / bloqueado).

   POST /baseapi/finanzas/cxc/envios/factura
   POST /baseapi/finanzas/cxc/envios/recordatorio
        Body: { empresa, tipoDoc, folio, rutContraparte, emails: string[] }

   Los datos del documento (montos, fechas, estado) salen del cálculo de cuentas por
   cobrar, no del body: el frontend solo indica qué factura y a quién.
   ========================================================= */

import type { Request, Response } from "express";

import { buscarDocumentoCxc } from "./baseapi-finanzas-cxc.controller.js";

import {
    EnvioCxcError,
    enviarDocumentoCxc,
    obtenerOpcionesEnvioCxc,
    type TipoEnvioCxc,
} from "../../service/baseapi/finanzas/cxc-envios.service.js";

function parseTipo(value: unknown): TipoEnvioCxc {
    const tipo = String(value ?? "").trim().toLowerCase();

    if (tipo !== "factura" && tipo !== "recordatorio") {
        throw new EnvioCxcError("Tipo de envío inválido. Usa tipo=factura o tipo=recordatorio.");
    }

    return tipo;
}

async function resolverDocumento(origen: Record<string, unknown>) {
    const { empresaKey, documento } = await buscarDocumentoCxc({
        empresa: origen.empresa,
        tipoDoc: origen.tipoDoc,
        folio: origen.folio,
        rutContraparte: origen.rutContraparte,
    });

    if (!documento) {
        throw new EnvioCxcError("No se encontró la factura en cuentas por cobrar. Usa «Recalcular» e inténtalo de nuevo.");
    }

    return { empresaKey, documento };
}

function responderError(res: Response, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const esValidacion = error instanceof EnvioCxcError || message.startsWith("Empresa inválida");

    if (!esValidacion) console.error("[FINANZAS CXC ENVÍOS] Error:", error);

    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}

export async function getOpcionesEnvioCxc(req: Request, res: Response) {
    try {
        const tipo = parseTipo(req.query.tipo);
        const { empresaKey, documento } = await resolverDocumento(req.query);
        const data = await obtenerOpcionesEnvioCxc({ tipo, empresaKey, documento });

        return res.json({ ok: true, data });
    } catch (error) {
        return responderError(res, error);
    }
}

function enviar(tipo: TipoEnvioCxc) {
    return async (req: Request, res: Response) => {
        try {
            const body = (req.body ?? {}) as Record<string, unknown>;
            const { empresaKey, documento } = await resolverDocumento(body);
            const emails = Array.isArray(body.emails) ? body.emails.map((e) => String(e ?? "")) : [];
            const user = req.user as { id?: number; email?: string } | undefined;

            const data = await enviarDocumentoCxc({
                tipo,
                empresaKey,
                documento,
                emails,
                usuario: user?.email ?? String(user?.id ?? "desconocido"),
            });

            return res.json({ ok: true, data });
        } catch (error) {
            return responderError(res, error);
        }
    };
}

export const postEnviarFacturaCxc = enviar("factura");
export const postEnviarRecordatorioCxc = enviar("recordatorio");