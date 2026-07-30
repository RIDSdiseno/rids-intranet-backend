// src/controllers/recordatorios.controller.ts
import { EstadoRecordatorio, OrigenRecordatorio, Prisma, } from "@prisma/client";
import { prismaBase as prisma } from "../lib/prisma.js";
/* =====================================================
   HELPERS
===================================================== */
/**
 * Convierte un valor a entero positivo.
 * Devuelve null cuando el valor no es válido.
 */
function parsePositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0
        ? parsed
        : null;
}
/**
 * Normaliza un texto eliminando espacios repetidos.
 */
function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}
/**
 * Convierte una fecha recibida desde el frontend.
 */
function parseDateTime(value) {
    if (typeof value !== "string" ||
        !value.trim()) {
        return null;
    }
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime())
        ? null
        : date;
}
/**
 * Obtiene el ID del técnico autenticado.
 *
 * Ajusta estas propiedades si tu middleware auth
 * utiliza un nombre distinto dentro de req.
 */
function getTecnicoIdAutenticado(req) {
    const authRequest = req;
    return parsePositiveInt(authRequest.user?.id_tecnico ??
        authRequest.user?.tecnicoId ??
        authRequest.user?.userId ??
        authRequest.user?.id);
}
/**
 * Comprueba que el origen recibido pertenezca al enum.
 */
function normalizeOrigen(value) {
    if (typeof value === "string" &&
        Object.values(OrigenRecordatorio).includes(value)) {
        return value;
    }
    return OrigenRecordatorio.MANUAL;
}
/**
 * Devuelve solamente los IDs válidos.
 */
function optionalId(value) {
    return parsePositiveInt(value);
}
/**
 * Verifica que se haya enviado como máximo una relación.
 */
