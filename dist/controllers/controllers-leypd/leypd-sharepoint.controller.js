// src/controllers/controllers-leypd/leypd-sharepoint.controller.ts
import { obtenerSharepointLeypd, sincronizarSharepointLeypd, vincularSharepointLeypd, sincronizarTodasSharepointLeypdEnSegundoPlano } from "../../service/leypd/leypd-sharepoint.service.js";
import { empresaIdSchema, vincularSharepointLeypdSchema, } from "../../service/leypd/leypd.schemas.js";
/* =====================================================
   ERRORES
===================================================== */
function responderErrorSharepoint(error, res) {
    const mensaje = error instanceof Error
        ? error.message
        : "";
    switch (mensaje) {
        case "EMPRESA_NO_ENCONTRADA":
            return res.status(404).json({
                code: mensaje,
                message: "Empresa no encontrada.",
            });
        case "SHAREPOINT_NO_VINCULADO":
            return res.status(409).json({
                code: mensaje,
                message: "La empresa aún no tiene una carpeta LEYPD vinculada.",
            });
        case "SHAREPOINT_URL_INVALIDA":
            return res.status(400).json({
                code: mensaje,
                message: "La URL no corresponde a una carpeta de SharePoint. Abre la carpeta LEYPD del cliente y copia la URL del navegador.",
            });
        case "SHAREPOINT_NO_ES_CARPETA":
            return res.status(400).json({
                code: mensaje,
                message: "La URL corresponde a un archivo, no a una carpeta.",
            });
        case "SHAREPOINT_NO_ENCONTRADO":
            return res.status(404).json({
                code: mensaje,
                message: "No se encontró la carpeta en SharePoint. Puede haberse eliminado o la URL es incorrecta.",
            });
        case "SHAREPOINT_SIN_PERMISOS":
            return res.status(502).json({
                code: mensaje,
                message: "La aplicación de Azure no tiene permisos para leer SharePoint (Sites.Read.All).",
            });
    }
    if (mensaje.startsWith("Token HTTP")) {
        console.error("[LEYPD SHAREPOINT] Token:", mensaje);
        return res.status(502).json({
            code: "SHAREPOINT_CREDENCIALES",
            message: "No se pudo autenticar con Microsoft. Revisa las credenciales de SharePoint (¿secret vencido?).",
        });
    }
    console.error("[LEYPD SHAREPOINT]", error);
    return res.status(502).json({
        code: "SHAREPOINT_ERROR",
        message: "No se pudo consultar SharePoint.",
    });
}
/* =====================================================
   HANDLERS
===================================================== */
export async function getSharepointLeypd(req, res) {
    const empresaId = empresaIdSchema.safeParse(req.params.empresaId);
    if (!empresaId.success) {
        return res.status(400).json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        return res.json(await obtenerSharepointLeypd(empresaId.data));
    }
    catch (error) {
        return responderErrorSharepoint(error, res);
    }
}
export async function postVincularSharepointLeypd(req, res) {
    const empresaId = empresaIdSchema.safeParse(req.params.empresaId);
    const body = vincularSharepointLeypdSchema.safeParse(req.body);
    if (!empresaId.success ||
        !body.success) {
        return res.status(400).json({
            message: "Debes indicar una URL de SharePoint válida.",
        });
    }
    try {
        const actorId = req
            .user?.id ?? null;
        return res.json(await vincularSharepointLeypd(empresaId.data, body.data.url, actorId));
    }
    catch (error) {
        return responderErrorSharepoint(error, res);
    }
}
export async function postSincronizarSharepointLeypd(req, res) {
    const empresaId = empresaIdSchema.safeParse(req.params.empresaId);
    if (!empresaId.success) {
        return res.status(400).json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        return res.json(await sincronizarSharepointLeypd(empresaId.data));
    }
    catch (error) {
        return responderErrorSharepoint(error, res);
    }
}
export function postSincronizarTodasSharepointLeypd(_req, res) {
    return res
        .status(202)
        .json(sincronizarTodasSharepointLeypdEnSegundoPlano());
}
//# sourceMappingURL=leypd-sharepoint.controller.js.map