import { z } from "zod";
import { EtapaOportunidadVenta, PrioridadOportunidadVenta, MonedaGestioo, EstadoDesarrolloPropuesta, TipoServicioOportunidad, RiesgoTecnicoOportunidad, } from "@prisma/client";
import { crearOportunidad, listarOportunidades, obtenerFunnel, obtenerDashboardFunnel, obtenerOportunidadPorId, editarOportunidad, cambiarEtapaOportunidad, reordenarOportunidad, desactivarOportunidad, crearSeguimiento, listarSeguimientos, obtenerHistorial, listarCotizacionesOportunidad, vincularCotizacion, desvincularCotizacion, OportunidadNoEncontradaError, EtapaOportunidadInvalidaError, CierreOportunidadInvalidoError, ResponsableOportunidadInvalidoError, EntidadOportunidadInvalidaError, OrdenOportunidadInvalidoError, CotizacionOportunidadRequeridaError, CotizacionYaVinculadaError, CotizacionNoEncontradaError, CotizacionNoVinculadaError, DesvinculacionCotizacionInvalidaError, } from "../../service/oportunidades.service.js";
/* =========================================================
   Validaciones Zod (mismo patrón que agenda.controller.ts:
   los schemas viven junto al controller, no en un módulo aparte)
========================================================= */
const crearOportunidadSchema = z.object({
    titulo: z.string().trim().min(1, "El título es obligatorio"),
    responsableId: z.number().int().positive().optional(),
    entidadId: z.number().int().positive().optional().nullable(),
    proyecto: z.string().trim().max(255).optional().nullable(),
    contactoNombre: z.string().trim().max(255).optional().nullable(),
    contactoEmail: z
        .string()
        .trim()
        .email("Correo inválido")
        .optional()
        .nullable()
        .or(z.literal("")),
    contactoTelefono: z.string().trim().max(50).optional().nullable(),
    prioridad: z.nativeEnum(PrioridadOportunidadVenta).optional(),
    montoEstimado: z.number().nonnegative().optional().nullable(),
    moneda: z.nativeEnum(MonedaGestioo).optional(),
    probabilidadCierre: z.number().int().min(0).max(100).optional().nullable(),
    fechaProbableCierre: z.coerce.date().optional().nullable(),
    proximaAccion: z.string().trim().max(255).optional().nullable(),
    fechaProximaAccion: z.coerce.date().optional().nullable(),
    observaciones: z.string().trim().optional().nullable(),
    estadoDesarrolloPropuesta: z.nativeEnum(EstadoDesarrolloPropuesta).optional().nullable(),
    tipoServicio: z.nativeEnum(TipoServicioOportunidad).optional().nullable(),
    tipoServicioOtro: z.string().trim().max(255).optional().nullable(),
    informacionPendiente: z.string().trim().optional().nullable(),
    riesgoTecnico: z.nativeEnum(RiesgoTecnicoOportunidad).optional().nullable(),
    condicionesEspeciales: z.string().trim().optional().nullable(),
    fechaComprometidaEnvio: z.coerce.date().optional().nullable(),
    comentariosInternos: z.string().trim().optional().nullable(),
    montoPropuesto: z.number().nonnegative().optional().nullable(),
    fechaEnvioPropuesta: z.coerce.date().optional().nullable(),
    fechaVencimientoPropuesta: z.coerce.date().optional().nullable(),
    comentariosCliente: z.string().trim().optional().nullable(),
    objeciones: z.string().trim().optional().nullable(),
    versionPropuesta: z.string().trim().max(50).optional().nullable(),
    contrapropuestas: z.string().trim().optional().nullable(),
    ajustesSolicitados: z.string().trim().optional().nullable(),
});
// Edición: no permite modificar codigo/etapa/orden/activo/desactivadoAt/
// motivoPerdida/fechaCierre — esos campos se gestionan por operaciones específicas.
const editarOportunidadSchema = crearOportunidadSchema
    .partial()
    .extend({
    fechaUltimoContacto: z.coerce.date().optional().nullable(),
})
    .strict();
