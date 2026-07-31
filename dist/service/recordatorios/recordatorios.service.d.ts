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
interface SincronizarRecordatorioTicketTodosParams {
    ticketId: number;
    titulo?: string | null;
    descripcion?: string | null;
    recordatorioAt?: Date | null;
}
/**
 * Crea, actualiza o cancela el recordatorio de un ticket
 * para todos los técnicos activos.
 *
 * Esto sirve para avisos globales como:
 * - nuevo ticket recibido;
 * - solicitante respondió un ticket.
 */
export declare function sincronizarRecordatorioTicketParaTodos(params: SincronizarRecordatorioTicketTodosParams): Promise<void>;
/**
 * Crea, actualiza o cancela el recordatorio global
 * relacionado con una bitácora.
 */
export declare function sincronizarRecordatorioBitacora(params: SincronizarRecordatorioBitacoraParams): Promise<{
    createdAt: Date;
    updatedAt: Date;
    origen: import("@prisma/client").$Enums.OrigenRecordatorio;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoRecordatorio;
    mensaje: string | null;
    titulo: string;
    creadoPorId: number | null;
    ticketId: number | null;
    visitaId: number | null;
    mantencionId: number | null;
    equipoId: number | null;
    cotizacionId: number | null;
    fechaProgramada: Date;
    destinatarioId: number;
    bitacoraId: number | null;
    oportunidadId: number | null;
    leidoAt: Date | null;
    notificadoAt: Date | null;
    completadoAt: Date | null;
    canceladoAt: Date | null;
} | null>;
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
export declare function sincronizarRecordatorioTicket(params: SincronizarRecordatorioTicketParams): Promise<{
    createdAt: Date;
    updatedAt: Date;
    origen: import("@prisma/client").$Enums.OrigenRecordatorio;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoRecordatorio;
    mensaje: string | null;
    titulo: string;
    creadoPorId: number | null;
    ticketId: number | null;
    visitaId: number | null;
    mantencionId: number | null;
    equipoId: number | null;
    cotizacionId: number | null;
    fechaProgramada: Date;
    destinatarioId: number;
    bitacoraId: number | null;
    oportunidadId: number | null;
    leidoAt: Date | null;
    notificadoAt: Date | null;
    completadoAt: Date | null;
    canceladoAt: Date | null;
} | null>;
export {};
//# sourceMappingURL=recordatorios.service.d.ts.map