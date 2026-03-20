import { EstadoAgenda } from "@prisma/client";
export declare class AgendaConflictError extends Error {
    constructor(message?: string);
}
export declare class AgendaPastDateError extends Error {
    constructor(message?: string);
}
export declare class AgendaNotFoundError extends Error {
    constructor(message?: string);
}
/**
 * Genera todas las AgendaVisita del mes para:
 *   - Días de semana: cada empresa recibe exactamente 1 técnico,
 *     rotando por índice circular según el día del mes.
 *   - Sábados: turno de oficina con 3 técnicos aleatorios (con rotación).
 *
 * Omite entradas que ya existen en la BD (idempotente).
 *
 * @param year  Año completo (ej: 2026)
 * @param month Mes 1-12
 */
export declare function generarMallaMensual(year: number, month: number, empresaIds?: number[], includeOficina?: boolean): Promise<{
    creadas: number;
    omitidas: number;
}>;
/**
 * Catálogo de empresas válidas para la agenda.
 * Misma fuente que generarMallaMensual: sin nombres vacíos ni "SIN EMPRESA".
 */
export declare function getEmpresasAgenda(): Promise<{
    nombre: string;
    id_empresa: number;
}[]>;
/**
 * Devuelve todas las visitas del mes con técnicos y empresa incluidos.
 */
export declare function getAgendaMensual(year: number, month: number, filtros?: {
    tecnico?: string;
    empresa?: string;
}): Promise<(Omit<{
    empresa: {
        nombre: string;
        id_empresa: number;
    } | null;
    tecnicos: ({
        tecnico: {
            nombre: string;
            email: string;
            id_tecnico: number;
        };
    } & {
        id: number;
        tecnicoId: number;
        agendaId: number;
    })[];
} & {
    id: number;
    updatedAt: Date;
    empresaId: number | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoAgenda;
    tipo: import("@prisma/client").$Enums.TipoAgenda;
    notas: string | null;
    fecha: Date;
    notificacionEnviada: boolean;
    horaFin: string | null;
    horaInicio: string | null;
    mensaje: string | null;
    recordatorioEnviado: boolean | null;
    outlookEventId: string | null;
    empresaExternaNombre: string | null;
}, "fecha"> & {
    fecha: string;
})[]>;
export declare function getAgendaDesdeOutlook(year: number, month: number): Promise<Array<{
    outlookEventId: string;
    subject: string;
    fecha: string;
    horaInicio: string | null;
    horaFin: string | null;
    tecnico: string | null;
    empresa: string | null;
    categories: string[];
}>>;
export declare function limpiarAgendaSincronizadaOutlook(year: number, month: number): Promise<{
    eliminadas: number;
}>;
export declare function sincronizarAgendaDesdeOutlook(year: number, month: number): Promise<{
    creadas: number;
    actualizadas: number;
    omitidas: number;
    errores: number;
}>;
/**
 * Devuelve las visitas de un día puntual.
 */
export declare function getAgendaPorDia(fecha: Date): Promise<(Omit<{
    empresa: {
        nombre: string;
        id_empresa: number;
    } | null;
    tecnicos: ({
        tecnico: {
            nombre: string;
            id_tecnico: number;
        };
    } & {
        id: number;
        tecnicoId: number;
        agendaId: number;
    })[];
} & {
    id: number;
    updatedAt: Date;
    empresaId: number | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoAgenda;
    tipo: import("@prisma/client").$Enums.TipoAgenda;
    notas: string | null;
    fecha: Date;
    notificacionEnviada: boolean;
    horaFin: string | null;
    horaInicio: string | null;
    mensaje: string | null;
    recordatorioEnviado: boolean | null;
    outlookEventId: string | null;
    empresaExternaNombre: string | null;
}, "fecha"> & {
    fecha: string;
})[]>;
/**
 * Actualiza una visita: puede cambiar fecha, estado, notas, mensaje, horario o empresa.
 */
