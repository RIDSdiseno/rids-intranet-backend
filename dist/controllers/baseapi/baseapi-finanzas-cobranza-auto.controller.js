// src/controllers/baseapi/baseapi-finanzas-cobranza-auto.controller.ts
import { prisma } from "../../lib/prisma.js";
import { calendarioCobranzaCxc, procesarCobranzaAutomatica, } from "../../service/baseapi/cobranza/cobranza-automatico.service.js";
import { procesarEnviosCobranza } from "../../service/baseapi/cobranza/cobranza-envio.service.js";
import { CobranzaPanelError, REGLAS_FIJAS_COBRANZA, actualizarConfigCobranza, cancelarRecordatorioCobranza, listarColaCobranza, obtenerConfigCobranza, } from "../../service/baseapi/cobranza/cobranza-panel.service.js";
function parseEmpresa(value) {
    const empresa = String(value ?? "").trim().toLowerCase();
    if (empresa !== "rids" && empresa !== "econnet")
        throw new CobranzaPanelError("Empresa inválida. Usa empresa=rids o empresa=econnet.");
    return empresa;
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
    const esValidacion = error instanceof CobranzaPanelError;
    if (!esValidacion)
        console.error("[FINANZAS COBRANZA AUTO] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}
const body = (req) => (req.body ?? {});
export async function getConfigCobranzaAuto(_req, res) {
    try {
        return res.json({ ok: true, data: { empresas: await obtenerConfigCobranza(), reglas: REGLAS_FIJAS_COBRANZA } });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function patchConfigCobranzaAuto(req, res) {
    try {
        const empresaKey = parseEmpresa(req.params.empresa);
        const config = await actualizarConfigCobranza(empresaKey, body(req));
        console.log("[FINANZAS COBRANZA AUTO] Configuración actualizada", { empresaKey, por: await responsable(req), cambios: body(req) });
        return res.json({ ok: true, data: config });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function getCalendarioCobranzaAuto(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const diasRaw = Number(req.query.dias ?? 7);
        const dias = Number.isInteger(diasRaw) ? Math.max(0, Math.min(diasRaw, 14)) : 7;
        return res.json({ ok: true, data: { empresaKey, dias: await calendarioCobranzaCxc(empresaKey, dias) } });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function getColaCobranzaAuto(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const estado = String(req.query.estado ?? "").trim().toUpperCase();
        const data = await listarColaCobranza({
            empresaKey,
            desde: String(req.query.desde ?? ""),
            hasta: String(req.query.hasta ?? ""),
            ...(estado ? { estado } : {}),
        });
        return res.json({ ok: true, data });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postPrepararCobranzaAuto(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        console.log("[FINANZAS COBRANZA AUTO] Preparar a mano", { empresaKey, por: await responsable(req) });
        const resultado = await procesarCobranzaAutomatica({ empresas: [empresaKey], registrarPendientes: true });
        const r = resultado.empresas[0];
        if (r?.error)
            throw new CobranzaPanelError(r.error);
        return res.json({
            ok: true,
            data: {
                activa: r?.activa ?? false,
                candidatos: r?.candidatos ?? 0,
                conDestinatario: r?.candidatosConDestinatario ?? 0,
                yaEnviados: r?.yaEnviados ?? 0,
                pendientesEnvio: r?.pendientesEnvio ?? 0,
            },
        });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postEnviarCobranzaAuto(req, res) {
    try {
        const empresaKey = parseEmpresa(body(req).empresa);
        console.log("[FINANZAS COBRANZA AUTO] Enviar a mano", { empresaKey, por: await responsable(req) });
        return res.json({ ok: true, data: await procesarEnviosCobranza({ empresa: empresaKey, limite: 100 }) });
    }
    catch (error) {
        return responderError(res, error);
    }
}
export async function postCancelarRecordatorioCobranzaAuto(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0)
            throw new CobranzaPanelError("ID de recordatorio inválido.");
        await cancelarRecordatorioCobranza(id, await responsable(req));
        return res.json({ ok: true });
    }
    catch (error) {
        return responderError(res, error);
    }
}
//# sourceMappingURL=baseapi-finanzas-cobranza-auto.controller.js.map