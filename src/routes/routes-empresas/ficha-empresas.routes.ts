import { Router } from "express";

// Ficha
import {
    obtenerFichaEmpresa, obtenerFichaEmpresaCompleta, actualizarFichaEmpresa, obtenerFichaTecnicaEmpresa,
    upsertFichaTecnicaEmpresa,
} from "../../controllers/controllers-empresas/ficha-empresa.controller.js";


// Red sucursal
import {
    obtenerRedSucursal,
    upsertRedSucursal
} from "../../controllers/controllers-empresas/red-sucursal.controller.js";

export const fichaEmpresasRouter = Router();

/* ===================== FICHA ===================== */
fichaEmpresasRouter.get("/:empresaId/ficha", obtenerFichaEmpresa);
fichaEmpresasRouter.get("/:empresaId/completa", obtenerFichaEmpresaCompleta);
fichaEmpresasRouter.put("/:empresaId/ficha", actualizarFichaEmpresa);
fichaEmpresasRouter.get("/:empresaId/ficha-tecnica",obtenerFichaTecnicaEmpresa);
fichaEmpresasRouter.put("/:empresaId/ficha-tecnica",upsertFichaTecnicaEmpresa);


/* ===================== RED SUCURSAL ===================== */
fichaEmpresasRouter.get("/sucursales/:sucursalId/red", obtenerRedSucursal);
fichaEmpresasRouter.put("/sucursales/:sucursalId/red", upsertRedSucursal);

export default fichaEmpresasRouter;
