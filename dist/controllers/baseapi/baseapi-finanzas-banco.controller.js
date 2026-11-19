// src/controllers/baseapi/baseapi-finanzas-banco.controller.ts
import { prisma } from "../../lib/prisma.js";
import { invalidarCacheCxc, obtenerCalculo } from "./baseapi-finanzas-cxc.controller.js";
import { CartolaError } from "../../service/baseapi/finanzas/cartola-itau.parser.js";
import { AbonoCxcError } from "../../service/baseapi/finanzas/cxc-abonos.service.js";
import { BancoError, confirmarMovimiento, confirmarPerfectos, descartarMovimiento, deshacerMovimiento, importarCartola, listarMovimientos, restaurarMovimiento, } from "../../service/baseapi/finanzas/conciliacion-bancaria.service.js";
function parseEmpresa(value) {
    const empresa = String(value ?? "").trim().toLowerCase();
    if (empresa !== "rids" && empresa !== "econnet")
        throw new BancoError("Empresa inválida. Usa empresa=rids o empresa=econnet.");
    return empresa;
}
function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0)
        throw new BancoError("ID de movimiento inválido.");
    return id;
}
async function docsEmpresa(empresaKey, refrescar = false) {
    return (await obtenerCalculo(empresaKey, refrescar)).data.documentos;
}
async function responsable(req) {
    const user = req.user;
    if (user?.id) {
        const tecnico = await prisma.tecnico.findUnique({ where: { id_tecnico: user.id }, select: { nombre: true } });
        if (tecnico?.nombre)
            return tecnico.nombre;
    }
    return user?.nombre ?? user?.email ?? (user?.id ? `usuario:${user.id}` : null);
}
function responderError(res, error) {
    const message = error instanceof Error ? error.message : String(error);
    const esValidacion = error instanceof BancoError || error instanceof CartolaError || error instanceof AbonoCxcError;
    if (!esValidacion)
        console.error("[FINANZAS BANCO] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}
const body = (req) => (req.body ?? {});
export async function postImportarCartola(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa ?? body(req).empresa);
        const archivo = req.file;
        if (!archivo?.buffer?.length)
            throw new BancoError("Adjunta el archivo de la cartola (campo «archivo»).");
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
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function getMovimientosBanco(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const refrescar = req.query.refrescar === "1" || req.query.refrescar === "true";
        const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde ?? "")) ? String(req.query.desde) : null;
        const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.hasta ?? "")) ? String(req.query.hasta) : null;
        const data = await listarMovimientos({ empresaKey, docs: await docsEmpresa(empresaKey, refrescar), desde, hasta });
        return res.json({ ok: true, data });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postConfirmarMovimiento(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        const asignaciones = Array.isArray(body(req).asignaciones) ? body(req).asignaciones : [];
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
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postConfirmarPerfectos(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        const ids = Array.isArray(body(req).ids) ? body(req).ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
        const data = await confirmarPerfectos({ empresaKey, ids, docs: await docsEmpresa(empresaKey, true), responsable: await responsable(req) });
        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postDeshacerMovimiento(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        await deshacerMovimiento({ empresaKey, movimientoId: parseId(req.params.id), docs: await docsEmpresa(empresaKey) });
        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postDescartarMovimiento(req, res) {
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
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postRestaurarMovimiento(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        await restaurarMovimiento({ empresaKey, movimientoId: parseId(req.params.id) });
        return res.json({ ok: true });
    }
    catch (error) {
        return responderError(res, error);
    }
}
//# sourceMappingURL=baseapi-finanzas-banco.controller.js.map