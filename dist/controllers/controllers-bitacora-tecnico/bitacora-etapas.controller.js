// src/controllers/controllers-bitacora-tecnico/bitacora-etapas.controller.ts
import { EstadoBitacoraTecnico, EstadoEtapaBitacora, EstadoAprobacionBitacora, EtapaBitacora, Prisma, TipoEventoBitacora, } from "@prisma/client";
import { prismaBase as prisma, } from "../../lib/prisma.js";
import { agregarUrlsFirmadasAEvidencias, } from "../../service/bitacora/bitacora-evidencias-storage.service.js";
import { enviarCorreoResultadoRevisionBitacora, enviarCorreoSolicitudRevisionBitacora, } from "../../service/bitacora/bitacora-mail.service.js";
import { obtenerActorBitacora, puedeModificarBitacora, } from "../../service/bitacora/bitacora-permisos.helper.js";
import { randomUUID } from "crypto";
/* =====================================================
   HELPERS
===================================================== */
function parsePositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) &&
        n > 0
        ? n
        : undefined;
}
function normalizeText(value) {
    if (typeof value !==
        "string") {
        return null;
    }
    const text = value
        .trim()
        .replace(/\s+/g, " ");
    return text ||
        null;
}
function obtenerUsuarioId(req) {
    const user = req.user;
    return (parsePositiveInt(user?.id_tecnico) ??
        parsePositiveInt(user?.tecnicoId) ??
        parsePositiveInt(user?.id) ??
        parsePositiveInt(user?.userId));
}
/* =====================================================
   OBTENER SIGUIENTE ETAPA
===================================================== */
function obtenerSiguienteEtapa(etapa) {
    switch (etapa) {
        case EtapaBitacora.ANTES:
            return EtapaBitacora.EN_PROCESO;
        case EtapaBitacora.EN_PROCESO:
            return EtapaBitacora.DESPUES;
        case EtapaBitacora.DESPUES:
            return null;
        default:
            return null;
    }
}
/* =====================================================
   AVANZAR WORKFLOW
===================================================== */
async function avanzarDespuesDeCompletarEtapa({ tx, bitacoraId, etapaActual, actorId, }) {
    const siguienteEtapaTipo = obtenerSiguienteEtapa(etapaActual.etapa);
    /*
     * Si no existe etapa siguiente,
     * significa que DESPUES fue completada.
     */
    if (!siguienteEtapaTipo) {
        await tx.bitacoraTecnico.update({
            where: {
                id: bitacoraId,
            },
            data: {
                estado: EstadoBitacoraTecnico.CERRADA,
            },
        });
        await tx.bitacoraEvento.create({
            data: {
                bitacoraId,
                etapaId: etapaActual.id,
                actorId,
                tipo: TipoEventoBitacora.BITACORA_CERRADA,
                descripcion: "Bitácora técnica cerrada",
            },
        });
        return;
    }
    const siguienteEtapa = await tx.bitacoraEtapa.findUnique({
        where: {
            bitacoraId_etapa: {
                bitacoraId,
                etapa: siguienteEtapaTipo,
            },
        },
    });
    if (!siguienteEtapa) {
        throw new Error(`No existe la etapa ${siguienteEtapaTipo} para la bitácora ${bitacoraId}`);
    }
    /*
     * Activar siguiente etapa.
     */
    await tx.bitacoraEtapa.update({
        where: {
            id: siguienteEtapa.id,
        },
        data: {
            estado: EstadoEtapaBitacora.EN_PROCESO,
            iniciadoAt: siguienteEtapa.iniciadoAt ??
                new Date(),
            completadoAt: null,
        },
    });
    await tx.bitacoraEvento.create({
        data: {
            bitacoraId,
            etapaId: siguienteEtapa.id,
            actorId,
            tipo: TipoEventoBitacora.ETAPA_INICIADA,
            descripcion: `Etapa ${siguienteEtapa.etapa} iniciada`,
        },
    });
    /*
     * Al salir de ANTES ya consideramos
     * la bitácora en ejecución.
     */
    if (siguienteEtapaTipo ===
        EtapaBitacora.EN_PROCESO) {
        await tx.bitacoraTecnico.update({
            where: {
                id: bitacoraId,
            },
            data: {
                estado: EstadoBitacoraTecnico.EN_PROCESO,
            },
        });
    }
}
/* =====================================================
   GET /:id/etapas
===================================================== */
export async function obtenerEtapasBitacora(req, res) {
    try {
        const bitacoraId = parsePositiveInt(req.params.id);
        if (!bitacoraId) {
            return res.status(400).json({
                error: "ID de bitácora inválido",
            });
        }
        const bitacora = await prisma.bitacoraTecnico.findUnique({
            where: {
                id: bitacoraId,
            },
            select: {
                id: true,
                usaEtapas: true,
            },
        });
        if (!bitacora) {
            return res.status(404).json({
                error: "Bitácora no encontrada",
            });
        }
        if (!bitacora.usaEtapas) {
            return res.json({
                data: [],
            });
        }
        const etapas = await prisma.bitacoraEtapa.findMany({
            where: {
                bitacoraId,
            },
            orderBy: {
                id: "asc",
            },
            include: {
                evidencias: {
                    orderBy: {
                        createdAt: "asc",
                    },
                    include: {
                        subidoPor: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                                email: true,
                                rol: true,
                            },
                        },
                    },
                },
                aprobaciones: {
                    orderBy: {
                        solicitadoAt: "desc",
                    },
                    include: {
                        solicitadoPor: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                                email: true,
                            },
                        },
                        aprobador: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        const etapasConUrls = await Promise.all(etapas.map(async (etapa) => ({
            ...etapa,
            evidencias: await agregarUrlsFirmadasAEvidencias(etapa.evidencias),
        })));
        return res.json({
            data: etapasConUrls,
        });
    }
    catch (error) {
        console.error("❌ Error obteniendo etapas de bitácora:", error);
        return res.status(500).json({
            error: "Error al obtener etapas de la bitácora",
        });
    }
}
/* =====================================================
   PATCH /:id/etapas/:etapaId
===================================================== */
export async function actualizarEtapaBitacora(req, res) {
    try {
        const bitacoraId = parsePositiveInt(req.params.id);
        const etapaId = parsePositiveInt(req.params.etapaId);
        if (!bitacoraId ||
            !etapaId) {
            return res.status(400).json({
                error: "IDs inválidos",
            });
        }
        const actorId = obtenerUsuarioId(req);
        if (!actorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado",
            });
        }
        const existente = await prisma.bitacoraEtapa.findFirst({
            where: {
                id: etapaId,
                bitacoraId,
            },
            include: {
                bitacora: {
                    select: {
                        tecnicoId: true,
                        usaEtapas: true,
                    },
                },
            },
        });
        if (!existente) {
            return res.status(404).json({
                error: "Etapa no encontrada",
            });
        }
        if (!existente
            .bitacora
            .usaEtapas) {
            return res.status(409).json({
                error: "Esta bitácora no utiliza seguimiento por etapas",
            });
        }
        const actor = obtenerActorBitacora(req);
        if (!puedeModificarBitacora({
            actorId: actor.tecnicoId,
            rol: actor.rol,
            tecnicoResponsableId: existente.bitacora.tecnicoId,
        })) {
            return res.status(403).json({
                error: "No tienes permisos para modificar esta bitácora",
            });
        }
        /*
         * Etapa todavía bloqueada.
         */
        if (existente.estado ===
            EstadoEtapaBitacora.PENDIENTE) {
            return res.status(409).json({
                error: "Esta etapa todavía no ha sido iniciada",
            });
        }
        /*
         * No permitir cambios mientras otro usuario revisa.
         */
        if (existente.estado ===
            EstadoEtapaBitacora.PENDIENTE_REVISION) {
            return res.status(409).json({
                error: "La etapa está pendiente de revisión y no puede modificarse",
            });
        }
        /*
         * Etapas finalizadas quedan inmutables.
         */
        if (existente.estado ===
            EstadoEtapaBitacora.APROBADA ||
            existente.estado ===
                EstadoEtapaBitacora.COMPLETADA) {
            return res.status(409).json({
                error: "La etapa ya fue finalizada y no puede modificarse",
            });
        }
        /*
         * PATCH real:
         * si no viene el campo se conserva.
         */
        const descripcion = req.body.descripcion !==
            undefined
            ? normalizeText(req.body.descripcion)
            : existente.descripcion;
        const titulo = req.body.titulo !==
            undefined
            ? normalizeText(req.body.titulo)
            : existente.titulo;
        /*
         * Validar requiereRevision solamente
         * cuando viene explícitamente en el PATCH.
         */
        if (req.body.requiereRevision !== undefined &&
            typeof req.body.requiereRevision !== "boolean") {
            return res.status(400).json({
                error: "El campo requiereRevision debe ser booleano",
            });
        }
        const tieneHistorialRevision = await prisma.bitacoraAprobacion.findFirst({
            where: {
                etapaId,
            },
            select: {
                id: true,
            },
        });
        /*
         * Si la etapa ya tuvo un proceso de revisión,
         * conserva requiereRevision=true.
         *
         * Si todavía no tiene historial, permitimos
         * modificarlo desde el formulario.
         *
         * Si el campo no viene en el PATCH,
         * conservamos el valor existente.
         */
        const requiereRevision = tieneHistorialRevision
            ? true
            : req.body.requiereRevision !== undefined
                ? req.body.requiereRevision
                : existente.requiereRevision;
        const etapa = await prisma.$transaction(async (tx) => {
            const actualizada = await tx.bitacoraEtapa.update({
                where: {
                    id: etapaId,
                },
                data: {
                    titulo,
                    descripcion,
                    requiereRevision,
                    /*
                     * Si estaba rechazada y el técnico
                     * hace cambios, vuelve a EN_PROCESO.
                     */
                    estado: existente.estado ===
                        EstadoEtapaBitacora.RECHAZADA
                        ? EstadoEtapaBitacora.EN_PROCESO
                        : existente.estado,
                },
            });
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId,
                    tipo: TipoEventoBitacora.ETAPA_ACTUALIZADA,
                    descripcion: `Etapa ${existente.etapa} actualizada`,
                },
            });
            return actualizada;
        });
        return res.json({
            data: etapa,
            message: "Etapa actualizada correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error actualizando etapa:", error);
        return res.status(500).json({
            error: "Error al actualizar la etapa",
        });
    }
}
/* =====================================================
   POST /:id/etapas/:etapaId/solicitar-revision
===================================================== */
export async function solicitarRevisionEtapa(req, res) {
    try {
        const bitacoraId = parsePositiveInt(req.params.id);
        const etapaId = parsePositiveInt(req.params.etapaId);
        const solicitadoPorId = obtenerUsuarioId(req);
        if (!bitacoraId ||
            !etapaId) {
            return res.status(400).json({
                error: "Datos de revisión inválidos",
            });
        }
        if (!solicitadoPorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado",
            });
        }
        /*
         * =====================================================
         * REVISORES
         * =====================================================
         *
         * El frontend envía:
         *
         * {
         *     aprobadoresIds: [2, 3, 4]
         * }
         */
        const aprobadoresIdsRaw = Array.isArray(req.body.aprobadoresIds)
            ? req.body.aprobadoresIds
            : [];
        const aprobadoresIdsParseados = aprobadoresIdsRaw.map((value) => parsePositiveInt(value));
        const aprobadoresIds = Array.from(new Set(aprobadoresIdsParseados.filter((value) => value !==
            undefined)));
        /*
         * Mínimo 1 revisor.
         * Máximo 4 revisores.
         */
        if (aprobadoresIds.length <
            1 ||
            aprobadoresIds.length >
                4) {
            return res.status(400).json({
                error: "Debes seleccionar entre 1 y 4 revisores",
            });
        }
        /*
         * El solicitante no puede revisarse
         * a sí mismo.
         */
        if (aprobadoresIds.includes(solicitadoPorId)) {
            return res.status(400).json({
                error: "El usuario solicitante no puede ser revisor de su propia solicitud",
            });
        }
        /*
         * =====================================================
         * ETAPA
         * =====================================================
         */
        const etapa = await prisma.bitacoraEtapa.findFirst({
            where: {
                id: etapaId,
                bitacoraId,
            },
            include: {
                _count: {
                    select: {
                        evidencias: true,
                    },
                },
                bitacora: {
                    select: {
                        id: true,
                        titulo: true,
                        descripcion: true,
                        tecnicoId: true,
                        usaEtapas: true,
                    },
                },
            },
        });
        if (!etapa) {
            return res.status(404).json({
                error: "Etapa no encontrada",
            });
        }
        if (!etapa
            .bitacora
            .usaEtapas) {
            return res.status(409).json({
                error: "Esta bitácora no utiliza seguimiento por etapas",
            });
        }
        /*
         * Ningún revisor puede ser el técnico
         * responsable de la bitácora.
         */
        if (aprobadoresIds.includes(etapa.bitacora.tecnicoId)) {
            return res.status(400).json({
                error: "El técnico responsable de la bitácora no puede ser revisor",
            });
        }
        /*
         * =====================================================
         * PERMISOS
         * =====================================================
         */
        const actor = obtenerActorBitacora(req);
        if (!puedeModificarBitacora({
            actorId: actor.tecnicoId,
            rol: actor.rol,
            tecnicoResponsableId: etapa.bitacora.tecnicoId,
        })) {
            return res.status(403).json({
                error: "Solo el técnico responsable o un administrador puede solicitar una revisión",
            });
        }
        /*
         * Debe existir descripción.
         */
        if (!etapa.descripcion?.trim()) {
            return res.status(409).json({
                error: "Debes registrar una descripción de la etapa antes de solicitar revisión",
            });
        }
        /*
         * Solo una etapa editable puede solicitar
         * una nueva revisión.
         */
        if (etapa.estado !==
            EstadoEtapaBitacora.EN_PROCESO &&
            etapa.estado !==
                EstadoEtapaBitacora.RECHAZADA) {
            return res.status(409).json({
                error: "La etapa no se encuentra disponible para solicitar revisión",
            });
        }
        /*
         * No puede existir otra solicitud
         * pendiente para la misma etapa.
         */
        const revisionPendiente = await prisma.bitacoraAprobacion.findFirst({
            where: {
                etapaId,
                estado: EstadoAprobacionBitacora.PENDIENTE,
            },
            select: {
                id: true,
            },
        });
        if (revisionPendiente) {
            return res.status(409).json({
                error: "Ya existe una solicitud de revisión pendiente para esta etapa",
            });
        }
        /*
         * =====================================================
         * VALIDAR REVISORES
         * =====================================================
         */
        const revisores = await prisma.tecnico.findMany({
            where: {
                id_tecnico: {
                    in: aprobadoresIds,
                },
                status: true,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
        });
        /*
         * Si solicitamos 3 IDs y Prisma devuelve 2,
         * alguno no existe o está inactivo.
         */
        if (revisores.length !==
            aprobadoresIds.length) {
            return res.status(400).json({
                error: "Uno o más revisores seleccionados no existen o están inactivos",
            });
        }
        /*
         * =====================================================
         * IDENTIFICADOR DE LA SOLICITUD
         * =====================================================
         *
         * Todas las aprobaciones creadas aquí
         * pertenecen a la misma solicitud.
         */
        const solicitudRevisionId = randomUUID();
        const comentarioSolicitud = normalizeText(req.body
            .comentarioSolicitud);
        /*
         * =====================================================
         * CREAR SOLICITUD
         * =====================================================
         */
        const resultado = await prisma.$transaction(async (tx) => {
            const aprobaciones = await Promise.all(revisores.map((revisor) => tx.bitacoraAprobacion.create({
                data: {
                    bitacoraId,
                    etapaId,
                    solicitudRevisionId,
                    solicitadoPorId,
                    aprobadorId: revisor.id_tecnico,
                    estado: EstadoAprobacionBitacora.PENDIENTE,
                    comentarioSolicitud,
                },
                include: {
                    solicitadoPor: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },
                    aprobador: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },
                },
            })));
            /*
             * La etapa queda bloqueada
             * mientras existan revisiones pendientes.
             */
            await tx.bitacoraEtapa.update({
                where: {
                    id: etapaId,
                },
                data: {
                    requiereRevision: true,
                    estado: EstadoEtapaBitacora.PENDIENTE_REVISION,
                    completadoAt: null,
                },
            });
            /*
             * Un solo evento representa la solicitud completa.
             */
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId: solicitadoPorId,
                    tipo: TipoEventoBitacora.REVISION_SOLICITADA,
                    descripcion: revisores.length ===
                        1 &&
                        revisores[0]
                        ? `Revisión solicitada a ${revisores[0].nombre}`
                        : `Revisión solicitada a ${revisores.length} revisores`,
                    metadata: {
                        solicitudRevisionId,
                        aprobadoresIds: revisores.map((revisor) => revisor.id_tecnico),
                        aprobacionesIds: aprobaciones.map((aprobacion) => aprobacion.id),
                    },
                },
            });
            return {
                solicitudRevisionId,
                aprobaciones,
            };
        });
        /*
         * =====================================================
         * CORREOS
         * =====================================================
         *
         * Nunca dentro de la transacción.
         *
         * Si un correo falla, las revisiones ya
         * siguen correctamente registradas.
         */
        for (const aprobacion of resultado.aprobaciones) {
            if (!aprobacion
                .aprobador
                .email) {
                console.warn("[BITACORA MAIL] ⚠️ Revisor sin correo", {
                    bitacoraId,
                    etapaId,
                    aprobadorId: aprobacion
                        .aprobadorId,
                });
                continue;
            }
            try {
                await enviarCorreoSolicitudRevisionBitacora({
                    destinatarioEmail: aprobacion
                        .aprobador
                        .email,
                    destinatarioNombre: aprobacion
                        .aprobador
                        .nombre,
                    solicitadoPorNombre: aprobacion
                        .solicitadoPor
                        .nombre,
                    bitacoraId,
                    tituloBitacora: etapa.bitacora
                        .titulo,
                    etapa: etapa.etapa,
                    comentarioSolicitud: aprobacion
                        .comentarioSolicitud,
                });
                console.log("[BITACORA MAIL] ✅ Solicitud de revisión enviada", {
                    bitacoraId,
                    etapaId,
                    solicitudRevisionId: resultado
                        .solicitudRevisionId,
                    aprobacionId: aprobacion.id,
                    aprobadorId: aprobacion
                        .aprobadorId,
                    destinatario: aprobacion
                        .aprobador
                        .email,
                });
            }
            catch (emailError) {
                console.error("[BITACORA MAIL] ❌ Error enviando solicitud de revisión:", {
                    bitacoraId,
                    etapaId,
                    aprobacionId: aprobacion.id,
                    aprobadorId: aprobacion
                        .aprobadorId,
                    emailError,
                });
            }
        }
        return res.status(201).json({
            data: resultado,
            message: resultado.aprobaciones.length ===
                1
                ? "Revisión solicitada correctamente"
                : `Revisión solicitada correctamente a ${resultado.aprobaciones.length} revisores`,
        });
    }
    catch (error) {
        console.error("❌ Error solicitando revisión:", error);
        return res.status(500).json({
            error: "Error al solicitar la revisión",
        });
    }
}
/* =====================================================
   POST .../aprobaciones/:aprobacionId/responder
===================================================== */
export async function responderRevisionEtapa(req, res) {
    try {
        const bitacoraId = parsePositiveInt(req.params.id);
        const etapaId = parsePositiveInt(req.params.etapaId);
        const aprobacionId = parsePositiveInt(req.params.aprobacionId);
        const actorId = obtenerUsuarioId(req);
        const aprobar = req.body.aprobar;
        if (!bitacoraId ||
            !etapaId ||
            !aprobacionId) {
            return res.status(400).json({
                error: "IDs inválidos",
            });
        }
        if (!actorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado",
            });
        }
        if (typeof aprobar !==
            "boolean") {
            return res.status(400).json({
                error: "El campo aprobar debe ser booleano",
            });
        }
        /*
         * =====================================================
         * BUSCAR APROBACIÓN
         * =====================================================
         */
        const aprobacion = await prisma.bitacoraAprobacion.findFirst({
            where: {
                id: aprobacionId,
                bitacoraId,
                etapaId,
            },
            include: {
                etapa: true,
                solicitadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                aprobador: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                bitacora: {
                    select: {
                        id: true,
                        titulo: true,
                        usaEtapas: true,
                    },
                },
            },
        });
        if (!aprobacion) {
            return res.status(404).json({
                error: "Solicitud de revisión no encontrada",
            });
        }
        if (!aprobacion
            .bitacora
            .usaEtapas) {
            return res.status(409).json({
                error: "Esta bitácora no utiliza seguimiento por etapas",
            });
        }
        /*
         * Solo puede responder el revisor
         * al que pertenece esta aprobación.
         */
        if (aprobacion.aprobadorId !==
            actorId) {
            return res.status(403).json({
                error: "Solo el revisor asignado puede responder esta revisión",
            });
        }
        if (aprobacion.estado !==
            EstadoAprobacionBitacora.PENDIENTE) {
            return res.status(409).json({
                error: "Esta revisión ya fue respondida",
            });
        }
        /*
         * =====================================================
         * RESPONDER
         * =====================================================
         */
        const resultado = await prisma.$transaction(async (tx) => {
            const ahora = new Date();
            const actualizada = await tx.bitacoraAprobacion.update({
                where: {
                    id: aprobacion.id,
                },
                data: {
                    estado: aprobar
                        ? EstadoAprobacionBitacora.APROBADA
                        : EstadoAprobacionBitacora.RECHAZADA,
                    comentarioRespuesta: normalizeText(req.body
                        .comentarioRespuesta),
                    respondidoAt: ahora,
                },
            });
            /*
             * =====================================================
             * COMPATIBILIDAD CON REVISIONES ANTIGUAS
             * =====================================================
             *
             * Las revisiones creadas antes de este cambio
             * no poseen solicitudRevisionId.
             *
             * En ese caso conservamos el comportamiento
             * de una única revisión.
             */
            if (!aprobacion.solicitudRevisionId) {
                await tx.bitacoraEtapa.update({
                    where: {
                        id: etapaId,
                    },
                    data: {
                        estado: aprobar
                            ? EstadoEtapaBitacora.APROBADA
                            : EstadoEtapaBitacora.RECHAZADA,
                        completadoAt: null,
                    },
                });
            }
            else if (!aprobar) {
                /*
                 * =====================================================
                 * RECHAZO
                 * =====================================================
                 *
                 * Un solo rechazo hace fallar la solicitud completa.
                 *
                 * Las demás revisiones pendientes de la misma
                 * solicitud se cancelan.
                 */
                await tx.bitacoraAprobacion.updateMany({
                    where: {
                        etapaId,
                        solicitudRevisionId: aprobacion
                            .solicitudRevisionId,
                        id: {
                            not: aprobacion.id,
                        },
                        estado: EstadoAprobacionBitacora.PENDIENTE,
                    },
                    data: {
                        estado: EstadoAprobacionBitacora.CANCELADA,
                        respondidoAt: ahora,
                    },
                });
                await tx.bitacoraEtapa.update({
                    where: {
                        id: etapaId,
                    },
                    data: {
                        estado: EstadoEtapaBitacora.RECHAZADA,
                        completadoAt: null,
                    },
                });
            }
            else {
                /*
                 * =====================================================
                 * APROBACIÓN
                 * =====================================================
                 *
                 * Si este revisor aprobó, debemos comprobar
                 * si quedan revisores pendientes dentro de
                 * esta misma solicitud.
                 */
                const pendientes = await tx.bitacoraAprobacion.count({
                    where: {
                        etapaId,
                        solicitudRevisionId: aprobacion
                            .solicitudRevisionId,
                        estado: EstadoAprobacionBitacora.PENDIENTE,
                    },
                });
                const rechazadas = await tx.bitacoraAprobacion.count({
                    where: {
                        etapaId,
                        solicitudRevisionId: aprobacion
                            .solicitudRevisionId,
                        estado: EstadoAprobacionBitacora.RECHAZADA,
                    },
                });
                /*
                 * Solo cuando TODOS hayan aprobado:
                 *
                 * pendientes = 0
                 * rechazadas = 0
                 */
                if (pendientes ===
                    0 &&
                    rechazadas ===
                        0) {
                    await tx.bitacoraEtapa.update({
                        where: {
                            id: etapaId,
                        },
                        data: {
                            estado: EstadoEtapaBitacora.APROBADA,
                            completadoAt: null,
                        },
                    });
                }
                else {
                    /*
                     * Todavía quedan revisores.
                     */
                    await tx.bitacoraEtapa.update({
                        where: {
                            id: etapaId,
                        },
                        data: {
                            estado: EstadoEtapaBitacora.PENDIENTE_REVISION,
                            completadoAt: null,
                        },
                    });
                }
            }
            /*
             * =====================================================
             * EVENTO
             * =====================================================
             */
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId,
                    tipo: aprobar
                        ? TipoEventoBitacora.REVISION_APROBADA
                        : TipoEventoBitacora.REVISION_RECHAZADA,
                    descripcion: aprobar
                        ? `Revisión de ${aprobacion.aprobador.nombre} aprobada para la etapa ${aprobacion.etapa.etapa}`
                        : `Revisión de ${aprobacion.aprobador.nombre} rechazada para la etapa ${aprobacion.etapa.etapa}`,
                    metadata: {
                        aprobacionId: aprobacion.id,
                        solicitudRevisionId: aprobacion
                            .solicitudRevisionId,
                        aprobadorId: aprobacion
                            .aprobadorId,
                    },
                },
            });
            /*
             * Consultar estado final de la etapa
             * para devolverlo al frontend.
             */
            const etapaActualizada = await tx.bitacoraEtapa.findUnique({
                where: {
                    id: etapaId,
                },
                select: {
                    id: true,
                    estado: true,
                },
            });
            /*
             * =====================================================
             * RESUMEN DE LA SOLICITUD DE REVISIÓN
             * =====================================================
             *
             * Para solicitudes nuevas usamos solicitudRevisionId.
             *
             * Para revisiones antiguas sin solicitudRevisionId,
             * tratamos la aprobación actual como una solicitud
             * de un solo revisor.
             */
            const aprobacionesSolicitud = aprobacion.solicitudRevisionId
                ? await tx.bitacoraAprobacion.findMany({
                    where: {
                        etapaId,
                        solicitudRevisionId: aprobacion
                            .solicitudRevisionId,
                    },
                    select: {
                        estado: true,
                    },
                })
                : [
                    {
                        estado: actualizada.estado,
                    },
                ];
            const totalRevisores = aprobacionesSolicitud.length;
            const totalAprobados = aprobacionesSolicitud.filter(item => item.estado ===
                EstadoAprobacionBitacora.APROBADA).length;
            const totalPendientes = aprobacionesSolicitud.filter(item => item.estado ===
                EstadoAprobacionBitacora.PENDIENTE).length;
            const totalRechazados = aprobacionesSolicitud.filter(item => item.estado ===
                EstadoAprobacionBitacora.RECHAZADA).length;
            const totalCancelados = aprobacionesSolicitud.filter(item => item.estado ===
                EstadoAprobacionBitacora.CANCELADA).length;
            return {
                aprobacion: actualizada,
                etapa: etapaActualizada,
                resumenRevision: {
                    totalRevisores,
                    totalAprobados,
                    totalPendientes,
                    totalRechazados,
                    totalCancelados,
                },
            };
        });
        /*
         * =====================================================
         * CORREO AL SOLICITANTE
         * =====================================================
         */
        if (aprobacion.solicitadoPor.email) {
            try {
                await enviarCorreoResultadoRevisionBitacora({
                    destinatarioEmail: aprobacion
                        .solicitadoPor
                        .email,
                    destinatarioNombre: aprobacion
                        .solicitadoPor
                        .nombre,
                    revisorNombre: aprobacion
                        .aprobador
                        .nombre,
                    bitacoraId,
                    tituloBitacora: aprobacion
                        .bitacora
                        .titulo,
                    etapa: aprobacion
                        .etapa
                        .etapa,
                    aprobada: aprobar,
                    comentarioRespuesta: resultado
                        .aprobacion
                        .comentarioRespuesta,
                    totalRevisores: resultado
                        .resumenRevision
                        .totalRevisores,
                    totalAprobados: resultado
                        .resumenRevision
                        .totalAprobados,
                    totalPendientes: resultado
                        .resumenRevision
                        .totalPendientes,
                    etapaAprobada: resultado
                        .etapa
                        ?.estado ===
                        EstadoEtapaBitacora.APROBADA,
                    etapaRechazada: resultado
                        .etapa
                        ?.estado ===
                        EstadoEtapaBitacora.RECHAZADA,
                });
                console.log("[BITACORA MAIL] ✅ Resultado de revisión enviado", {
                    bitacoraId,
                    etapaId,
                    aprobacionId,
                    solicitudRevisionId: aprobacion
                        .solicitudRevisionId,
                    resultadoIndividual: aprobar
                        ? "APROBADA"
                        : "RECHAZADA",
                    estadoEtapa: resultado
                        .etapa
                        ?.estado,
                    totalRevisores: resultado
                        .resumenRevision
                        .totalRevisores,
                    totalAprobados: resultado
                        .resumenRevision
                        .totalAprobados,
                    totalPendientes: resultado
                        .resumenRevision
                        .totalPendientes,
                    destinatario: aprobacion
                        .solicitadoPor
                        .email,
                });
            }
            catch (emailError) {
                console.error("[BITACORA MAIL] ❌ Error enviando resultado de revisión:", emailError);
            }
        }
        else {
            console.warn("[BITACORA MAIL] ⚠️ Solicitante sin correo", {
                bitacoraId,
                aprobacionId,
                solicitadoPorId: aprobacion
                    .solicitadoPorId,
            });
        }
        /*
         * =====================================================
         * RESPUESTA
         * =====================================================
         */
        return res.json({
            data: resultado,
            message: aprobar
                ? resultado.etapa
                    ?.estado ===
                    EstadoEtapaBitacora.APROBADA
                    ? "Revisión aprobada. Todos los revisores aprobaron la etapa."
                    : "Revisión aprobada. Aún existen revisores pendientes."
                : "Revisión rechazada correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error respondiendo revisión:", error);
        return res.status(500).json({
            error: "Error al responder la revisión",
        });
    }
}
/* =====================================================
   POST /:id/etapas/:etapaId/completar
===================================================== */
export async function completarEtapaBitacora(req, res) {
    try {
        const bitacoraId = parsePositiveInt(req.params.id);
        const etapaId = parsePositiveInt(req.params.etapaId);
        const actorId = obtenerUsuarioId(req);
        if (!bitacoraId ||
            !etapaId) {
            return res.status(400).json({
                error: "IDs inválidos",
            });
        }
        if (!actorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado",
            });
        }
        const etapa = await prisma.bitacoraEtapa.findFirst({
            where: {
                id: etapaId,
                bitacoraId,
            },
            include: {
                _count: {
                    select: {
                        evidencias: true,
                    },
                },
                bitacora: {
                    select: {
                        tecnicoId: true,
                        usaEtapas: true,
                    },
                },
            },
        });
        if (!etapa) {
            return res.status(404).json({
                error: "Etapa no encontrada",
            });
        }
        if (!etapa
            .bitacora
            .usaEtapas) {
            return res.status(409).json({
                error: "Esta bitácora no utiliza seguimiento por etapas",
            });
        }
        if (!etapa.descripcion?.trim()) {
            return res.status(409).json({
                error: "Debes registrar una descripción de la etapa antes de completarla",
            });
        }
        const actor = obtenerActorBitacora(req);
        if (!puedeModificarBitacora({
            actorId: actor.tecnicoId,
            rol: actor.rol,
            tecnicoResponsableId: etapa.bitacora.tecnicoId,
        })) {
            return res.status(403).json({
                error: "Solo el técnico responsable o un administrador puede completar esta etapa",
            });
        }
        /*
 * Sin revisión:
 * EN_PROCESO -> COMPLETADA
 *
 * Con revisión:
 * APROBADA -> COMPLETADA
 */
        const puedeCompletarSinRevision = !etapa.requiereRevision &&
            etapa.estado ===
                EstadoEtapaBitacora.EN_PROCESO;
        const puedeCompletarConRevision = etapa.requiereRevision &&
            etapa.estado ===
                EstadoEtapaBitacora.APROBADA;
        if (!puedeCompletarSinRevision &&
            !puedeCompletarConRevision) {
            if (etapa.requiereRevision &&
                etapa.estado ===
                    EstadoEtapaBitacora.EN_PROCESO) {
                return res.status(409).json({
                    error: "Esta etapa requiere revisión. Debes solicitar y obtener aprobación antes de completarla.",
                });
            }
            if (etapa.requiereRevision &&
                etapa.estado ===
                    EstadoEtapaBitacora.PENDIENTE_REVISION) {
                return res.status(409).json({
                    error: "La etapa todavía está pendiente de revisión.",
                });
            }
            if (etapa.estado ===
                EstadoEtapaBitacora.RECHAZADA) {
                return res.status(409).json({
                    error: "La etapa fue rechazada. Debes corregirla y solicitar una nueva revisión.",
                });
            }
            return res.status(409).json({
                error: "La etapa no se encuentra disponible para ser completada.",
            });
        }
        const resultado = await prisma.$transaction(async (tx) => {
            const ahora = new Date();
            const actualizada = await tx.bitacoraEtapa.update({
                where: {
                    id: etapaId,
                },
                data: {
                    estado: EstadoEtapaBitacora.COMPLETADA,
                    completadoAt: ahora,
                },
            });
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId,
                    tipo: TipoEventoBitacora.ETAPA_COMPLETADA,
                    descripcion: `Etapa ${etapa.etapa} completada`,
                },
            });
            await avanzarDespuesDeCompletarEtapa({
                tx,
                bitacoraId,
                etapaActual: {
                    id: etapa.id,
                    etapa: etapa.etapa,
                },
                actorId,
            });
            return actualizada;
        });
        return res.json({
            data: resultado,
            message: "Etapa completada correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error completando etapa:", error);
        return res.status(500).json({
            error: "Error al completar la etapa",
        });
    }
}
//# sourceMappingURL=bitacora-etapas.controller.js.map