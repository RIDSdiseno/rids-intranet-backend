import {
  Router,
} from "express";

import {
  onlyRole,
} from "../../middlewares/roles.js";

import {
  crearOportunidadController,
  listarOportunidadesController,
  obtenerFunnelController,
  obtenerDashboardController,
  obtenerOportunidadController,
  editarOportunidadController,
  cambiarEtapaController,
  reordenarController,
  eliminarOportunidadController,
  crearSeguimientoController,
  listarSeguimientosController,
  obtenerHistorialController,
  listarCotizacionesController,
  vincularCotizacionController,
  desvincularCotizacionController,
  crearOportunidadDesdeCotizacionController,
  cambiarEstadoSeguimientoController,
  enviarInformeOportunidadController,
} from "../../controllers/controllers-oportunidades/oportunidades.controller.js";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import multer from "multer";

import {
  listarDocumentosController,
  subirDocumentoController,
  obtenerDocumentoController,
  eliminarDocumentoController,
} from "../../controllers/controllers-oportunidades/oportunidades-documentos.controller.js";

import {
  MAX_BYTES_DOCUMENTO,
} from "../../service/oportunidades/oportunidades-documentos.service.js";

/*
 * Roles internos habilitados
 * para el Funnel comercial.
 */
const ROLES_OPORTUNIDADES = [
  "ADMIN",
  "ADMINISTRACION",
  "VENTAS",
] as const;


const oportunidadesRouter =
  Router();

/*
 * PDF en memoria: el service lo sube a Supabase.
 * Si multer falla (tamaño, tipo), respondemos 400 en JSON
 * en vez de dejar que llegue al handler global de errores.
 */
const uploadDocumento =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        MAX_BYTES_DOCUMENTO,

      files:
        1,
    },

    fileFilter: (
      _req,
      file,
      cb
    ) => {
      if (
        file.mimetype !==
        "application/pdf"
      ) {
        return cb(
          new Error(
            "Solo se permiten archivos PDF."
          )
        );
      }

      cb(
        null,
        true
      );
    },
  });

function recibirPdf(
  req: Request,
  res: Response,
  next: NextFunction
) {
  uploadDocumento.single("archivo")(
    req,
    res,
    (err: unknown) => {
      if (!err) {
        return next();
      }

      const mensaje =
        err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE"
          ? `El PDF supera el máximo de ${Math.round(MAX_BYTES_DOCUMENTO / 1024 / 1024)} MB.`
          : err instanceof Error
            ? err.message
            : "Archivo inválido.";

      return res.status(400).json({
        success: false,
        code: "ARCHIVO_INVALIDO",
        message: mensaje,
      });
    }
  );
}

/*
 * Autorización centralizada
 * para todo el módulo.
 */
oportunidadesRouter.use(
  onlyRole(
    ...ROLES_OPORTUNIDADES
  )
);


/* =========================================================
   CREACIÓN DESDE COTIZACIÓN
========================================================= */

oportunidadesRouter.post(
  "/desde-cotizacion/:cotizacionId",
  crearOportunidadDesdeCotizacionController
);


/* =========================================================
   RUTAS GENERALES / ESPECÍFICAS
========================================================= */

oportunidadesRouter.get(
  "/funnel",
  obtenerFunnelController
);

oportunidadesRouter.get(
  "/dashboard",
  obtenerDashboardController
);

oportunidadesRouter.get(
  "/",
  listarOportunidadesController
);

oportunidadesRouter.post(
  "/",
  crearOportunidadController
);


/* =========================================================
   SEGUIMIENTOS
========================================================= */

oportunidadesRouter.post(
  "/:id/seguimientos",
  crearSeguimientoController
);

oportunidadesRouter.get(
  "/:id/seguimientos",
  listarSeguimientosController
);

oportunidadesRouter.patch(
  "/:id/seguimientos/:seguimientoId/estado",
  cambiarEstadoSeguimientoController
);


/* =========================================================
   HISTORIAL
========================================================= */

oportunidadesRouter.get(
  "/:id/historial",
  obtenerHistorialController
);


/* =========================================================
   COTIZACIONES VINCULADAS
========================================================= */

oportunidadesRouter.get(
  "/:id/cotizaciones",
  listarCotizacionesController
);

oportunidadesRouter.post(
  "/:id/cotizaciones/:cotizacionId",
  vincularCotizacionController
);

oportunidadesRouter.delete(
  "/:id/cotizaciones/:cotizacionId",
  desvincularCotizacionController
);

/* =========================================================
   DOCUMENTOS PDF
========================================================= */

oportunidadesRouter.get(
  "/:id/documentos",
  listarDocumentosController
);

oportunidadesRouter.post(
  "/:id/documentos",
  recibirPdf,
  subirDocumentoController
);

/* URL firmada (10 min). ?descargar=1 fuerza la descarga */
oportunidadesRouter.get(
  "/:id/documentos/:documentoId",
  obtenerDocumentoController
);

oportunidadesRouter.delete(
  "/:id/documentos/:documentoId",
  eliminarDocumentoController
);

/* =========================================================
   INFORME DE RESPALDO
========================================================= */

oportunidadesRouter.post(
  "/:id/informe/enviar",
  enviarInformeOportunidadController
);


/* =========================================================
   ETAPA Y ORDEN
========================================================= */

oportunidadesRouter.patch(
  "/:id/etapa",
  cambiarEtapaController
);

oportunidadesRouter.patch(
  "/:id/orden",
  reordenarController
);


/* =========================================================
   CRUD POR ID
========================================================= */

oportunidadesRouter.get(
  "/:id",
  obtenerOportunidadController
);

oportunidadesRouter.patch(
  "/:id",
  editarOportunidadController
);

oportunidadesRouter.delete(
  "/:id",
  eliminarOportunidadController
);


export default oportunidadesRouter;