import { obtenerConsentimientoPublico, obtenerDocumentoLeypdPublico, ProteccionDatosPublicError, responderConsentimientoPublico, revocarConsentimientoPublico, } from "../../service/proteccion-datos/proteccion-datos-publico.service.js";
/* =========================================================
   HELPERS REQUEST
   ========================================================= */
function obtenerIp(req) {
    return req.ip ||
        null;
}
function obtenerUserAgent(req) {
    const userAgent = req.get("user-agent");
    return userAgent
        ?.slice(0, 1000) ??
        null;
}
function obtenerToken(req) {
    const token = req.params.token;
    if (typeof token !==
        "string") {
        return "";
    }
    return token.trim();
}
/* =========================================================
   ERROR HANDLER PÚBLICO
   ========================================================= */
function responderErrorPublico(error, res, next) {
    if (error instanceof
        ProteccionDatosPublicError) {
        return res
            .status(error.statusCode)
            .json({
            ok: false,
            code: error.code,
            message: error.message,
        });
    }
    return next(error);
}
/* =========================================================
   GET
   /publico/:token
   ========================================================= */
export async function getConsentimientoPublico(req, res, next) {
    try {
        const token = obtenerToken(req);
        const data = await obtenerConsentimientoPublico(token, {
            ip: obtenerIp(req),
            userAgent: obtenerUserAgent(req),
        });
        return res
            .status(200)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        return responderErrorPublico(error, res, next);
    }
}
/* =========================================================
   GET
   /publico/:token/documento-leypd/:campo/:indice
   ========================================================= */
export async function getDocumentoLeypdPublico(req, res, next) {
    try {
        const token = obtenerToken(req);
        const campo = typeof req.params.campo ===
            "string"
            ? req.params.campo
            : "";
        const indice = Number(req.params.indice);
        if (!/^[a-z0-9_]+$/.test(campo) ||
            !Number.isInteger(indice) ||
            indice < 0 ||
            indice > 20) {
            return res
                .status(404)
                .json({
                ok: false,
                code: "DOCUMENTO_NO_DISPONIBLE",
                message: "El documento no está disponible",
            });
        }
        const documento = await obtenerDocumentoLeypdPublico(token, campo, indice, {
            ip: obtenerIp(req),
            userAgent: obtenerUserAgent(req),
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(documento.nombre)}`);
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res
            .status(200)
            .send(documento.contenido);
    }
    catch (error) {
        return responderErrorPublico(error, res, next);
    }
}
/* =========================================================
   POST
   /publico/:token/responder
   ========================================================= */
export async function postResponderConsentimientoPublico(req, res, next) {
    try {
        const token = obtenerToken(req);
        const input = {
            aceptado: req.body?.aceptado,
            respuestas: req.body?.respuestas,
        };
        const data = await responderConsentimientoPublico(token, input, {
            ip: obtenerIp(req),
            userAgent: obtenerUserAgent(req),
        });
        return res
            .status(200)
            .json({
            ok: true,
            message: "Tu respuesta fue registrada correctamente",
            data,
        });
    }
    catch (error) {
        return responderErrorPublico(error, res, next);
    }
}
/* =========================================================
   POST
   /publico/:token/revocar
   ========================================================= */
export async function postRevocarConsentimientoPublico(req, res, next) {
    try {
        const token = obtenerToken(req);
        const input = {
            motivo: typeof req.body?.motivo ===
                "string"
                ? req.body.motivo
                : null,
        };
        const data = await revocarConsentimientoPublico(token, input, {
            ip: obtenerIp(req),
            userAgent: obtenerUserAgent(req),
        });
        return res
            .status(200)
            .json({
            ok: true,
            message: "El consentimiento fue revocado correctamente",
            data,
        });
    }
    catch (error) {
        return responderErrorPublico(error, res, next);
    }
}
//# sourceMappingURL=proteccion-datos-publico.controller.js.map