// src/controllers/controllers-proteccion-datos/proteccion-datos.controller.ts
import { EstadoCampaniaProteccionDatos, } from "@prisma/client";
import { activarCampaniaProteccionDatos, actualizarCampaniaProteccionDatos, cancelarCampaniaProteccionDatos, crearCampaniaProteccionDatos, finalizarCampaniaProteccionDatos, listarCampaniasProteccionDatos, obtenerCampaniaProteccionDatos, } from "../../service/proteccion-datos/proteccion-datos.service.js";
import { agregarDestinatariosCampania, listarDestinatariosCampania, quitarDestinatarioCampania, listarEventosConsentimiento } from "../../service/proteccion-datos/proteccion-datos-destinatarios.service.js";
import { enviarCampaniaProteccionDatos, } from "../../service/proteccion-datos/proteccion-datos-email.service.js";
import { subirDocumentoProteccionDatos, } from "../../service/proteccion-datos/proteccion-datos-documentos.service.js";
/* =========================================================
   HELPERS
   ========================================================= */
function parseId(value, nombre = "ID") {
    const id = Number(value);
    if (!Number.isInteger(id) ||
        id <= 0) {
        throw new Error(`${nombre} inválido`);
    }
    return id;
}
/* =========================================================
   FECHAS
   ========================================================= */
function parseFecha(value, nombre) {
    if (value === null ||
        value === "") {
        return null;
    }
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new Error(`${nombre} no es válida`);
        }
        return value;
    }
    if (typeof value !==
        "string") {
        throw new Error(`${nombre} no es válida`);
    }
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) {
        throw new Error(`${nombre} no es válida`);
    }
    return fecha;
}
/* =========================================================
   ESTADO
   ========================================================= */
function parseEstadoCampania(value) {
    if (value === undefined ||
        value === null ||
        value === "") {
        return undefined;
    }
    if (typeof value !==
        "string") {
        throw new Error("Estado de campaña inválido");
    }
    if (!Object.values(EstadoCampaniaProteccionDatos).includes(value)) {
        throw new Error("Estado de campaña inválido");
    }
    return value;
}
/* =========================================================
   PAGINACIÓN
   ========================================================= */
function parseNumeroQueryOpcional(value, nombre, min = 0) {
    if (value === undefined ||
        value === null ||
        value === "") {
        return undefined;
    }
    if (typeof value !==
        "string") {
        throw new Error(`${nombre} inválido`);
    }
    const numero = Number(value);
    if (!Number.isInteger(numero) ||
        numero < min) {
        throw new Error(`${nombre} inválido`);
    }
    return numero;
}
/* =========================================================
   LISTAR CAMPAÑAS
   ========================================================= */
