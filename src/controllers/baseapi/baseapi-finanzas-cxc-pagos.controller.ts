// src/controllers/baseapi/baseapi-finanzas-cxc-pagos.controller.ts

/* =========================================================
   PAGOS Y ABONOS DE FACTURAS (Fase 4a)

   GET    /baseapi/finanzas/cxc/pagos?empresa&tipoDoc&folio&rutContraparte
          Montos (total, NC, abonado, pendiente), conciliación y lista de abonos.

   POST   /baseapi/finanzas/cxc/pagos
          Body: { empresa, tipoDoc, folio, rutContraparte, monto, fechaPago (YYYY-MM-DD), formaPago?, observacion? }
          Si el abono completa el saldo, la factura queda conciliada (pagada).

   DELETE /baseapi/finanzas/cxc/pagos/:id?empresa&tipoDoc&folio&rutContraparte
          Si la factura estaba pagada, vuelve a quedar por cobrar.

   El documento sale del cálculo de cuentas por cobrar (no del body). Cada cambio invalida la caché.
   ========================================================= */

import type { Request, Response } from "express";

import { prisma } from "../../lib/prisma.js";

import { buscarDocumentoCxc, invalidarCacheCxc } from "./baseapi-finanzas-cxc.controller.js";

import {
    AbonoCxcError,
    eliminarAbonoCxc,
    obtenerPagosDocumentoCxc,
    registrarAbonoCxc,
} from "../../service/baseapi/finanzas/cxc-abonos.service.js";

async function resolverDocumento(origen: Record<string, unknown>) {
    const { empresaKey, documento } = await buscarDocumentoCxc({
        empresa: origen.empresa,
        tipoDoc: origen.tipoDoc,
        folio: origen.folio,
        rutContraparte: origen.rutContraparte,
    });

    if (!documento) {
        throw new AbonoCxcError("No se encontró la factura en cuentas por cobrar. Usa «Recalcular» e inténtalo de nuevo.");
    }

    return { empresaKey, documento };
}

/** Mismo criterio que la pantalla Conciliación: nombre del técnico/usuario o su email. */
async function responsable(req: Request): Promise<string | null> {
    const user = req.user as { id?: number; email?: string; nombre?: string } | undefined;

    if (user?.id) {
        const tecnico = await prisma.tecnico.findUnique({ where: { id_tecnico: user.id }, select: { nombre: true } });
        if (tecnico?.nombre) return tecnico.nombre;
    }

    return user?.nombre ?? user?.email ?? (user?.id ? `usuario:${user.id}` : null);
}

function responderError(res: Response, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const esValidacion = error instanceof AbonoCxcError || message.startsWith("Empresa inválida");

    if (!esValidacion) console.error("[FINANZAS CXC PAGOS] Error:", error);

    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}

export async function getPagosDocumentoCxc(req: Request, res: Response) {
    try {
        const { empresaKey, documento } = await resolverDocumento(req.query);
        return res.json({ ok: true, data: await obtenerPagosDocumentoCxc(empresaKey, documento) });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postAbonoCxc(req: Request, res: Response) {
    try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const { empresaKey, documento } = await resolverDocumento(body);

        const resultado = await registrarAbonoCxc({
            empresaKey,
            documento,
            monto: Number(body.monto),
            fechaPago: String(body.fechaPago ?? ""),
            formaPago: body.formaPago ? String(body.formaPago) : null,
            observacion: body.observacion ? String(body.observacion).trim() || null : null,
            responsable: await responsable(req),
            avisarCliente: body.avisarCliente === true,
        });

        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data: resultado });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function deleteAbonoCxc(req: Request, res: Response) {
    try {
        const { empresaKey, documento } = await resolverDocumento(req.query);
        const abonoId = Number(req.params.id);
        if (!Number.isInteger(abonoId) || abonoId <= 0) throw new AbonoCxcError("ID de abono inválido.");

        const resultado = await eliminarAbonoCxc({ empresaKey, documento, abonoId });

        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data: resultado });
    } catch (error) {
        return responderError(res, error);
    }
}