function contarRelacionesValidas(values) {
    return values.filter((value) => optionalId(value) !== null).length;
}
/* =====================================================
   CREAR RECORDATORIO
===================================================== */
export async function crearRecordatorio(req, res) {
    try {
        const creadoPorId = getTecnicoIdAutenticado(req);
        if (!creadoPorId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado.",
            });
        }
        const { titulo, mensaje, fechaProgramada, destinatarioId, origen, bitacoraId, ticketId, cotizacionId, visitaId, equipoId, } = req.body;
        const tituloFinal = normalizeText(titulo);
        if (!tituloFinal) {
            return res.status(400).json({
                error: "El título del recordatorio es obligatorio.",
            });
        }
        const fechaFinal = parseDateTime(fechaProgramada);
        if (!fechaFinal) {
            return res.status(400).json({
                error: "La fecha del recordatorio no es válida.",
            });
        }
        if (fechaFinal.getTime() <= Date.now()) {
            return res.status(400).json({
                error: "El recordatorio debe programarse para una fecha futura.",
            });
        }
        const destinatarioIdFinal = parsePositiveInt(destinatarioId);
        if (!destinatarioIdFinal) {
            return res.status(400).json({
                error: "El destinatario es obligatorio.",
            });
        }
        const totalRelaciones = contarRelacionesValidas([
            bitacoraId,
            ticketId,
            cotizacionId,
            visitaId,
            equipoId,
        ]);
        if (totalRelaciones > 1) {
            return res.status(400).json({
                error: "El recordatorio solo puede relacionarse con un registro principal.",
            });
        }
        const recordatorio = await prisma.recordatorio.create({
            data: {
                titulo: tituloFinal,
                mensaje: normalizeText(mensaje) ||
                    null,
                fechaProgramada: fechaFinal,
                estado: EstadoRecordatorio.PENDIENTE,
                origen: normalizeOrigen(origen),
                destinatarioId: destinatarioIdFinal,
                creadoPorId,
                bitacoraId: optionalId(bitacoraId),
                ticketId: optionalId(ticketId),
                cotizacionId: optionalId(cotizacionId),
                visitaId: optionalId(visitaId),
                equipoId: optionalId(equipoId),
            },
            include: {
                destinatario: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                    },
                },
            },
        });
        return res.status(201).json({
            data: recordatorio,
        });
    }
    catch (error) {
        console.error("Error creando recordatorio:", error);
        return res.status(500).json({
            error: "No fue posible crear el recordatorio.",
        });
    }
}
/* =====================================================
   OBTENER RECORDATORIOS DEL USUARIO
===================================================== */
export async function obtenerMisRecordatorios(req, res) {
    try {
        const tecnicoId = getTecnicoIdAutenticado(req);
        if (!tecnicoId) {
            return res.status(401).json({
                error: "No fue posible identificar al usuario autenticado.",
            });
        }
        const incluirCompletados = String(req.query.incluirCompletados ??
            "") === "true";
        const ahora = new Date();
        /*
         * Se muestran recordatorios vencidos y
         * recordatorios de los próximos 30 días.
         */
        const limiteFuturo = new Date(ahora.getTime() +
            30 *
                24 *
                60 *
                60 *
                1000);
        const where = {
            destinatarioId: tecnicoId,
            fechaProgramada: {
                lte: limiteFuturo,
            },
        };
        if (!incluirCompletados) {
            where.estado =
                EstadoRecordatorio.PENDIENTE;
        }
        const recordatorios = await prisma.recordatorio.findMany({
            where,
            orderBy: [
                {
                    fechaProgramada: "asc",
                },
                {
                    createdAt: "desc",
                },
            ],
            include: {
                bitacora: {
                    select: {
                        id: true,
                        titulo: true,
                        descripcion: true,
                    },
                },
                ticket: {
                    select: {
                        id: true,
                        publicId: true,
                        subject: true,
                        status: true,
                    },
                },
                cotizacion: {
                    select: {
                        id: true,
                        estado: true,
                        total: true,
                    },
                },
                visita: {
                    select: {
                        id_visita: true,
                        inicio: true,
                        status: true,
                    },
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                    },
                },
            },
        });
        const pendientesNoLeidos = await prisma.recordatorio.count({
            where: {
                destinatarioId: tecnicoId,
                estado: EstadoRecordatorio.PENDIENTE,
                leidoAt: null,
                OR: [
                    /*
                     * Recordatorios vencidos de cualquier origen.
                     */
                    {
                        fechaProgramada: {
                            lte: ahora,
                        },
                    },
                    /*
                     * Recordatorios de tickets pendientes dentro
                     * de los próximos 30 días.
                     */
                    {
                        origen: OrigenRecordatorio.TICKET,
                        fechaProgramada: {
                            lte: limiteFuturo,
                        },
                    },
                ],
            },
        });
        return res.json({
            data: recordatorios,
            pendientesNoLeidos,
        });
    }
    catch (error) {
        console.error("Error obteniendo recordatorios:", error);
        return res.status(500).json({
            error: "No fue posible obtener los recordatorios.",
        });
    }
}
/* =====================================================
   MARCAR COMO LEÍDO
===================================================== */
export async function marcarRecordatorioLeido(req, res) {
    try {
        const tecnicoId = getTecnicoIdAutenticado(req);
        const id = parsePositiveInt(req.params.id);
        if (!tecnicoId || !id) {
            return res.status(400).json({
                error: "Datos de recordatorio inválidos.",
            });
        }
        const resultado = await prisma.recordatorio.updateMany({
            where: {
                id,
                destinatarioId: tecnicoId,
            },
            data: {
                leidoAt: new Date(),
            },
        });
        if (resultado.count === 0) {
            return res.status(404).json({
                error: "Recordatorio no encontrado.",
            });
        }
        return res.json({
            message: "Recordatorio marcado como leído.",
        });
    }
    catch (error) {
        console.error("Error marcando recordatorio como leído:", error);
        return res.status(500).json({
            error: "No fue posible actualizar el recordatorio.",
        });
    }
}
/* =====================================================
   COMPLETAR RECORDATORIO
===================================================== */
export async function completarRecordatorio(req, res) {
    try {
        const tecnicoId = getTecnicoIdAutenticado(req);
        const id = parsePositiveInt(req.params.id);
        if (!tecnicoId || !id) {
            return res.status(400).json({
                error: "Datos de recordatorio inválidos.",
            });
        }
        /*
         * Se obtiene primero para conocer si está relacionado
         * con una bitácora técnica.
         */
        const recordatorio = await prisma.recordatorio.findFirst({
            where: {
                id,
                destinatarioId: tecnicoId,
            },
            select: {
                id: true,
                bitacoraId: true,
            },
        });
        if (!recordatorio) {
            return res.status(404).json({
                error: "Recordatorio no encontrado.",
            });
        }
        const ahora = new Date();
        /*
         * La transacción evita que Recordatorio y BitacoraTecnico
         * queden con estados distintos.
         */
        await prisma.$transaction(async (tx) => {
            await tx.recordatorio.update({
                where: {
                    id: recordatorio.id,
                },
                data: {
                    estado: EstadoRecordatorio.COMPLETADO,
                    completadoAt: ahora,
                    leidoAt: ahora,
                    canceladoAt: null,
                },
            });
            /*
             * Solo se actualiza BitacoraTecnico cuando
             * el recordatorio proviene de una bitácora.
             */
            if (recordatorio.bitacoraId) {
                await tx.bitacoraTecnico.update({
                    where: {
                        id: recordatorio.bitacoraId,
                    },
                    data: {
                        recordatorioCompletado: true,
                        recordatorioCompletadoAt: ahora,
                    },
                });
            }
        });
        return res.json({
            message: "Recordatorio completado correctamente.",
        });
    }
    catch (error) {
        console.error("Error completando recordatorio:", error);
        return res.status(500).json({
            error: "No fue posible completar el recordatorio.",
        });
    }
}
/* =====================================================
   REACTIVAR RECORDATORIO
===================================================== */
export async function reactivarRecordatorio(req, res) {
    try {
        const tecnicoId = getTecnicoIdAutenticado(req);
        const id = parsePositiveInt(req.params.id);
        if (!tecnicoId || !id) {
            return res.status(400).json({
                error: "Datos de recordatorio inválidos.",
            });
        }
        /*
         * Se obtiene la relación antes de actualizar
         * para poder sincronizar BitacoraTecnico.
         */
        const recordatorio = await prisma.recordatorio.findFirst({
            where: {
                id,
                destinatarioId: tecnicoId,
            },
            select: {
                id: true,
                bitacoraId: true,
            },
        });
        if (!recordatorio) {
            return res.status(404).json({
                error: "Recordatorio no encontrado.",
            });
        }
        await prisma.$transaction(async (tx) => {
            await tx.recordatorio.update({
                where: {
                    id: recordatorio.id,
                },
                data: {
                    estado: EstadoRecordatorio.PENDIENTE,
                    completadoAt: null,
                    canceladoAt: null,
                    leidoAt: null,
                    /*
                     * Permite que el proceso automático
                     * vuelva a mostrar el aviso.
                     */
                    notificadoAt: null,
                },
            });
            if (recordatorio.bitacoraId) {
                await tx.bitacoraTecnico.update({
                    where: {
                        id: recordatorio.bitacoraId,
                    },
                    data: {
                        recordatorioCompletado: false,
                        recordatorioCompletadoAt: null,
                        recordatorioNotificadoAt: null,
                    },
                });
            }
        });
        return res.json({
            message: "Recordatorio reactivado correctamente.",
        });
    }
    catch (error) {
        console.error("Error reactivando recordatorio:", error);
        return res.status(500).json({
            error: "No fue posible reactivar el recordatorio.",
        });
    }
}
/* =====================================================
   CANCELAR RECORDATORIO
===================================================== */
export async function cancelarRecordatorio(req, res) {
    try {
        const tecnicoId = getTecnicoIdAutenticado(req);
        const id = parsePositiveInt(req.params.id);
        if (!tecnicoId || !id) {
            return res.status(400).json({
                error: "Datos de recordatorio inválidos.",
            });
        }
        const recordatorio = await prisma.recordatorio.findFirst({
            where: {
                id,
                destinatarioId: tecnicoId,
            },
            select: {
                id: true,
                bitacoraId: true,
            },
        });
        if (!recordatorio) {
            return res.status(404).json({
                error: "Recordatorio no encontrado.",
            });
        }
        const ahora = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.recordatorio.update({
                where: {
                    id: recordatorio.id,
                },
                data: {
                    estado: EstadoRecordatorio.CANCELADO,
                    canceladoAt: ahora,
                    leidoAt: ahora,
                    completadoAt: null,
                },
            });
            /*
             * En bitácoras se elimina la fecha antigua,
             * evitando que el frontend siga mostrándola.
             */
            if (recordatorio.bitacoraId) {
                await tx.bitacoraTecnico.update({
                    where: {
                        id: recordatorio.bitacoraId,
                    },
                    data: {
                        recordatorioAt: null,
                        recordatorioCompletado: false,
                        recordatorioCompletadoAt: null,
                        recordatorioNotificadoAt: null,
                    },
                });
            }
        });
        return res.json({
            message: "Recordatorio cancelado correctamente.",
        });
    }
    catch (error) {
        console.error("Error cancelando recordatorio:", error);
        return res.status(500).json({
            error: "No fue posible cancelar el recordatorio.",
        });
    }
}
//# sourceMappingURL=recordatorios.controller.js.map