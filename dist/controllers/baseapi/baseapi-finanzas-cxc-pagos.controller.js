// src/controllers/baseapi/baseapi-finanzas-cxc-pagos.controller.ts
import { prisma } from "../../lib/prisma.js";
import { buscarDocumentoCxc, invalidarCacheCxc } from "./baseapi-finanzas-cxc.controller.js";
import { AbonoCxcError, eliminarAbonoCxc, obtenerPagosDocumentoCxc, registrarAbonoCxc, } from "../../service/baseapi/finanzas/cxc-abonos.service.js";
async function resolverDocumento(origen) {
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
    const esValidacion = error instanceof AbonoCxcError || message.startsWith("Empresa inválida");
    if (!esValidacion)
        console.error("[FINANZAS CXC PAGOS] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}
export async function getPagosDocumentoCxc(req, res) {
    try {
        const { empresaKey, documento } = await resolverDocumento(req.query);
        return res.json({ ok: true, data: await obtenerPagosDocumentoCxc(empresaKey, documento) });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postAbonoCxc(req, res) {
    try {
        const body = (req.body ?? {});
        const { empresaKey, documento } = await resolverDocumento(body);
        const resultado = await registrarAbonoCxc({
            empresaKey,
            documento,
            monto: Number(body.monto),
            fechaPago: String(body.fechaPago ?? ""),
            formaPago: body.formaPago ? String(body.formaPago) : null,
            observacion: body.observacion ? String(body.observacion).trim() || null : null,
            responsable: await responsable(req),
        });
        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data: resultado });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function deleteAbonoCxc(req, res) {
    try {
        const { empresaKey, documento } = await resolverDocumento(req.query);
        const abonoId = Number(req.params.id);
        if (!Number.isInteger(abonoId) || abonoId <= 0)
            throw new AbonoCxcError("ID de abono inválido.");
        const resultado = await eliminarAbonoCxc({ empresaKey, documento, abonoId });
        invalidarCacheCxc(empresaKey);
        return res.json({ ok: true, data: resultado });
    }
    catch (error) {
        return responderError(res, error);
    }
}
//# sourceMappingURL=baseapi-finanzas-cxc-pagos.controller.js.map