const cambiarEtapaSchema = z
    .object({
    etapa: z.nativeEnum(EtapaOportunidadVenta),
    motivoPerdida: z.string().trim().min(1).max(500).optional(),
    motivoPostergacion: z.string().trim().min(1).max(500).optional(),
    fechaReactivacion: z.coerce.date().optional(),
    fechaCierre: z.coerce.date().optional(),
    montoFinal: z.number().nonnegative().optional().nullable(),
})
    .superRefine((data, ctx) => {
    if (data.etapa === EtapaOportunidadVenta.PERDIDA) {
        if (!data.motivoPerdida) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["motivoPerdida"], message: "El motivo de pérdida es obligatorio." });
        }
        if (!data.fechaCierre) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaCierre"], message: "La fecha de cierre es obligatoria." });
        }
    }
    if (data.etapa === EtapaOportunidadVenta.GANADA) {
        if (!data.fechaCierre) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaCierre"], message: "La fecha de cierre es obligatoria." });
        }
    }
    if (data.etapa === EtapaOportunidadVenta.POSTERGADA) {
        if (!data.motivoPostergacion) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["motivoPostergacion"], message: "El motivo de postergación es obligatorio." });
        }
        if (!data.fechaReactivacion) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaReactivacion"], message: "La fecha de reactivación es obligatoria." });
        }
    }
});
const reordenarOportunidadSchema = z.object({
    orden: z.number().int().min(0),
});
const crearSeguimientoSchema = z.object({
    comentario: z.string().trim().min(1, "El comentario es obligatorio"),
    fechaContacto: z.coerce.date().optional(),
    proximaAccion: z.string().trim().max(255).optional().nullable(),
    fechaProximaAccion: z.coerce.date().optional().nullable(),
});
const filtrosOportunidadSchema = z.object({
    etapa: z.nativeEnum(EtapaOportunidadVenta).optional(),
    responsableId: z.coerce.number().int().positive().optional(),
    entidadId: z.coerce.number().int().positive().optional(),
    prioridad: z.nativeEnum(PrioridadOportunidadVenta).optional(),
    texto: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});
