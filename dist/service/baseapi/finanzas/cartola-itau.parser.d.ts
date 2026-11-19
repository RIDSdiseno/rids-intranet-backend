export type PagoCartola = {
    /** Fila de Excel donde empieza el pago (1 = primera fila), para mensajes. */
    fila: number;
    /** YYYY-MM-DD */
    fecha: string;
    /** HH:MM:SS o null si la cartola no la trae. */
    hora: string | null;
    rutPagador: string | null;
    nombrePagador: string | null;
    producto: string | null;
    referencia: string | null;
    medioPago: string | null;
    estado: string | null;
    monto: number;
};
export type ResultadoLecturaCartola = {
    pagos: PagoCartola[];
    /** Problemas por fila (montos ilegibles, fechas inválidas). No detienen la lectura. */
    advertencias: string[];
    /** «Cliente: …» del encabezado de Itaú, si viene. */
    titular: string | null;
};
export declare class CartolaError extends Error {
}
export declare function leerCartolaItau(buffer: Buffer): ResultadoLecturaCartola;
//# sourceMappingURL=cartola-itau.parser.d.ts.map