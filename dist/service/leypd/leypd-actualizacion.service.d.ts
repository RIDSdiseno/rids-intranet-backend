export declare function crearActualizacionLeypd(tecnicoId: number, empresaId?: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    iniciadoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
} & {
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
export declare function obtenerActualizacionLeypd(id: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    iniciadoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
} & {
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
export declare function obtenerActualizacionActivaLeypd(): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    iniciadoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
} & {
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}) | null>;
export declare function marcarActualizacionEjecutando(id: number): Promise<{
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
export declare function actualizarProgresoLeypd(id: number, pasoActual: number, totalPasos: number, mensaje: string | null): Promise<{
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
export declare function marcarActualizacionCompletada(id: number, mensaje?: string | null): Promise<{
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
export declare function marcarActualizacionError(id: number, error: string): Promise<{
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
/**
 * Último trabajo, para mostrar su resultado
 * (COMPLETADO / ERROR / CANCELADO) en la pantalla.
 */
export declare function obtenerUltimaActualizacionLeypd(): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    iniciadoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
} & {
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}) | null>;
/**
 * PENDIENTE: el worker ya no la toma.
 * EJECUTANDO: el worker termina la empresa en curso, se
 * detiene y deja en el mensaje lo que alcanzó a hacer
 * (solo escribe mientras el trabajo sigue EJECUTANDO).
 *
 * updateMany con la condición de estado es atómico.
 */
export declare function cancelarActualizacionLeypd(id: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    iniciadoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
} & {
    error: string | null;
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    mensaje: string | null;
    pasoActual: number;
    totalPasos: number | null;
    progreso: number;
    iniciadoPorId: number | null;
    iniciadoAt: Date | null;
    terminadoAt: Date | null;
}>;
//# sourceMappingURL=leypd-actualizacion.service.d.ts.map