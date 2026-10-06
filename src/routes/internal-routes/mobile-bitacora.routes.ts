import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    Router,
} from "express";

import multer from "multer";

import {
    prismaBase as prisma,
} from "../../lib/prisma.js";

import {
    crearBitacoraTecnico,
    obtenerBitacorasTecnico,
    obtenerBitacoraTecnicoPorId,
    actualizarBitacoraTecnico,
    eliminarBitacoraTecnico,
    obtenerOpcionesRelacionBitacora,
    actualizarRecordatorioBitacora,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-tecnico.controller.js";

import {
    obtenerEtapasBitacora,
    actualizarEtapaBitacora,
    solicitarRevisionEtapa,
    responderRevisionEtapa,
    completarEtapaBitacora,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-etapas.controller.js";

import {
    obtenerEvidenciasBitacora,
    agregarEvidenciaBitacora,
    eliminarEvidenciaBitacora,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-evidencias.controller.js";

import {
    mobileBitacoraUser,
} from "../../middlewares/mobile-bitacora-user.middleware.js";

/* =========================================================
   ROUTER
========================================================= */

const router =
    Router();

/* =========================================================
   MULTER
========================================================= */

/*
 * El controller de evidencias admite:
 *
 * - imágenes hasta 15 MB
 * - videos hasta 150 MB
 *
 * Aquí permitimos como máximo 150 MB.
 *
 * La validación específica de MIME y tamaño
 * sigue estando en bitacora-evidencias.controller.ts.
 */
const upload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                150 *
                1024 *
                1024,
        },
    });

/* =========================================================
   TIPOS
========================================================= */

type MobileBitacoraRequest =
    Request & {
        user?: {
            id?: number;
            id_tecnico?: number;
            tecnicoId?: number;
            userId?: number;
            nombre?: string;
            email?: string;
            rol?: string;
        };
    };

/* =========================================================
   HELPERS
========================================================= */

/**
 * Obtiene el ID del técnico que previamente fue
 * identificado por mobileBitacoraUser.
 */
function obtenerTecnicoMovilId(
    req: Request
): number | null {
    const user =
        (
            req as MobileBitacoraRequest
        ).user;

    const tecnicoId =
        Number(
            user?.id_tecnico ??
            user?.tecnicoId ??
            user?.id ??
            user?.userId
        );

    if (
        !Number.isInteger(
            tecnicoId
        ) ||
        tecnicoId <= 0
    ) {
        return null;
    }

    return tecnicoId;
}

/**
 * Fuerza el filtro tecnicoId del listado.
 *
 * Evita que desde la app móvil alguien pueda enviar:
 *
 * ?tecnicoId=OTRO_ID
 *
 * y consultar bitácoras de otro técnico.
 */
function forzarTecnicoActualQuery(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const tecnicoId =
        obtenerTecnicoMovilId(
            req
        );

    if (!tecnicoId) {
        return res
            .status(401)
            .json({
                error:
                    "Técnico móvil no identificado",
            });
    }

    req.query.tecnicoId =
        String(
            tecnicoId
        );

    next();
}

/**
 * Fuerza tecnicoId en el body.
 *
 * Aunque el frontend intente enviar otro técnico,
 * siempre se utilizará el técnico autenticado
 * en la aplicación móvil.
 */
function forzarTecnicoActualBody(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const tecnicoId =
        obtenerTecnicoMovilId(
            req
        );

    if (!tecnicoId) {
        return res
            .status(401)
            .json({
                error:
                    "Técnico móvil no identificado",
            });
    }

    req.body =
        req.body ?? {};

    req.body.tecnicoId =
        tecnicoId;

    next();
}

/**
 * Verifica que una bitácora pertenezca
 * al técnico autenticado en móvil.
 *
 * Se utiliza antes de permitir:
 *
 * - ver detalle
 * - editar
 * - eliminar
 * - modificar recordatorios
 * - trabajar con etapas
 * - trabajar con evidencias
 *
 * IMPORTANTE:
 * no se utiliza al responder revisiones,
 * porque un revisor puede ser distinto
 * al técnico propietario de la bitácora.
 */
async function verificarBitacoraPropia(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const tecnicoId =
            obtenerTecnicoMovilId(
                req
            );

        if (!tecnicoId) {
            return res
                .status(401)
                .json({
                    error:
                        "Técnico móvil no identificado",
                });
        }

        const bitacoraId =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                bitacoraId
            ) ||
            bitacoraId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "ID de bitácora inválido",
                });
        }

        const bitacora =
            await prisma
                .bitacoraTecnico
                .findFirst({
                    where: {
                        id:
                            bitacoraId,

                        tecnicoId,
                    },

                    select: {
                        id:
                            true,
                    },
                });

        if (!bitacora) {
            return res
                .status(404)
                .json({
                    error:
                        "Bitácora no encontrada",
                });
        }

        next();
    } catch (error) {
        console.error(
            "[MOBILE BITACORA] Error verificando bitácora propia:",
            error
        );

        return res
            .status(500)
            .json({
                error:
                    "No fue posible verificar la bitácora",
            });
    }
}

/* =========================================================
   IDENTIDAD TÉCNICO MÓVIL
========================================================= */

/*
 * Este middleware toma:
 *
 * x-mobile-tecnico-id
 *
 * valida que el técnico exista y esté activo
 * y reconstruye req.user para reutilizar
 * todos los controllers actuales de Bitácora.
 *
 * IMPORTANTE:
 * este router debe montarse externamente
 * protegido primero por internal-api-key.
 */
