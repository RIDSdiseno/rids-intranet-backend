// src/controllers/controllers-bitacora-tecnico/bitacora-etapas.controller.ts
import { EstadoBitacoraTecnico, EstadoEtapaBitacora, EstadoAprobacionBitacora, EtapaBitacora, Prisma, TipoEventoBitacora, } from "@prisma/client";
import { prismaBase as prisma, } from "../../lib/prisma.js";
import { agregarUrlsFirmadasAEvidencias, } from "../../service/bitacora/bitacora-evidencias-storage.service.js";
import { enviarCorreoResultadoRevisionBitacora, enviarCorreoSolicitudRevisionBitacora, } from "../../service/bitacora/bitacora-mail.service.js";
import { obtenerActorBitacora, puedeModificarBitacora, } from "../../service/bitacora/bitacora-permisos.helper.js";
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
            },
        });
        if (!bitacora) {
            return res.status(404).json({
                error: "Bitácora no encontrada",
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
                    },
                },
            },
        });
        if (!existente) {
            return res.status(404).json({
                error: "Etapa no encontrada",
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
        const aprobadorId = parsePositiveInt(req.body.aprobadorId);
        const solicitadoPorId = obtenerUsuarioId(req);
        if (!bitacoraId ||
            !etapaId ||
            !aprobadorId) {
            return res.status(400).json({
                error: "Datos de revisión inválidos",
            });
        }
        if (!solicitadoPorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado",
            });
        }
        if (solicitadoPorId ===
            aprobadorId) {
            return res.status(400).json({
                error: "El usuario revisor debe ser distinto al usuario solicitante",
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
                        id: true,
                        titulo: true,
                        descripcion: true,
                        tecnicoId: true,
                    },
                },
            },
        });
        if (!etapa) {
            return res.status(404).json({
                error: "Etapa no encontrada",
            });
        }
        if (aprobadorId ===
            etapa.bitacora.tecnicoId) {
            return res.status(400).json({
                error: "El revisor debe ser distinto al técnico responsable de la bitácora",
            });
        }
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
        if (!etapa.descripcion?.trim()) {
            return res.status(409).json({
                error: "Debes registrar una descripción de la etapa antes de solicitar revisión",
            });
        }
        if (etapa.estado !==
            EstadoEtapaBitacora.EN_PROCESO &&
            etapa.estado !==
                EstadoEtapaBitacora.RECHAZADA) {
            return res.status(409).json({
                error: "La etapa no se encuentra disponible para solicitar revisión",
            });
        }
        const revisionPendiente = await prisma.bitacoraAprobacion.findFirst({
            where: {
                etapaId,
                estado: EstadoAprobacionBitacora.PENDIENTE,
            },
        });
        if (revisionPendiente) {
            return res.status(409).json({
                error: "Ya existe una solicitud de revisión pendiente para esta etapa",
            });
        }
        const revisor = await prisma.tecnico.findFirst({
            where: {
                id_tecnico: aprobadorId,
                status: true,
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
        });
        if (!revisor) {
            return res.status(404).json({
                error: "El revisor seleccionado no existe o está inactivo",
            });
        }
        const resultado = await prisma.$transaction(async (tx) => {
            const aprobacion = await tx.bitacoraAprobacion.create({
                data: {
                    bitacoraId,
                    etapaId,
                    solicitadoPorId,
                    aprobadorId,
                    comentarioSolicitud: normalizeText(req.body
                        .comentarioSolicitud),
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
            });
            await tx.bitacoraEtapa.update({
                where: {
                    id: etapaId,
                },
                data: {
                    requiereRevision: true,
                    estado: EstadoEtapaBitacora.PENDIENTE_REVISION,
                },
            });
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId: solicitadoPorId,
                    tipo: TipoEventoBitacora.REVISION_SOLICITADA,
                    descripcion: `Revisión solicitada a ${revisor.nombre}`,
                    metadata: {
                        aprobacionId: aprobacion.id,
                        aprobadorId: revisor.id_tecnico,
                    },
                },
            });
            return aprobacion;
        });
        if (resultado.aprobador.email) {
            try {
                await enviarCorreoSolicitudRevisionBitacora({
                    destinatarioEmail: resultado.aprobador.email,
                    destinatarioNombre: resultado.aprobador.nombre,
                    solicitadoPorNombre: resultado.solicitadoPor.nombre,
                    bitacoraId,
                    tituloBitacora: etapa.bitacora.titulo,
                    etapa: etapa.etapa,
                    comentarioSolicitud: resultado.comentarioSolicitud,
                });
                console.log("[BITACORA MAIL] ✅ Solicitud de revisión enviada", {
                    bitacoraId,
                    etapaId,
                    aprobacionId: resultado.id,
                    destinatario: resultado.aprobador.email,
                });
            }
            catch (emailError) {
                console.error("[BITACORA MAIL] ❌ Error enviando solicitud de revisión:", emailError);
            }
        }
        else {
            console.warn("[BITACORA MAIL] ⚠️ Revisor sin correo", {
                bitacoraId,
                etapaId,
                aprobadorId: resultado.aprobadorId,
            });
        }
        return res.status(201).json({
            data: resultado,
            message: "Revisión solicitada correctamente",
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
                    },
                },
            },
        });
        if (!aprobacion) {
            return res.status(404).json({
                error: "Solicitud de revisión no encontrada",
            });
        }
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
            await tx.bitacoraEtapa.update({
                where: {
                    id: etapaId,
                },
                data: {
                    estado: aprobar
                        ? EstadoEtapaBitacora.APROBADA
                        : EstadoEtapaBitacora.RECHAZADA,
                    /*
                     * Aprobar una revisión NO completa la etapa.
                     */
                    completadoAt: null,
                },
            });
            await tx.bitacoraEvento.create({
                data: {
                    bitacoraId,
                    etapaId,
                    actorId,
                    tipo: aprobar
                        ? TipoEventoBitacora.REVISION_APROBADA
                        : TipoEventoBitacora.REVISION_RECHAZADA,
                    descripcion: aprobar
                        ? `Etapa ${aprobacion.etapa.etapa} aprobada`
                        : `Etapa ${aprobacion.etapa.etapa} rechazada`,
                    metadata: {
                        aprobacionId: aprobacion.id,
                    },
                },
            });
            return actualizada;
        });
        if (aprobacion.solicitadoPor.email) {
            try {
                await enviarCorreoResultadoRevisionBitacora({
                    destinatarioEmail: aprobacion.solicitadoPor.email,
                    destinatarioNombre: aprobacion.solicitadoPor.nombre,
                    revisorNombre: aprobacion.aprobador.nombre,
                    bitacoraId,
                    tituloBitacora: aprobacion.bitacora.titulo,
                    etapa: aprobacion.etapa.etapa,
                    aprobada: aprobar,
                    comentarioRespuesta: resultado.comentarioRespuesta,
                });
                console.log("[BITACORA MAIL] ✅ Resultado de revisión enviado", {
                    bitacoraId,
                    etapaId,
                    aprobacionId,
                    resultado: aprobar
                        ? "APROBADA"
                        : "RECHAZADA",
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
                solicitadoPorId: aprobacion.solicitadoPorId,
            });
        }
        return res.json({
            data: resultado,
            message: aprobar
                ? "Revisión aprobada correctamente"
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
                    },
                },
            },
        });
        if (!etapa) {
            return res.status(404).json({
                error: "Etapa no encontrada",
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