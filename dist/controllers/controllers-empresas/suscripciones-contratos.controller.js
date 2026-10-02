import { actualizarSuscripcionEmpresa, crearSuscripcionEmpresa, eliminarContratoSuscripcion, eliminarSuscripcionEmpresa, listarSuscripcionesEmpresa, obtenerContratoSuscripcion, obtenerSuscripcionEmpresa, subirContratoSuscripcion, } from "../../service/suscripciones-contratos/suscripciones-contratos.service.js";
function getId(value) {
    const id = Number(value);
    return Number.isInteger(id) &&
        id >
            0
        ? id
        : null;
}
/* =========================================================
   LISTAR
========================================================= */
export async function listarSuscripciones(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        if (!empresaId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "empresaId inválido",
            });
        }
        const data = await listarSuscripcionesEmpresa(empresaId);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("Error listando suscripciones:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "No fue posible listar las suscripciones.",
        });
    }
}
/* =========================================================
   OBTENER
========================================================= */
export async function obtenerSuscripcion(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        const data = await obtenerSuscripcionEmpresa(empresaId, suscripcionId);
        if (!data) {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Suscripción no encontrada.",
            });
        }
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error(error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "Error obteniendo la suscripción.",
        });
    }
}
/* =========================================================
   CREAR
========================================================= */
export async function crearSuscripcion(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        if (!empresaId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "empresaId inválido.",
            });
        }
        const data = await crearSuscripcionEmpresa(empresaId, req.body);
        return res
            .status(201)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof
            Error
            ? error.message
            : "";
        if (message ===
            "EMPRESA_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Empresa no encontrada.",
            });
        }
        if (message ===
            "DATOS_OBLIGATORIOS") {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Proveedor, fabricante y producto/plan son obligatorios.",
            });
        }
        console.error(error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "Error creando la suscripción.",
        });
    }
}
/* =========================================================
   ACTUALIZAR
========================================================= */
export async function actualizarSuscripcion(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        const data = await actualizarSuscripcionEmpresa(empresaId, suscripcionId, req.body);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof
            Error
            ? error.message
            : "";
        if (message ===
            "SUSCRIPCION_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Suscripción no encontrada.",
            });
        }
        if (message ===
            "DATOS_OBLIGATORIOS") {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Proveedor, fabricante y producto/plan son obligatorios.",
            });
        }
        console.error("Error actualizando suscripción:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "Error actualizando la suscripción.",
        });
    }
}
/* =========================================================
   ELIMINAR
========================================================= */
export async function eliminarSuscripcion(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        await eliminarSuscripcionEmpresa(empresaId, suscripcionId);
        return res.json({
            ok: true,
        });
    }
    catch (error) {
        if (error instanceof
            Error &&
            error.message ===
                "SUSCRIPCION_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Suscripción no encontrada.",
            });
        }
        console.error(error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "Error eliminando la suscripción.",
        });
    }
}
/* =========================================================
   SUBIR CONTRATO PDF
========================================================= */
export async function subirContrato(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        if (!req.file) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Debes adjuntar un archivo PDF.",
            });
        }
        const data = await subirContratoSuscripcion(empresaId, suscripcionId, req.file);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "";
        if (message ===
            "SUSCRIPCION_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Suscripción no encontrada.",
            });
        }
        if (message ===
            "ARCHIVO_NO_PDF") {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Solo se permiten contratos en formato PDF.",
            });
        }
        console.error("Error subiendo contrato:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "No fue posible subir el contrato.",
        });
    }
}
/* =========================================================
   VISUALIZAR / DESCARGAR CONTRATO
========================================================= */
export async function obtenerContrato(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        const data = await obtenerContratoSuscripcion(empresaId, suscripcionId);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "";
        if (message ===
            "SUSCRIPCION_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Suscripción no encontrada.",
            });
        }
        if (message ===
            "CONTRATO_NO_ENCONTRADO") {
            return res
                .status(404)
                .json({
                ok: false,
                error: "Esta suscripción no tiene contrato adjunto.",
            });
        }
        console.error("Error obteniendo contrato:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "No fue posible obtener el contrato.",
        });
    }
}
/* =========================================================
   ELIMINAR CONTRATO PDF
========================================================= */
export async function eliminarContrato(req, res) {
    try {
        const empresaId = getId(req.params
            .empresaId);
        const suscripcionId = getId(req.params
            .suscripcionId);
        if (!empresaId ||
            !suscripcionId) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Identificador inválido.",
            });
        }
        const data = await eliminarContratoSuscripcion(empresaId, suscripcionId);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "";
        if (message ===
            "SUSCRIPCION_NO_ENCONTRADA" ||
            message ===
                "CONTRATO_NO_ENCONTRADO") {
            return res
                .status(404)
                .json({
                ok: false,
                error: message ===
                    "SUSCRIPCION_NO_ENCONTRADA"
                    ? "Suscripción no encontrada."
                    : "Contrato no encontrado.",
            });
        }
        console.error("Error eliminando contrato:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "No fue posible eliminar el contrato.",
        });
    }
}
//# sourceMappingURL=suscripciones-contratos.controller.js.map