router.use(
    mobileBitacoraUser
);

/* =========================================================
   BITÁCORA
========================================================= */

router.get(
    "/revisores",
    async (
        req,
        res
    ) => {
        try {
            const tecnicoActualId =
                obtenerTecnicoMovilId(
                    req
                );

            if (
                !tecnicoActualId
            ) {
                return res
                    .status(401)
                    .json({
                        error:
                            "Técnico móvil no identificado",
                    });
            }

            const tecnicos =
                await prisma.tecnico.findMany({
                    where: {
                        status:
                            true,

                        id_tecnico: {
                            not:
                                tecnicoActualId,
                        },

                        rol: {
                            not:
                                "CLIENTE",
                        },
                    },

                    select: {
                        id_tecnico:
                            true,

                        nombre:
                            true,

                        email:
                            true,

                        rol:
                            true,
                    },

                    orderBy: {
                        nombre:
                            "asc",
                    },
                });

            return res.json({
                data:
                    tecnicos,
            });
        } catch (
        error
        ) {
            console.error(
                "[MOBILE BITACORA] Error obteniendo revisores:",
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        "No fue posible obtener los técnicos revisores",
                });
        }
    }
);

/**
 * GET /
 *
 * Lista únicamente las bitácoras
 * del técnico autenticado.
 */
router.get(
    "/",
    forzarTecnicoActualQuery,
    obtenerBitacorasTecnico
);

/**
 * POST /
 *
 * Crea una bitácora para el técnico
 * autenticado en móvil.
 */
router.post(
    "/",
    forzarTecnicoActualBody,
    crearBitacoraTecnico
);

/**
 * GET /opciones-relacion
 *
 * Obtiene opciones asociables a una empresa:
 *
 * - solicitantes
 * - tickets
 * - trabajos
 * - visitas
 * - mantenciones
 * - equipos
 * - cotizaciones
 *
 * Ejemplo:
 *
 * /opciones-relacion?empresaId=6&tipo=equipos
 */
router.get(
    "/opciones-relacion",
    obtenerOpcionesRelacionBitacora
);

/**
 * GET /:id
 *
 * Obtiene el detalle de una bitácora propia.
 */
router.get(
    "/:id",
    verificarBitacoraPropia,
    obtenerBitacoraTecnicoPorId
);

/**
 * PATCH /:id
 *
 * Actualiza una bitácora propia.
 *
 * tecnicoId siempre se fuerza
 * al técnico autenticado.
 */
router.patch(
    "/:id",
    verificarBitacoraPropia,
    forzarTecnicoActualBody,
    actualizarBitacoraTecnico
);

/**
 * DELETE /:id
 *
 * Elimina una bitácora propia.
 */
router.delete(
    "/:id",
    verificarBitacoraPropia,
    eliminarBitacoraTecnico
);

/**
 * PATCH /:id/recordatorio
 *
 * Marca/desmarca el recordatorio
 * de una bitácora propia.
 */
router.patch(
    "/:id/recordatorio",
    verificarBitacoraPropia,
    actualizarRecordatorioBitacora
);

/* =========================================================
   ETAPAS
========================================================= */

/**
 * GET /:id/etapas
 */
router.get(
    "/:id/etapas",
    verificarBitacoraPropia,
    obtenerEtapasBitacora
);

/**
 * PATCH /:id/etapas/:etapaId
 *
 * Modifica:
 *
 * - título
 * - descripción
 * - requiereRevision
 */
router.patch(
    "/:id/etapas/:etapaId",
    verificarBitacoraPropia,
    actualizarEtapaBitacora
);

/**
 * POST /:id/etapas/:etapaId/completar
 *
 * Completa la etapa actual y,
 * cuando corresponde, habilita la siguiente.
 */
router.post(
    "/:id/etapas/:etapaId/completar",
    verificarBitacoraPropia,
    completarEtapaBitacora
);

/**
 * POST /:id/etapas/:etapaId/solicitar-revision
 *
 * Solo el propietario de la bitácora
 * puede solicitar revisión desde móvil.
 */
router.post(
    "/:id/etapas/:etapaId/solicitar-revision",
    verificarBitacoraPropia,
    solicitarRevisionEtapa
);

/**
 * POST
 * /:id/etapas/:etapaId/aprobaciones/:aprobacionId/responder
 *
 * IMPORTANTE:
 *
 * NO se usa verificarBitacoraPropia.
 *
 * El revisor puede ser otro técnico.
 * El controller ya verifica que:
 *
 * aprobacion.aprobadorId === actorId
 */
router.post(
    "/:id/etapas/:etapaId/aprobaciones/:aprobacionId/responder",
    responderRevisionEtapa
);

/* =========================================================
   EVIDENCIAS
========================================================= */

/**
 * GET /:id/evidencias
 */
router.get(
    "/:id/evidencias",
    verificarBitacoraPropia,
    obtenerEvidenciasBitacora
);

/**
 * POST /:id/evidencias
 *
 * multipart/form-data:
 *
 * file        → archivo
 * etapa       → ANTES | EN_PROCESO | DESPUES
 * descripcion → opcional
 */
router.post(
    "/:id/evidencias",
    verificarBitacoraPropia,
    upload.single(
        "file"
    ),
    agregarEvidenciaBitacora
);

/**
 * DELETE /:id/evidencias/:evidenciaId
 */
router.delete(
    "/:id/evidencias/:evidenciaId",
    verificarBitacoraPropia,
    eliminarEvidenciaBitacora
);

/* =========================================================
   EXPORT
========================================================= */

export default router;