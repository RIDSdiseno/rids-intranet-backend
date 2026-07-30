// src/services/recordatorios/recordatorios.service.ts

import {
    EstadoRecordatorio,
    OrigenRecordatorio,
} from "@prisma/client";

import { prismaBase as prisma } from "../../lib/prisma.js";

interface SincronizarRecordatorioBitacoraParams {
    bitacoraId: number;
    tecnicoId: number;
    titulo?: string | null;
    descripcion: string;
    recordatorioAt?: Date | null;
}

interface SincronizarRecordatorioTicketParams {
    ticketId: number;
    tecnicoId: number;
    titulo?: string | null;
    descripcion?: string | null;
    recordatorioAt?: Date | null;
}

/**
 * Crea, actualiza o cancela el recordatorio global
 * relacionado con una bitácora.
 */
export async function sincronizarRecordatorioBitacora(
    params: SincronizarRecordatorioBitacoraParams
) {
    const {
        bitacoraId,
        tecnicoId,
        titulo,
        descripcion,
        recordatorioAt,
    } = params;

    const existente =
        await prisma.recordatorio.findFirst({
            where: {
                bitacoraId,
                origen:
                    OrigenRecordatorio.BITACORA,
            },

            orderBy: {
                createdAt:
                    "desc",
            },
        });

    /*
     * Si se quitó la fecha, cancelar el recordatorio existente.
     */
    if (!recordatorioAt) {
        if (existente) {
            await prisma.recordatorio.update({
                where: {
                    id:
                        existente.id,
                },

                data: {
                    estado:
                        EstadoRecordatorio.CANCELADO,

                    canceladoAt:
                        new Date(),
                },
            });
        }

        return null;
    }

    const tituloFinal =
        titulo?.trim() ||
        "Recordatorio de bitácora";

    /*
     * Si ya existe, actualizarlo y dejarlo pendiente nuevamente.
     */
    if (existente) {
        return prisma.recordatorio.update({
            where: {
                id:
                    existente.id,
            },

            data: {
                titulo:
                    tituloFinal,

                mensaje:
                    descripcion,

                fechaProgramada:
                    recordatorioAt,

                destinatarioId:
                    tecnicoId,

                estado:
                    EstadoRecordatorio.PENDIENTE,

                leidoAt:
                    null,

                notificadoAt:
                    null,

                completadoAt:
                    null,

                canceladoAt:
                    null,
            },
        });
    }

    /*
     * Crear el recordatorio global de la bitácora.
     */
    return prisma.recordatorio.create({
        data: {
            titulo:
                tituloFinal,

            mensaje:
                descripcion,

            fechaProgramada:
                recordatorioAt,

            estado:
                EstadoRecordatorio.PENDIENTE,

            origen:
                OrigenRecordatorio.BITACORA,

            destinatarioId:
                tecnicoId,

            creadoPorId:
                tecnicoId,

            bitacoraId,
        },
    });
}

/**
 * Crea, actualiza o cancela el recordatorio global
 * relacionado con un ticket.
 *
 * Este flujo sirve para tickets que quedan en PENDING.
 * Por ejemplo:
 * - Ticket pasa a PENDING: se crea recordatorio.
 * - Ticket sigue PENDING: se actualiza recordatorio existente.
 * - Ticket sale de PENDING: se cancela recordatorio pendiente.
 */
export async function sincronizarRecordatorioTicket(
    params: SincronizarRecordatorioTicketParams
) {
    const {
        ticketId,
        tecnicoId,
        titulo,
        descripcion,
        recordatorioAt,
    } = params;

    /*
     * Buscamos el último recordatorio asociado a este ticket.
     * Así evitamos crear duplicados cada vez que el ticket vuelve a PENDING.
     */
    const existente =
        await prisma.recordatorio.findFirst({
            where: {
                ticketId,
                origen:
                    OrigenRecordatorio.TICKET,
            },

            orderBy: {
                createdAt:
                    "desc",
            },
        });

    /*
     * Si no viene fecha, significa que queremos cancelar
     * el recordatorio asociado al ticket.
     *
     * Esto se usa cuando el ticket sale de PENDING,
     * por ejemplo:
     * - PENDING → OPEN
     * - PENDING → CLOSED
     * - PENDING → RESOLVED
     */
    if (!recordatorioAt) {
        if (existente) {
            await prisma.recordatorio.update({
                where: {
                    id:
                        existente.id,
                },

                data: {
                    estado:
                        EstadoRecordatorio.CANCELADO,

                    canceladoAt:
                        new Date(),

                    leidoAt:
                        new Date(),

                    completadoAt:
                        null,
                },
            });
        }

        return null;
    }

    const tituloFinal =
        titulo?.trim() ||
        `Revisar ticket pendiente #${ticketId}`;

    const mensajeFinal =
        descripcion?.trim() ||
        "Este ticket quedó pendiente y debe ser revisado nuevamente.";

    /*
     * Si ya existe un recordatorio para este ticket,
     * lo reutilizamos y lo dejamos nuevamente pendiente.
     */
    if (existente) {
        return prisma.recordatorio.update({
            where: {
                id:
                    existente.id,
            },

            data: {
                titulo:
                    tituloFinal,

                mensaje:
                    mensajeFinal,

                fechaProgramada:
                    recordatorioAt,

                destinatarioId:
                    tecnicoId,

                estado:
                    EstadoRecordatorio.PENDIENTE,

                leidoAt:
                    null,

                notificadoAt:
                    null,

                completadoAt:
                    null,

                canceladoAt:
                    null,
            },
        });
    }

    /*
     * Creamos un recordatorio nuevo asociado directamente al ticket.
     */
    return prisma.recordatorio.create({
        data: {
            titulo:
                tituloFinal,

            mensaje:
                mensajeFinal,

            fechaProgramada:
                recordatorioAt,

            estado:
                EstadoRecordatorio.PENDIENTE,

            origen:
                OrigenRecordatorio.TICKET,

            destinatarioId:
                tecnicoId,

            creadoPorId:
                tecnicoId,

            ticketId,
        },
    });
}