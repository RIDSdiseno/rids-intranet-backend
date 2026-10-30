import { obtenerConsentimientoPublico, ProteccionDatosPublicError, responderConsentimientoPublico, revocarConsentimientoPublico, } from "../../service/proteccion-datos/proteccion-datos-publico.service.js";
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