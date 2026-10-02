// Rutas para manejo de ficha de empresas, con endpoints para CRUD completo de ficha técnica, sucursales, red sucursal, servidores y usuarios de servidores, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
// Ficha
import { obtenerFichaEmpresa, obtenerFichaEmpresaCompleta, actualizarFichaEmpresa, obtenerFichaTecnicaEmpresa, upsertFichaTecnicaEmpresa, upsertChecklistEmpresa } from "../../controllers/controllers-empresas/ficha-empresa.controller.js";
import { obtenerFichaSucursal, actualizarFichaSucursal, listarSucursalesEmpresa, crearSucursal, obtenerRedSucursal, upsertRedSucursal, eliminarSucursal, } from "../../controllers/controllers-empresas/sucursal.controller.js";
// Red sucursal
import { obtenerEmpresaISPs, crearEmpresaISP, actualizarEmpresaISP, eliminarEmpresaISP, } from "../../controllers/controllers-empresas/red-sucursal.controller.js";
/* ===================== SERVIDORES ===================== */
import { getServidoresByEmpresa, getServidorById, createServidor, updateServidor, toggleServidorProbado, deleteServidor, } from "../../controllers/controllers-empresas/servidores.controller.js";
/* ===================== SERVIDOR USUARIOS ===================== */
import { getUsuariosByServidor, createUsuarioServidor, updateUsuarioServidor, deleteUsuarioServidor, } from "../../controllers/controllers-empresas/servidor-usuarios.controller.js";
import { actualizarSuscripcion, crearSuscripcion, eliminarContrato, eliminarSuscripcion, listarSuscripciones, obtenerContrato, obtenerSuscripcion, subirContrato, } from "../../controllers/controllers-empresas/suscripciones-contratos.controller.js";
import multer from "multer";
export const fichaEmpresasRouter = Router();
const uploadContrato = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !==
            "application/pdf") {
            return cb(new Error("Solo se permiten archivos PDF."));
        }
        cb(null, true);
    },
});
/* ===================== FICHA ===================== */
fichaEmpresasRouter.get("/:empresaId/ficha", obtenerFichaEmpresa);
fichaEmpresasRouter.get("/:empresaId/completa", obtenerFichaEmpresaCompleta);
fichaEmpresasRouter.put("/:empresaId/ficha", actualizarFichaEmpresa);
fichaEmpresasRouter.get("/:empresaId/ficha-tecnica", obtenerFichaTecnicaEmpresa);
fichaEmpresasRouter.put("/:empresaId/ficha-tecnica", upsertFichaTecnicaEmpresa);
/* ===================== ISP / CONECTIVIDAD ===================== */
fichaEmpresasRouter.get("/:empresaId/isp", obtenerEmpresaISPs);
fichaEmpresasRouter.post("/:empresaId/isp", crearEmpresaISP);
fichaEmpresasRouter.put("/isp/:id", actualizarEmpresaISP);
fichaEmpresasRouter.delete("/isp/:id", eliminarEmpresaISP);
/* ===================== RED SUCURSAL ===================== */
fichaEmpresasRouter.get("/sucursales/:sucursalId/red", obtenerRedSucursal);
fichaEmpresasRouter.put("/sucursales/:sucursalId/red", upsertRedSucursal);
/* ===================== SERVIDORES ===================== */
fichaEmpresasRouter.get("/:empresaId/servidores", getServidoresByEmpresa);
fichaEmpresasRouter.get("/servidores/:id", getServidorById);
fichaEmpresasRouter.post("/servidores", createServidor);
fichaEmpresasRouter.put("/servidores/:id", updateServidor);
fichaEmpresasRouter.patch("/servidores/:id/probado", toggleServidorProbado);
fichaEmpresasRouter.delete("/servidores/:id", deleteServidor);
/* ===================== SERVIDOR USUARIOS ===================== */
fichaEmpresasRouter.get("/servidores/:servidorId/usuarios", getUsuariosByServidor);
fichaEmpresasRouter.post("/servidores/:servidorId/usuarios", createUsuarioServidor);
fichaEmpresasRouter.put("/servidor-usuarios/:id", updateUsuarioServidor);
fichaEmpresasRouter.delete("/servidor-usuarios/:id", deleteUsuarioServidor);
/* ===================== SUCURSALES ===================== */
fichaEmpresasRouter.get("/sucursales/:sucursalId", obtenerFichaSucursal);
fichaEmpresasRouter.put("/sucursales/:sucursalId", actualizarFichaSucursal);
fichaEmpresasRouter.get("/:empresaId/sucursales", listarSucursalesEmpresa);
fichaEmpresasRouter.post("/:empresaId/sucursales", crearSucursal);
fichaEmpresasRouter.delete("/sucursales/:sucursalId", eliminarSucursal);
/* ===================== SUSCRIPCIONES Y CONTRATOS ===================== */
fichaEmpresasRouter.get("/:empresaId/suscripciones", listarSuscripciones);
fichaEmpresasRouter.get("/:empresaId/suscripciones/:suscripcionId", obtenerSuscripcion);
fichaEmpresasRouter.post("/:empresaId/suscripciones", crearSuscripcion);
fichaEmpresasRouter.patch("/:empresaId/suscripciones/:suscripcionId", actualizarSuscripcion);
fichaEmpresasRouter.delete("/:empresaId/suscripciones/:suscripcionId", eliminarSuscripcion);
/* ===================== CONTRATOS PDF ===================== */
fichaEmpresasRouter.post("/:empresaId/suscripciones/:suscripcionId/contrato", uploadContrato.single("contrato"), subirContrato);
fichaEmpresasRouter.get("/:empresaId/suscripciones/:suscripcionId/contrato", obtenerContrato);
fichaEmpresasRouter.delete("/:empresaId/suscripciones/:suscripcionId/contrato", eliminarContrato);
fichaEmpresasRouter.put("/:empresaId/checklist", upsertChecklistEmpresa);
export default fichaEmpresasRouter;
//# sourceMappingURL=ficha-empresas.routes.js.map