export async function getCampaniasProteccionDatos(req, res, next) {
    try {
        const estado = parseEstadoCampania(req.query.estado);
        const search = typeof req.query.search ===
            "string"
            ? req.query.search.trim()
            : undefined;
        const skip = parseNumeroQueryOpcional(req.query.skip, "skip");
        const take = parseNumeroQueryOpcional(req.query.take, "take");
        const params = {};
        if (estado !==
            undefined) {
            params.estado =
                estado;
        }
        if (search) {
            params.search =
                search;
        }
        if (skip !==
            undefined) {
            params.skip =
                skip;
        }
        if (take !==
            undefined) {
            params.take =
                take;
        }
        const data = await listarCampaniasProteccionDatos(params);
        return res
            .status(200)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   OBTENER CAMPAÑA
   ========================================================= */
export async function getCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const data = await obtenerCampaniaProteccionDatos(id);
        return res
            .status(200)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   CREAR CAMPAÑA
   ========================================================= */
export async function postCampaniaProteccionDatos(req, res, next) {
    try {
        const body = req.body ??
            {};
        const input = {
            nombre: body.nombre,
            tituloDocumento: body.tituloDocumento,
            versionDocumento: body.versionDocumento,
            contenidoHtml: body.contenidoHtml,
            asuntoCorreo: body.asuntoCorreo,
            cuerpoCorreoHtml: body.cuerpoCorreoHtml,
        };
        /* =====================================================
           DESCRIPCIÓN
           ===================================================== */
        if (body.descripcion !==
            undefined) {
            input.descripcion =
                body.descripcion;
        }
        /* =====================================================
           CONFIGURACIÓN
           ===================================================== */
        if (body.configuracionConsentimiento !==
            undefined) {
            input.configuracionConsentimiento =
                body.configuracionConsentimiento;
        }
        /* =====================================================
           FECHA INICIO
           ===================================================== */
        if (body.fechaInicio !==
            undefined) {
            const fechaInicio = parseFecha(body.fechaInicio, "fechaInicio");
            /*
             * Entramos aquí solo si el campo
             * efectivamente vino en el body.
             *
             * Por tanto esperamos Date o null.
             */
            if (fechaInicio !==
                undefined) {
                input.fechaInicio =
                    fechaInicio;
            }
        }
        /* =====================================================
           FECHA FIN
           ===================================================== */
        if (body.fechaFin !==
            undefined) {
            const fechaFin = parseFecha(body.fechaFin, "fechaFin");
            if (fechaFin !==
                undefined) {
                input.fechaFin =
                    fechaFin;
            }
        }
        /* =====================================================
           CREADO POR
           TEMPORAL HASTA CONECTAR JWT
           ===================================================== */
        if (body.creadoPorId !==
            undefined &&
            body.creadoPorId !==
                null) {
            const creadoPorId = Number(body.creadoPorId);
            if (!Number.isInteger(creadoPorId) ||
                creadoPorId <= 0) {
                throw new Error("creadoPorId inválido");
            }
            input.creadoPorId =
                creadoPorId;
        }
        else if (body.creadoPorId ===
            null) {
            input.creadoPorId =
                null;
        }
        const data = await crearCampaniaProteccionDatos(input);
        return res
            .status(201)
            .json({
            ok: true,
            message: "Campaña creada correctamente",
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   ACTUALIZAR CAMPAÑA
   ========================================================= */
export async function patchCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const body = req.body ?? {};
        const input = {};
        if (body.nombre !==
            undefined) {
            input.nombre =
                body.nombre;
        }
        if (body.descripcion !==
            undefined) {
            input.descripcion =
                body.descripcion;
        }
        if (body.tituloDocumento !==
            undefined) {
            input.tituloDocumento =
                body.tituloDocumento;
        }
        if (body.versionDocumento !==
            undefined) {
            input.versionDocumento =
                body.versionDocumento;
        }
        if (body.contenidoHtml !==
            undefined) {
            input.contenidoHtml =
                body.contenidoHtml;
        }
        if (body.configuracionConsentimiento !==
            undefined) {
            input.configuracionConsentimiento =
                body.configuracionConsentimiento;
        }
        if (body.asuntoCorreo !==
            undefined) {
            input.asuntoCorreo =
                body.asuntoCorreo;
        }
        if (body.cuerpoCorreoHtml !==
            undefined) {
            input.cuerpoCorreoHtml =
                body.cuerpoCorreoHtml;
        }
        if (body.fechaInicio !==
            undefined) {
            const fechaInicio = parseFecha(body.fechaInicio, "fechaInicio");
            if (fechaInicio !==
                undefined) {
                input.fechaInicio =
                    fechaInicio;
            }
        }
        if (body.fechaFin !==
            undefined) {
            const fechaFin = parseFecha(body.fechaFin, "fechaFin");
            if (fechaFin !==
                undefined) {
                input.fechaFin =
                    fechaFin;
            }
        }
        const data = await actualizarCampaniaProteccionDatos(id, input);
        return res
            .status(200)
            .json({
            ok: true,
            message: "Campaña actualizada correctamente",
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   ACTIVAR CAMPAÑA
   ========================================================= */
export async function postActivarCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const data = await activarCampaniaProteccionDatos(id);
        return res
            .status(200)
            .json({
            ok: true,
            message: "Campaña activada correctamente",
            data,
        });
    }
    catch (error) {
        if (error instanceof Error &&
            error.message ===
                "La campaña debe tener al menos un destinatario antes de activarse") {
            return res
                .status(409)
                .json({
                ok: false,
                error: error.message,
            });
        }
        return next(error);
    }
}
/* =========================================================
   ENVIAR CAMPAÑA
   ========================================================= */
export async function postEnviarCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const data = await enviarCampaniaProteccionDatos(id);
        return res
            .status(200)
            .json({
            ok: true,
            message: data.errores === 0
                ? "Campaña enviada correctamente"
                : "La campaña fue procesada con algunos errores",
            data,
        });
    }
    catch (error) {
        /*
         * Errores funcionales concretos.
         */
        if (error instanceof Error &&
            (error.message ===
                "Solo una campaña ACTIVA puede enviarse" ||
                error.message ===
                    "La campaña no tiene destinatarios pendientes de envío")) {
            return res
                .status(409)
                .json({
                ok: false,
                error: error.message,
            });
        }
        return next(error);
    }
}
/* =========================================================
   FINALIZAR CAMPAÑA
   ========================================================= */
export async function postFinalizarCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const data = await finalizarCampaniaProteccionDatos(id);
        return res
            .status(200)
            .json({
            ok: true,
            message: "Campaña finalizada correctamente",
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   CANCELAR CAMPAÑA
   ========================================================= */
export async function postCancelarCampaniaProteccionDatos(req, res, next) {
    try {
        const id = parseId(req.params.id, "ID de campaña");
        const data = await cancelarCampaniaProteccionDatos(id);
        return res
            .status(200)
            .json({
            ok: true,
            message: "Campaña cancelada correctamente",
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   AGREGAR DESTINATARIOS
   ========================================================= */
export async function postDestinatariosCampania(req, res, next) {
    try {
        const campaniaId = parseId(req.params.id, "ID de campaña");
        const body = req.body ??
            {};
        if (!Array.isArray(body.solicitanteIds)) {
            throw new Error("solicitanteIds debe ser un arreglo");
        }
        const input = {
            solicitanteIds: body.solicitanteIds,
        };
        const data = await agregarDestinatariosCampania(campaniaId, input);
        return res
            .status(200)
            .json({
            ok: true,
            message: data.agregados === 1
                ? "1 destinatario agregado correctamente"
                : `${data.agregados} destinatarios agregados correctamente`,
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   LISTAR DESTINATARIOS
   ========================================================= */
export async function getDestinatariosCampania(req, res, next) {
    try {
        const campaniaId = parseId(req.params.id, "ID de campaña");
        const data = await listarDestinatariosCampania(campaniaId);
        return res
            .status(200)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   QUITAR DESTINATARIO
   ========================================================= */
export async function deleteDestinatarioCampania(req, res, next) {
    try {
        const campaniaId = parseId(req.params.id, "ID de campaña");
        const consentimientoId = parseId(req.params.consentimientoId, "ID de consentimiento");
        const data = await quitarDestinatarioCampania(campaniaId, consentimientoId);
        return res
            .status(200)
            .json({
            ok: true,
            message: "Destinatario eliminado de la campaña correctamente",
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
/* =========================================================
   SUBIR DOCUMENTO DE FORMULARIO
   ========================================================= */
export async function uploadDocumentoProteccionDatosController(req, res, next) {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Debes seleccionar un archivo PDF",
            });
        }
        const documento = await subirDocumentoProteccionDatos({
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            buffer: req.file.buffer,
        });
        return res
            .status(201)
            .json({
            ok: true,
            data: documento,
        });
    }
    catch (error) {
        if (error instanceof
            Error) {
            return res
                .status(400)
                .json({
                ok: false,
                error: error.message,
            });
        }
        return next(error);
    }
}
/* =========================================================
   GET HISTORIAL DE CONSENTIMIENTO
   ========================================================= */
export async function getEventosConsentimiento(req, res, next) {
    try {
        const campaniaId = Number(req.params.campaniaId);
        const consentimientoId = Number(req.params.consentimientoId);
        const data = await listarEventosConsentimiento(campaniaId, consentimientoId);
        return res
            .status(200)
            .json({
            ok: true,
            data,
        });
    }
    catch (error) {
        return next(error);
    }
}
//# sourceMappingURL=proteccion-datos.controller.js.map