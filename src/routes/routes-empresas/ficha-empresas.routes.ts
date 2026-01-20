import { Router } from "express";

// Ficha
import {
    obtenerFichaEmpresa, obtenerFichaEmpresaCompleta, actualizarFichaEmpresa, obtenerFichaTecnicaEmpresa,
    upsertFichaTecnicaEmpresa, upsertChecklistEmpresa
} from "../../controllers/controllers-empresas/ficha-empresa.controller.js";

import {
    obtenerFichaSucursal,
    actualizarFichaSucursal,
    listarSucursalesEmpresa,
    crearSucursal
} from "../../controllers/controllers-empresas/sucursal.controller.js";

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
fichaEmpresasRouter.get("/:empresaId/ficha-tecnica", obtenerFichaTecnicaEmpresa);
fichaEmpresasRouter.put("/:empresaId/ficha-tecnica", upsertFichaTecnicaEmpresa);


/* ===================== RED SUCURSAL ===================== */
fichaEmpresasRouter.get("/sucursales/:sucursalId/red", obtenerRedSucursal);
fichaEmpresasRouter.put("/sucursales/:sucursalId/red", upsertRedSucursal);

// Sucursales
fichaEmpresasRouter.get("/sucursales/:sucursalId",obtenerFichaSucursal);
fichaEmpresasRouter.put("/sucursales/:sucursalId",actualizarFichaSucursal);
fichaEmpresasRouter.get( "/:empresaId/sucursales",listarSucursalesEmpresa);
fichaEmpresasRouter.post("/:empresaId/sucursales", crearSucursal);

fichaEmpresasRouter.put("/:empresaId/checklist",upsertChecklistEmpresa);

export default fichaEmpresasRouter;
