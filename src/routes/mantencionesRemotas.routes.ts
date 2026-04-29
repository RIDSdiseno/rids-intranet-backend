// src/routes/mantencionesRemotas.routes.ts
import { Router } from "express";
import { auth, onlyOwnEmpresa } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";

import {
  listMantencionesRemotas,
  exportMantencionesRemotas,
  getMantencionRemotaById,
  createMantencionRemota,
  updateMantencionRemota,
  deleteMantencionRemota,
  closeMantencionRemota,
  mantencionesRemotasMetrics,
  getMantencionesRemotasFilters,
} from "../controllers/mantencionesRemotas.controller.js";

const router = Router();

/* ========= Listado + filtros + métricas ========= */

router.get("/", auth(), onlyOwnEmpresa(), (req, res, next) => {
  Promise.resolve(listMantencionesRemotas(req, res)).catch(next);
});

router.get("/export", auth(), onlyOwnEmpresa(), (req, res, next) => {
  Promise.resolve(exportMantencionesRemotas(req, res)).catch(next);
});

router.get("/filters", auth(), onlyOwnEmpresa(), (req, res, next) => {
  Promise.resolve(getMantencionesRemotasFilters(req, res)).catch(next);
});

router.get("/metrics", auth(), onlyOwnEmpresa(), (req, res, next) => {
  Promise.resolve(mantencionesRemotasMetrics(req, res)).catch(next);
});

/* ========= Detalle ========= */

router.get("/:id", auth(), (req, res, next) => {
  Promise.resolve(getMantencionRemotaById(req, res)).catch(next);
});

/* ========= CRUD solo interno ========= */

router.post(
  "/",
  auth(),
  onlyRole("ADMIN", "TECNICO", "SOPORTE"),
  (req, res, next) => {
    Promise.resolve(createMantencionRemota(req, res)).catch(next);
  }
);

router.put(
  "/:id",
  auth(),
  onlyRole("ADMIN", "TECNICO", "SOPORTE"),
  (req, res, next) => {
    Promise.resolve(updateMantencionRemota(req, res)).catch(next);
  }
);

router.patch(
  "/:id",
  auth(),
  onlyRole("ADMIN", "TECNICO", "SOPORTE"),
  (req, res, next) => {
    Promise.resolve(updateMantencionRemota(req, res)).catch(next);
  }
);

router.delete(
  "/:id",
  auth(),
  onlyRole("ADMIN", "TECNICO", "SOPORTE"),
  (req, res, next) => {
    Promise.resolve(deleteMantencionRemota(req, res)).catch(next);
  }
);

/* ========= Acción rápida solo interno ========= */

router.post(
  "/:id/close",
  auth(),
  onlyRole("ADMIN", "TECNICO", "SOPORTE"),
  (req, res, next) => {
    Promise.resolve(closeMantencionRemota(req, res)).catch(next);
  }
);

export default router;