const filtrosDashboardSchema = z.object({
    fechaDesde: z.coerce.date().optional(),
    fechaHasta: z.coerce.date().optional(),
    tipoFecha: z.enum(["ingreso", "cierre", "probableCierre"]).optional(),
    responsableId: z.coerce.number().int().positive().optional(),
    etapa: z.nativeEnum(EtapaOportunidadVenta).optional(),
    origen: z.enum(["RIDS", "ECONNET", "OTRO"]).optional(),
    tipoServicio: z.nativeEnum(TipoServicioOportunidad).optional(),
    entidadId: z.coerce.number().int().positive().optional(),
    texto: z.string().trim().optional(),
    diasSinSeguimiento: z.coerce.number().int().positive().max(365).optional(),
});
const idOportunidadCotizacionParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    cotizacionId: z.coerce.number().int().positive(),
});
function getActorId(req) {
    const user = req.user;
    return user?.id ? Number(user.id) : null;
}
function manejarErrorOportunidad(err, res) {
    if (err instanceof OportunidadNoEncontradaError) {
        return res.status(404).json({ success: false, code: "OPORTUNIDAD_NO_ENCONTRADA", message: err.message });
    }
    if (err instanceof EtapaOportunidadInvalidaError) {
        return res.status(400).json({ success: false, code: "ETAPA_INVALIDA", message: err.message });
    }
    if (err instanceof CierreOportunidadInvalidoError) {
        return res.status(400).json({ success: false, code: "CIERRE_INVALIDO", message: err.message });
    }
    if (err instanceof ResponsableOportunidadInvalidoError) {
        return res.status(400).json({ success: false, code: "RESPONSABLE_INVALIDO", message: err.message });
    }
    if (err instanceof EntidadOportunidadInvalidaError) {
        return res.status(400).json({ success: false, code: "ENTIDAD_INVALIDA", message: err.message });
    }
    if (err instanceof OrdenOportunidadInvalidoError) {
        return res.status(400).json({ success: false, code: "ORDEN_INVALIDO", message: err.message });
    }
    if (err instanceof CotizacionOportunidadRequeridaError) {
        return res.status(409).json({ success: false, code: "COTIZACION_REQUERIDA", message: err.message });
    }
    if (err instanceof CotizacionYaVinculadaError) {
        return res.status(409).json({ success: false, code: "COTIZACION_YA_VINCULADA", message: err.message });
    }
    if (err instanceof CotizacionNoEncontradaError) {
        return res.status(404).json({ success: false, code: "COTIZACION_NO_ENCONTRADA", message: err.message });
    }
    if (err instanceof CotizacionNoVinculadaError) {
        return res.status(404).json({ success: false, code: "COTIZACION_NO_VINCULADA", message: err.message });
    }
    if (err instanceof DesvinculacionCotizacionInvalidaError) {
        return res.status(409).json({ success: false, code: "DESVINCULACION_INVALIDA", message: err.message });
    }
    console.error("[oportunidades]", err);
    return res.status(500).json({ success: false, code: "ERROR_INTERNO", message: "Error inesperado al procesar la oportunidad." });
}
export async function crearOportunidadController(req, res) {
    const parsed = crearOportunidadSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ success: false, code: "DATOS_INVALIDOS", errors: parsed.error.flatten() });
    }
    const actorId = getActorId(req);
    if (!actorId)
        return res.status(401).json({ success: false, code: "NO_AUTENTICADO" });
    try {
        const oportunidad = await crearOportunidad(actorId, parsed.data);
        return res.status(201).json({ success: true, data: oportunidad });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function listarOportunidadesController(req, res) {
    const parsed = filtrosOportunidadSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ success: false, code: "FILTROS_INVALIDOS", errors: parsed.error.flatten() });
    }
    try {
        const { data, meta } = await listarOportunidades(parsed.data);
        return res.status(200).json({ success: true, data, meta });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function obtenerFunnelController(_req, res) {
    try {
        const data = await obtenerFunnel();
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function obtenerDashboardController(req, res) {
    const parsed = filtrosDashboardSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ success: false, code: "FILTROS_INVALIDOS", errors: parsed.error.flatten() });
    }
    try {
        const data = await obtenerDashboardFunnel(parsed.data);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function obtenerOportunidadController(req, res) {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await obtenerOportunidadPorId(parsed.data.id);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function editarOportunidadController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    const body = editarOportunidadSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, code: "DATOS_INVALIDOS", errors: body.error.flatten() });
    }
    try {
        const data = await editarOportunidad(params.data.id, body.data);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function cambiarEtapaController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    const body = cambiarEtapaSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, code: "DATOS_INVALIDOS", errors: body.error.flatten() });
    }
    const actorId = getActorId(req);
    try {
        const data = await cambiarEtapaOportunidad(params.data.id, actorId, body.data);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function reordenarController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    const body = reordenarOportunidadSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, code: "DATOS_INVALIDOS", errors: body.error.flatten() });
    }
    try {
        const data = await reordenarOportunidad(params.data.id, body.data.orden);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function eliminarOportunidadController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        await desactivarOportunidad(params.data.id);
        return res.status(204).send();
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function crearSeguimientoController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    const body = crearSeguimientoSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, code: "DATOS_INVALIDOS", errors: body.error.flatten() });
    }
    const actorId = getActorId(req);
    if (!actorId)
        return res.status(401).json({ success: false, code: "NO_AUTENTICADO" });
    try {
        const data = await crearSeguimiento(params.data.id, actorId, body.data);
        return res.status(201).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function listarSeguimientosController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await listarSeguimientos(params.data.id);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function obtenerHistorialController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await obtenerHistorial(params.data.id);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function listarCotizacionesController(req, res) {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await listarCotizacionesOportunidad(params.data.id);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function vincularCotizacionController(req, res) {
    const params = idOportunidadCotizacionParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await vincularCotizacion(params.data.id, params.data.cotizacionId);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
export async function desvincularCotizacionController(req, res) {
    const params = idOportunidadCotizacionParamSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await desvincularCotizacion(params.data.id, params.data.cotizacionId);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        return manejarErrorOportunidad(err, res);
    }
}
//# sourceMappingURL=oportunidades.controller.js.map