export declare function actualizarAgendaVisita(id: number, datos: {
    fecha?: string | undefined;
    estado?: EstadoAgenda | undefined;
    notas?: string | undefined;
    mensaje?: string | undefined;
    horaInicio?: string | undefined;
    horaFin?: string | undefined;
    empresaId?: number | null | undefined;
}): Promise<Omit<{
    empresa: {
        nombre: string;
        id_empresa: number;
    } | null;
    tecnicos: ({
        tecnico: {
            nombre: string;
            email: string;
            id_tecnico: number;
        };
    } & {
        id: number;
        tecnicoId: number;
        agendaId: number;
    })[];
} & {
    id: number;
    updatedAt: Date;
    empresaId: number | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoAgenda;
    tipo: import("@prisma/client").$Enums.TipoAgenda;
    notas: string | null;
    fecha: Date;
    notificacionEnviada: boolean;
    horaFin: string | null;
    horaInicio: string | null;
    mensaje: string | null;
    recordatorioEnviado: boolean | null;
    outlookEventId: string | null;
    empresaExternaNombre: string | null;
}, "fecha"> & {
    fecha: string;
}>;
export declare function cerrarAgendasPendientesDelDia(): Promise<number>;
/**
 * Reemplaza completamente los técnicos de una visita.
 * Borra los existentes y crea los nuevos.
 */
export declare function reasignarTecnicos(agendaId: number, nuevosTecnicoIds: number[]): Promise<import("@prisma/client/runtime/library").GetBatchResult>;
/**
 * Elimina una visita y sus técnicos asociados (Cascade en el schema).
 */
export declare function eliminarAgendaVisita(id: number): Promise<{
    id: number;
    updatedAt: Date;
    empresaId: number | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoAgenda;
    tipo: import("@prisma/client").$Enums.TipoAgenda;
    notas: string | null;
    fecha: Date;
    notificacionEnviada: boolean;
    horaFin: string | null;
    horaInicio: string | null;
    mensaje: string | null;
    recordatorioEnviado: boolean | null;
    outlookEventId: string | null;
    empresaExternaNombre: string | null;
}>;
/**
 * Elimina todas las visitas de un mes completo.
 * Útil para regenerar la malla desde cero.
 */
export declare function eliminarMallaMensual(year: number, month: number): Promise<{
    eliminadas: number;
}>;
/**
 * Crea una visita individual de forma manual.
 * La fecha se normaliza a UTC (solo día, sin hora).
 * El tipo se infiere automáticamente: SABADO si cae en sábado, SEMANA en cualquier otro caso.
 */
export declare function crearAgendaVisitaManual(data: {
    fecha: string;
    empresaId: number | null;
    tecnicoId: number;
    horaInicio?: string | undefined;
    horaFin?: string | undefined;
    mensaje?: string | undefined;
    notas?: string | undefined;
}): Promise<Omit<{
    empresa: {
        nombre: string;
        id_empresa: number;
    } | null;
    tecnicos: ({
        tecnico: {
            nombre: string;
            email: string;
            id_tecnico: number;
        };
    } & {
        id: number;
        tecnicoId: number;
        agendaId: number;
    })[];
} & {
    id: number;
    updatedAt: Date;
    empresaId: number | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoAgenda;
    tipo: import("@prisma/client").$Enums.TipoAgenda;
    notas: string | null;
    fecha: Date;
    notificacionEnviada: boolean;
    horaFin: string | null;
    horaInicio: string | null;
    mensaje: string | null;
    recordatorioEnviado: boolean | null;
    outlookEventId: string | null;
    empresaExternaNombre: string | null;
}, "fecha"> & {
    fecha: string;
}>;
/**
 * Envía correos reales a los técnicos de cada agenda pendiente del día.
 * Usa Microsoft Graph via graphReaderService.sendReplyEmail().
 * Marca notificacionEnviada = true en cada agenda procesada correctamente.
 */
export declare function enviarNotificacionesPendientes(): Promise<number>;
export declare function enviarRecordatoriosPendientes(): Promise<number>;
export declare function enviarNotaAgendaPorCorreo(agendaId: number): Promise<number>;
export declare function sincronizarAgendaAutomaticaOutlook(): Promise<{
    actual: {
        year: number;
        month: number;
        resultado: {
            creadas: number;
            actualizadas: number;
            omitidas: number;
            errores: number;
        } | null;
        error: string | null;
    };
    siguiente: {
        year: number;
        month: number;
        resultado: {
            creadas: number;
            actualizadas: number;
            omitidas: number;
            errores: number;
        } | null;
        error: string | null;
    };
}>;
//# sourceMappingURL=agenda.service.d.ts.map