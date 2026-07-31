// src/routes/recordatorios.routes.ts

import { Router } from "express";

import {
    cancelarRecordatorio,
    completarRecordatorio,
    crearRecordatorio,
    marcarRecordatorioLeido,
    obtenerMisRecordatorios,
    reactivarRecordatorio,
    cancelarTodosMisRecordatorios
} from "../controllers/recordatorios.controller.js";

import { auth } from "../middlewares/auth.js";

const router = Router();

/*
 * Obtiene recordatorios del usuario autenticado.
 */
router.get( "/mios", auth(), obtenerMisRecordatorios);

/*
 * Crea un recordatorio desde cualquier módulo.
 */
router.post( "/", auth(), crearRecordatorio);

/*
 * Marca el recordatorio como leído.
 */
router.patch( "/:id/leido", auth(),  marcarRecordatorioLeido);

/*
 * Marca el recordatorio como completado.
 */
router.patch( "/:id/completar", auth(), completarRecordatorio);

/*
 * Reactiva un recordatorio completado.
 */
router.patch( "/:id/reactivar", auth(), reactivarRecordatorio);

/*
 * Cancela todos los recordatorios pendientes
 * del usuario autenticado.
 *
 * Debe declararse antes de rutas dinámicas con /:id.
 */
router.patch( "/mios/cancelar-todos",  auth(),cancelarTodosMisRecordatorios);

/*
 * Cancela un recordatorio.
 */
router.patch( "/:id/cancelar", auth(), cancelarRecordatorio);

export default router;