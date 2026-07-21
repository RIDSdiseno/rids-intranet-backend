// src/routes/baseapi-rcv.routes.ts
import { Router } from "express";
import {
  getComprasRcvBaseApi,
  getVentasRcvBaseApi,
} from "../../controllers/baseapi/baseapi-rcv.controller.js";
import { getBaseApiRcvDashboardController } from "../../controllers/baseapi/baseapi-rcv-dashboard.controller.js";

import {
  getConciliacionRcv,
  getPuntualidadClienteRcv,
  postConciliarRcv,
  postDesconciliarRcv,
  postObservarRcv,
} from "../../controllers/baseapi/baseapi-rcv-conciliacion.controller.js";

import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";

const router = Router();

// Lectura: ADMINISTRACION, VENTAS y CLIENTE
router.get(
  "/ventas",
  auth(),
  onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"),
  getVentasRcvBaseApi
);

router.get(
  "/compras",
  auth(),
  onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"),
  getComprasRcvBaseApi
);

router.get(
  "/dashboard",
  auth(),
  onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"),
  getBaseApiRcvDashboardController
);

// Lectura de conciliación: solo ADMINISTRACION (pestaña restringida a administradores)
router.get(
  "/conciliacion",
  auth(),
  onlyRole("ADMINISTRACION"),
  getConciliacionRcv
);

// Puntualidad de cliente: visible para quienes gestionan cobranza
router.get(
  "/conciliacion/puntualidad",
  auth(),
  onlyRole("ADMINISTRACION", "VENTAS"),
  getPuntualidadClienteRcv
);

// Acciones: solo ADMINISTRACION
router.post(
  "/conciliacion/conciliar",
  auth(),
  onlyRole("ADMINISTRACION"),
  postConciliarRcv
);

router.post(
  "/conciliacion/desconciliar",
  auth(),
  onlyRole("ADMINISTRACION"),
  postDesconciliarRcv
);

router.post(
  "/conciliacion/observar",
  auth(),
  onlyRole("ADMINISTRACION"),
  postObservarRcv
);

// Permitir actualizar/crear un override de fecha de vencimiento para un documento RCV
router.patch(
  "/vencimiento",
  // temporalmente permitir acceso sin auth para pruebas locales
  auth(false),
  async (req, res) => {
    try {
      const { empresaKey, tipoDoc, folio, fechaVencimiento } = req.body ?? {};
      if (!empresaKey || !tipoDoc || !folio) {
        return res.status(400).json({ ok: false, error: 'Faltan parametros empresaKey|tipoDoc|folio' });
      }

      // escribir override
      const { setOverride } = await import('../../controllers/baseapi/rcv-vencimientos.store.js');
      await setOverride(String(empresaKey), String(tipoDoc), String(folio), fechaVencimiento ? String(fechaVencimiento) : null);

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  }
);

export default router;