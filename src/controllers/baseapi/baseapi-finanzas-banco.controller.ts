// src/controllers/baseapi/baseapi-finanzas-banco.controller.ts

/* =========================================================
   CONCILIACIÓN BANCARIA (Fase 4b)

   POST   /baseapi/finanzas/banco/importar?empresa&aplicar=1     (multipart, campo «archivo»)
          Sin aplicar: vista previa (filas leídas, duplicados, descartes automáticos). Con aplicar=1: guarda.
   GET    /baseapi/finanzas/banco/movimientos?empresa[&desde&hasta&refrescar=1]
          Movimientos con su propuesta de cruce (pendientes) o sus facturas (conciliados).
   POST   /baseapi/finanzas/banco/movimientos/:id/confirmar      { empresa, asignaciones: [{ tipoDoc, folio, rutContraparte, monto }] }
   POST   /baseapi/finanzas/banco/movimientos/confirmar-perfectos { empresa, ids?: number[] }
   POST   /baseapi/finanzas/banco/movimientos/:id/deshacer       { empresa }
   POST   /baseapi/finanzas/banco/movimientos/:id/descartar      { empresa, motivo, observacion? }
   POST   /baseapi/finanzas/banco/movimientos/:id/restaurar      { empresa }

   Las facturas salen del mismo cálculo (y caché) de cuentas por cobrar. Lo que crea abonos invalida la caché.
   ========================================================= */

import type { Request, Response } from "express";

import { prisma } from "../../lib/prisma.js";

import type { EmpresaKey } from "../../service/baseapi/cobranza/cobranza-estado.service.js";

import { invalidarCacheCxc, obtenerCalculo } from "./baseapi-finanzas-cxc.controller.js";

import { CartolaError } from "../../service/baseapi/finanzas/cartola-itau.parser.js";
import { AbonoCxcError } from "../../service/baseapi/finanzas/cxc-abonos.service.js";
import {
    BancoError,
    confirmarMovimiento,
    confirmarPerfectos,
    descartarMovimiento,
    deshacerMovimiento,
    importarCartola,
    listarMovimientos,
    restaurarMovimiento,
} from "../../service/baseapi/finanzas/conciliacion-bancaria.service.js";

function parseEmpresa(value: unknown): EmpresaKey {
    const empresa = String(value ?? "").trim().toLowerCase();
    if (empresa !== "rids" && empresa !== "econnet") throw new BancoError("Empresa inválida. Usa empresa=rids o empresa=econnet.");
    return empresa;
}

function parseId(value: unknown) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BancoError("ID de movimiento inválido.");
    return id;
}

async function docsEmpresa(empresaKey: EmpresaKey, refrescar = false) {
    return (await obtenerCalculo(empresaKey, refrescar)).data.documentos;
}

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
    const esValidacion = error instanceof BancoError || error instanceof CartolaError || error instanceof AbonoCxcError;
    if (!esValidacion) console.error("[FINANZAS BANCO] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}

const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

export async function postImportarCartola(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa ?? body(req).empresa);
        const archivo = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file;
        if (!archivo?.buffer?.length) throw new BancoError("Adjunta el archivo de la cartola (campo «archivo»).");

        const aplicar = req.query.aplicar === "1" || req.query.aplicar === "true";
        const omitirPosibles = req.query.omitirPosibles === "1" || req.query.omitirPosibles === "true";
        const data = await importarCartola({
            empresaKey,
            buffer: archivo.buffer,
            archivo: archivo.originalname ?? null,
            responsable: await responsable(req),
            aplicar,
            omitirPosibles,
        });

        if (aplicar) {
            console.log("[FINANZAS BANCO] Cartola importada", {
                empresa: empresaKey,
                archivo: archivo.originalname,
                nuevos: data.nuevos,
                duplicados: data.duplicados,
                posiblesDuplicados: data.posiblesDuplicados,
                omitidos: data.omitidos,
            });
        }
        return res.json({ ok: true, data });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function getMovimientosBanco(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const refrescar = req.query.refrescar === "1" || req.query.refrescar === "true";
        const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde ?? "")) ? String(req.query.desde) : null;
        const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.hasta ?? "")) ? String(req.query.hasta) : null;

        const data = await listarMovimientos({ empresaKey, docs: await docsEmpresa(empresaKey, refrescar), desde, hasta });
        return res.json({ ok: true, data });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postConfirmarMovimiento(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        const asignaciones = Array.isArray(body(req).asignaciones) ? (body(req).asignaciones as Array<Record<string, unknown>>) : [];

        const data = await confirmarMovimiento({
            empresaKey,
            movimientoId: parseId(req.params.id),
            asignaciones: asignaciones.map((a) => ({
                tipoDoc: String(a.tipoDoc ?? ""),
                folio: String(a.folio ?? ""),
                rutContraparte: String(a.rutContraparte ?? ""),
                monto: Number(a.monto),
            })),
            docs: await docsEmpresa(empresaKey),
            responsable: await responsable(req),
        });

        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postConfirmarPerfectos(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        const ids = Array.isArray(body(req).ids) ? (body(req).ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];

        const data = await confirmarPerfectos({ empresaKey, ids, docs: await docsEmpresa(empresaKey, true), responsable: await responsable(req) });

        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postDeshacerMovimiento(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        await deshacerMovimiento({ empresaKey, movimientoId: parseId(req.params.id), docs: await docsEmpresa(empresaKey) });

        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postDescartarMovimiento(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        await descartarMovimiento({
            empresaKey,
            movimientoId: parseId(req.params.id),
            motivo: String(body(req).motivo ?? ""),
            observacion: body(req).observacion ? String(body(req).observacion).trim() || null : null,
            responsable: await responsable(req),
        });
        return res.json({ ok: true });
    } catch (error) {
        return responderError(res, error);
    }
}

export async function postRestaurarMovimiento(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        await restaurarMovimiento({ empresaKey, movimientoId: parseId(req.params.id) });
        return res.json({ ok: true });
    } catch (error) {
        return responderError(res, error);
    }
}