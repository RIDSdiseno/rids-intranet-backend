// src/controllers/baseapi/baseapi-finanzas-cxc-envios.controller.ts
import { buscarDocumentoCxc } from "./baseapi-finanzas-cxc.controller.js";
import { EnvioCxcError, enviarDocumentoCxc, obtenerOpcionesEnvioCxc, } from "../../service/baseapi/finanzas/cxc-envios.service.js";
function parseTipo(value) {
    const tipo = String(value ?? "").trim().toLowerCase();
    if (tipo !== "factura" && tipo !== "recordatorio") {
        throw new EnvioCxcError("Tipo de envío inválido. Usa tipo=factura o tipo=recordatorio.");
    }
    return tipo;
}
async function resolverDocumento(origen) {
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
function responderError(res, error) {
    const message = error instanceof Error ? error.message : String(error);
    const esValidacion = error instanceof EnvioCxcError || message.startsWith("Empresa inválida");
    if (!esValidacion)
        console.error("[FINANZAS CXC ENVÍOS] Error:", error);
    return res.status(esValidacion ? 400 : 500).json({ ok: false, error: message, message });
}
export async function getOpcionesEnvioCxc(req, res) {
    try {
        const tipo = parseTipo(req.query.tipo);
        const { empresaKey, documento } = await resolverDocumento(req.query);
        const data = await obtenerOpcionesEnvioCxc({ tipo, empresaKey, documento });
        return res.json({ ok: true, data });
    }
    catch (error) {
        return responderError(res, error);
    }
}
function enviar(tipo) {
    return async (req, res) => {
        try {
            const body = (req.body ?? {});
            const { empresaKey, documento } = await resolverDocumento(body);
            const emails = Array.isArray(body.emails) ? body.emails.map((e) => String(e ?? "")) : [];
            const user = req.user;
            const data = await enviarDocumentoCxc({
                tipo,
                empresaKey,
                documento,
                emails,
                usuario: user?.email ?? String(user?.id ?? "desconocido"),
            });
            return res.json({ ok: true, data });
        }
        catch (error) {
            return responderError(res, error);
        }
    };
}
export const postEnviarFacturaCxc = enviar("factura");
export const postEnviarRecordatorioCxc = enviar("recordatorio");
//# sourceMappingURL=baseapi-finanzas-cxc-envios.controller.js.map