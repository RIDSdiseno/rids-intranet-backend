// src/controllers/controllers-leypd/leypd-ficha.controller.ts
import { obtenerFichaLeypdInterna, guardarFichaLeypdInterna, generarEnlaceFichaLeypd, revocarEnlaceFichaLeypd, obtenerFichaLeypdPublica, guardarFichaLeypdPublica, enviarFichaLeypdPublica, obtenerFichaLeypdCliente, guardarFichaLeypdCliente, } from "../../service/leypd/leypd-ficha.service.js";
import { empresaIdSchema, guardarFichaLeypdSchema, guardarFichaPublicaLeypdSchema, enviarFichaPublicaLeypdSchema, tokenLeypdSchema, } from "../../service/leypd/leypd.schemas.js";
import { FichaLeypdValidacionError, } from "../../service/leypd/leypd-ficha-validacion.js";
/* =====================================================
   ERROR HANDLER
===================================================== */
function responderErrorFicha(error, res) {
    if (error instanceof
        FichaLeypdValidacionError) {
        switch (error.message) {
            case "EMPRESA_NO_ENCONTRADA":
                return res
                    .status(404)
                    .json({
                    message: "Empresa no encontrada.",
                });
            case "FICHA_NO_ENCONTRADA":
                return res
                    .status(404)
                    .json({
                    message: "Ficha no encontrada.",
                });
            case "TOKEN_INVALIDO":
                return res
                    .status(404)
                    .json({
                    message: "Enlace inválido.",
                });
            case "TOKEN_REVOCADO":
                return res
                    .status(410)
                    .json({
                    message: "El enlace fue revocado.",
                });
            case "TOKEN_EXPIRADO":
                return res
                    .status(410)
                    .json({
                    message: "El enlace expiró.",
                });
            case "FICHA_YA_ENVIADA":
                return res
                    .status(409)
                    .json({
                    code: "FICHA_YA_ENVIADA",
                    message: "Esta ficha ya fue enviada. Si necesitas modificarla, solicita a RIDS un nuevo enlace.",
                });
            case "FRONTEND_URL_NO_CONFIGURADO":
        }
    }
    console.error("[LEYPD FICHA]", error);
    return res
        .status(500)
        .json({
        message: "No se pudo completar la operación.",
    });
}
/* =====================================================
   INTERNO
===================================================== */
export async function getFichaLeypdInterna(req, res) {
    const parsed = empresaIdSchema.safeParse(req.params.empresaId);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        return res.json(await obtenerFichaLeypdInterna(parsed.data));
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function putFichaLeypdInterna(req, res) {
    const empresaId = empresaIdSchema.safeParse(req.params.empresaId);
    const body = guardarFichaLeypdSchema.safeParse(req.body);
    if (!empresaId.success ||
        !body.success) {
        return res
            .status(400)
            .json({
            message: "Datos inválidos.",
        });
    }
    try {
        const resultado = await guardarFichaLeypdInterna(empresaId.data, body.data.datos, req.user?.email ??
            null);
        return res.json(resultado);
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function postEnlaceFichaLeypd(req, res) {
    const parsed = empresaIdSchema.safeParse(req.params.empresaId);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        const resultado = await generarEnlaceFichaLeypd(parsed.data);
        return res
            .status(201)
            .json(resultado);
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function postRevocarEnlaceFichaLeypd(req, res) {
    const parsed = empresaIdSchema.safeParse(req.params.empresaId);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        const resultado = await revocarEnlaceFichaLeypd(parsed.data);
        return res.json(resultado);
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
/* =====================================================
   CLIENTE
===================================================== */
export async function getMiFichaLeypd(req, res) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) {
        return res
            .status(403)
            .json({
            message: "Tu cuenta no está asociada a una empresa.",
        });
    }
    try {
        return res.json(await obtenerFichaLeypdCliente(empresaId));
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function putMiFichaLeypd(req, res) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) {
        return res
            .status(403)
            .json({
            message: "Tu cuenta no está asociada a una empresa.",
        });
    }
    const body = guardarFichaLeypdSchema.safeParse(req.body);
    if (!body.success) {
        return res
            .status(400)
            .json({
            message: "Datos inválidos.",
            errors: body.error.flatten(),
        });
    }
    try {
        return res.json(await guardarFichaLeypdCliente(empresaId, body.data.datos, req.user?.email ??
            null));
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
/* =====================================================
   PÚBLICO
===================================================== */
export async function getFichaLeypdPublica(req, res) {
    const token = tokenLeypdSchema.safeParse(req.params.token);
    if (!token.success) {
        return res
            .status(404)
            .json({
            message: "Enlace inválido.",
        });
    }
    try {
        return res.json(await obtenerFichaLeypdPublica(token.data));
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function putFichaLeypdPublica(req, res) {
    const token = tokenLeypdSchema.safeParse(req.params.token);
    const body = guardarFichaPublicaLeypdSchema.safeParse(req.body);
    if (!token.success ||
        !body.success) {
        return res
            .status(400)
            .json({
            message: "Datos inválidos.",
        });
    }
    try {
        const resultado = await guardarFichaLeypdPublica(token.data, body.data.datos, body.data.nombre ??
            null);
        /*
         * No exponer la fila completa (tokenHash, ids)
         * a un usuario no autenticado.
         */
        return res.json({
            ok: true,
            updatedAt: resultado.updatedAt,
        });
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
export async function postEnviarFichaLeypdPublica(req, res) {
    const token = tokenLeypdSchema.safeParse(req.params.token);
    const body = enviarFichaPublicaLeypdSchema.safeParse(req.body);
    if (!token.success ||
        !body.success) {
        return res
            .status(400)
            .json({
            message: "Datos inválidos.",
            errors: body.success
                ? undefined
                : body.error.flatten(),
        });
    }
    try {
        const resultado = await enviarFichaLeypdPublica(token.data, body.data.datos, body.data.nombre);
        return res.json({
            ok: true,
            respondidoAt: resultado.respondidoAt,
        });
    }
    catch (error) {
        return responderErrorFicha(error, res);
    }
}
//# sourceMappingURL=leypd-ficha.controller.js.map