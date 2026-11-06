// src/controllers/controllers-leypd/leypd-actualizacion.controller.ts
import { cancelarActualizacionLeypd, crearActualizacionLeypd, obtenerActualizacionLeypd, obtenerActualizacionActivaLeypd, obtenerUltimaActualizacionLeypd, } from "../../service/leypd/leypd-actualizacion.service.js";
import { actualizacionIdSchema, crearActualizacionLeypdSchema } from "../../service/leypd/leypd.schemas.js";
/* =====================================================
   CREAR
===================================================== */
export async function postActualizacionLeypd(req, res) {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) {
        return res
            .status(401)
            .json({
            message: "Usuario no autenticado.",
        });
    }
    const body = crearActualizacionLeypdSchema.safeParse(req.body ?? {});
    if (!body.success) {
        return res
            .status(400)
            .json({
            message: "Empresa inválida.",
        });
    }
    try {
        const job = await crearActualizacionLeypd(tecnicoId, body.data.empresaId);
        return res
            .status(201)
            .json(job);
    }
    catch (error) {
        if (error instanceof
            Error &&
            error.message ===
                "ACTUALIZACION_EN_CURSO") {
            return res
                .status(409)
                .json({
                message: "Ya existe una actualización Ley PD pendiente o en ejecución.",
            });
        }
        if (error instanceof
            Error &&
            error.message ===
                "EMPRESA_SIN_CARPETA_LEYPD") {
            return res
                .status(400)
                .json({
                message: "La empresa no tiene carpeta LEYPD vinculada en SharePoint.",
            });
        }
        console.error("[LEYPD ACTUALIZACION]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo crear la actualización.",
        });
    }
}
/* =====================================================
   OBTENER
===================================================== */
export async function getActualizacionLeypd(req, res) {
    const parsed = actualizacionIdSchema.safeParse(req.params.id);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID inválido.",
        });
    }
    try {
        return res.json(await obtenerActualizacionLeypd(parsed.data));
    }
    catch (error) {
        if (error instanceof
            Error &&
            error.message ===
                "ACTUALIZACION_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                message: "Actualización no encontrada.",
            });
        }
        return res
            .status(500)
            .json({
            message: "No se pudo obtener la actualización.",
        });
    }
}
/* =====================================================
   ACTIVA
===================================================== */
export async function getActualizacionActivaLeypd(_req, res) {
    try {
        return res.json({
            actualizacion: await obtenerActualizacionActivaLeypd(),
        });
    }
    catch (error) {
        console.error("[LEYPD ACTUALIZACION]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo consultar la actualización activa.",
        });
    }
}
/* =====================================================
   ÚLTIMA
===================================================== */
export async function getUltimaActualizacionLeypd(_req, res) {
    try {
        return res.json({
            actualizacion: await obtenerUltimaActualizacionLeypd(),
        });
    }
    catch (error) {
        console.error("[LEYPD ACTUALIZACION]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo consultar la última actualización.",
        });
    }
}
/* =====================================================
   CANCELAR
===================================================== */
export async function postCancelarActualizacionLeypd(req, res) {
    const parsed = actualizacionIdSchema.safeParse(req.params.id);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID inválido.",
        });
    }
    try {
        return res.json(await cancelarActualizacionLeypd(parsed.data));
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message ===
                "ACTUALIZACION_NO_ENCONTRADA") {
                return res
                    .status(404)
                    .json({
                    message: "Actualización no encontrada.",
                });
            }
            if (error.message ===
                "ACTUALIZACION_NO_CANCELABLE") {
                return res
                    .status(409)
                    .json({
                    message: "Solo se puede cancelar una actualización en cola o en ejecución.",
                });
            }
        }
        console.error("[LEYPD ACTUALIZACION]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo cancelar la actualización.",
        });
    }
}
//# sourceMappingURL=leypd-actualizacion.controller.js.map