// src/controllers/baseapi/baseapi-finanzas-clientes-cxc.controller.ts
import { invalidarCacheCxc, obtenerCalculo } from "./baseapi-finanzas-cxc.controller.js";
import { ClienteCxcError, eliminarContactoClienteCxc, guardarConfigClienteCxc, guardarContactoClienteCxc, listarClientesCxc, obtenerFichaClienteCxc, } from "../../service/baseapi/finanzas/clientes-cxc.service.js";
async function documentosAmbasEmpresas(refrescar) {
    const [rids, econnet] = await Promise.all([obtenerCalculo("rids", refrescar), obtenerCalculo("econnet", refrescar)]);
    return { rids: rids.data.documentos, econnet: econnet.data.documentos };
}
function responderError(res, error) {
    const message = error instanceof Error ? error.message : String(error);
    const esValidacion = error instanceof ClienteCxcError;
    if (!esValidacion)
        console.error("[FINANZAS CLIENTES CXC] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}
function parseBool(value) {
    return typeof value === "boolean" ? value : undefined;
}
export async function getClientesCxc(req, res) {
    try {
        const refrescar = req.query.refrescar === "1" || req.query.refrescar === "true";
        const clientes = await listarClientesCxc(await documentosAmbasEmpresas(refrescar));
        return res.json({ ok: true, data: { generadoAt: new Date().toISOString(), clientes } });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function getFichaClienteCxc(req, res) {
    try {
        const ficha = await obtenerFichaClienteCxc(String(req.params.rut ?? ""), await documentosAmbasEmpresas(false));
        return res.json({ ok: true, data: ficha });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function patchConfigClienteCxc(req, res) {
    try {
        const body = (req.body ?? {});
        let diasCredito;
        if (body.diasCredito === null || body.diasCredito === "")
            diasCredito = null;
        else if (body.diasCredito !== undefined)
            diasCredito = Number(body.diasCredito);
        const razonSocial = body.razonSocial === undefined ? undefined : body.razonSocial === null ? null : String(body.razonSocial);
        const recibeFacturas = parseBool(body.recibeFacturas);
        const recibeCobranza = parseBool(body.recibeCobranza);
        await guardarConfigClienteCxc(String(req.params.rut ?? ""), {
            ...(razonSocial !== undefined ? { razonSocial } : {}),
            ...(diasCredito !== undefined ? { diasCredito } : {}),
            ...(recibeFacturas !== undefined ? { recibeFacturas } : {}),
            ...(recibeCobranza !== undefined ? { recibeCobranza } : {}),
        });
        // Los días de crédito cambian los vencimientos de RIDS.
        if (diasCredito !== undefined)
            invalidarCacheCxc();
        const ficha = await obtenerFichaClienteCxc(String(req.params.rut ?? ""), await documentosAmbasEmpresas(false));
        return res.json({ ok: true, data: ficha });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function putContactoClienteCxc(req, res) {
    try {
        const body = (req.body ?? {});
        const principalFacturas = parseBool(body.principalFacturas);
        const principalCobranza = parseBool(body.principalCobranza);
        await guardarContactoClienteCxc(String(req.params.rut ?? ""), {
            emailOriginal: body.emailOriginal ? String(body.emailOriginal) : null,
            email: String(body.email ?? ""),
            nombre: body.nombre ? String(body.nombre) : null,
            facturas: body.facturas === true,
            cobranza: body.cobranza === true,
            ...(principalFacturas !== undefined ? { principalFacturas } : {}),
            ...(principalCobranza !== undefined ? { principalCobranza } : {}),
        });
        const ficha = await obtenerFichaClienteCxc(String(req.params.rut ?? ""), await documentosAmbasEmpresas(false));
        return res.json({ ok: true, data: ficha });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function deleteContactoClienteCxc(req, res) {
    try {
        await eliminarContactoClienteCxc(String(req.params.rut ?? ""), String(req.query.email ?? ""));
        const ficha = await obtenerFichaClienteCxc(String(req.params.rut ?? ""), await documentosAmbasEmpresas(false));
        return res.json({ ok: true, data: ficha });
    }
    catch (error) {
        return responderError(res, error);
    }
}
//# sourceMappingURL=baseapi-finanzas-clientes-cxc.controller.js.map