import type { Request, Response } from "express";
/**
 * Órdenes abiertas = ENTRADA (una fila por orden) que aún no
 * tiene salida. Al registrar la SALIDA, la ENTRADA pasa a COMPLETADA.
 */
export declare function obtenerOrdenesTallerPendientes(rol: string | null | undefined): Promise<{
    tecnicoId: number | null;
    id: number;
    tecnico: {
        nombre: string;
    } | null;
    equipo: {
        serial: string | null;
        marca: string;
        modelo: string;
    } | null;
    estado: string | null;
    fecha: Date;
    descripcion: string | null;
    entidad: {
        nombre: string;
    } | null;
    fechaIngreso: Date | null;
    tipoTrabajo: string;
    prioridad: import("@prisma/client").$Enums.PrioridadGestioo;
    numeroOrden: string | null;
}[]>;
type VisitaVencidaCampana = {
    /** técnico|empresa|fecha: una jornada (el modo lote crea una visita por solicitante). */
    clave: string;
    empresaId: number;
    empresaNombre: string;
    tecnicoId: number;
    tecnicoNombre: string;
    /** YYYY-MM-DD en Chile */
    fecha: string;
    inicio: Date;
    /** Días desde el inicio (1 o más). */
    dias: number;
    visitaIds: number[];
    solicitantes: string[];
};
/**
 * Visitas que siguen PENDIENTE más de 24 horas después de su inicio,
 * agrupadas por jornada (técnico + empresa + día).
 */
export declare function obtenerVisitasVencidas(rol: string | null | undefined, tecnicoId: number): Promise<VisitaVencidaCampana[]>;
/**
 * Tickets NEW, OPEN y PENDING (no eliminados), visibles para todos
 * los roles internos. Primero los de mayor prioridad y, dentro de
 * cada prioridad, los más antiguos.
 *
 * Devuelve también el total real, por si supera el máximo que se envía.
 */
export declare function obtenerTicketsActivos(rol: string | null | undefined): Promise<{
    tickets: {
        empresa: {
            nombre: string;
        };
        createdAt: Date;
        status: import("@prisma/client").$Enums.TicketStatus;
        id: number;
        subject: string;
        priority: import("@prisma/client").$Enums.TicketPriority;
        lastActivityAt: Date;
        requester: {
            nombre: string;
        } | null;
        assignee: {
            nombre: string;
        } | null;
    }[];
    total: number;
}>;
/**
 * Cotizaciones en BORRADOR con fecha de los últimos 30 días, visibles para
 * todos los roles internos. La más antigua primero (la que está por salir
 * de la ventana). Devuelve también el total real.
 */
export declare function obtenerCotizacionesBorrador(rol: string | null | undefined): Promise<{
    cotizaciones: {
        id: number;
        tecnico: {
            nombre: string;
        } | null;
        tipo: import("@prisma/client").$Enums.TipoCotizacionGestioo;
        fecha: Date;
        moneda: import("@prisma/client").$Enums.MonedaGestioo;
        entidad: {
            nombre: string;
        } | null;
        total: number;
        personaResponsable: string | null;
    }[];
    total: number;
}>;
export declare function crearRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerMisRecordatorios(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function marcarRecordatorioLeido(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function completarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function reactivarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function cancelarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function cancelarTodosMisRecordatorios(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export {};
//# sourceMappingURL=recordatorios.controller.d.ts.map