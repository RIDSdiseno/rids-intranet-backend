// src/routes/routes-empresas/empresa-logo.routes.ts
import {
    Router,
    type NextFunction,
    type Request,
    type Response,
} from "express";

import multer from "multer";

import { onlyRole } from "../../middlewares/roles.js";
import { validarEmpresaParam } from "../../middlewares/auth.js";

import {
    eliminarLogoEmpresaController,
    obtenerLogoEmpresaController,
    obtenerLogoEmpresaPngController,
    subirLogoEmpresaController,
} from "../../controllers/controllers-empresas/empresa-logo.controller.js";

import { MAX_BYTES_LOGO } from "../../service/empresas/empresa-logo.service.js";

const empresaLogoRouter = Router();

empresaLogoRouter.param("empresaId", validarEmpresaParam);

/* Archivo en memoria: el service valida el contenido y lo sube a Cloudinary. */
const uploadLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES_LOGO, files: 1 },
});

function recibirLogo(req: Request, res: Response, next: NextFunction) {
    uploadLogo.single("archivo")(req, res, (err: unknown) => {
        if (!err) {
            next();
            return;
        }

        const mensaje =
            err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
                ? "El logo supera el máximo de 2 MB."
                : err instanceof Error
                    ? err.message
                    : "Archivo inválido.";

        res.status(400).json({ success: false, code: "ARCHIVO_INVALIDO", message: mensaje });
    });
}

/* Ver: cualquier rol interno. Cambiar/quitar: mismos roles que editan la ficha. */
empresaLogoRouter.get(
    "/:empresaId",
    onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"),
    obtenerLogoEmpresaController
);

/* PNG para incrustar en documentos (Word IA de reportes). */
empresaLogoRouter.get(
    "/:empresaId/png",
    onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"),
    obtenerLogoEmpresaPngController
);

empresaLogoRouter.put(
    "/:empresaId",
    onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"),
    recibirLogo,
    subirLogoEmpresaController
);

empresaLogoRouter.delete(
    "/:empresaId",
    onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"),
    eliminarLogoEmpresaController
);

export default empresaLogoRouter;