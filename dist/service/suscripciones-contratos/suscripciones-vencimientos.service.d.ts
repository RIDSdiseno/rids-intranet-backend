export type VencimientoSuscripcion = {
    suscripcionId: number;
    productoPlan: string;
    fabricante: string;
    tipoFecha: "RENOVACION" | "TERMINO";
    /** YYYY-MM-DD */
    fecha: string;
    /** Días que faltan; negativo = vencida hace N días. */
    dias: number;
    avisosActivos: boolean;
};
export type ResumenVencimientosEmpresa = {
    vencidas: number;
    porVencer: number;
    /** Por vencer más próxima (dias >= 0), o null. */
    proxima: VencimientoSuscripcion | null;
    /** Vencidas (más atrasada primero) y luego por vencer (más próxima primero). */
    items: VencimientoSuscripcion[];
};
export declare function resumenVencimientosEmpresas(empresaIds: number[]): Promise<Map<number, ResumenVencimientosEmpresa>>;
export type VencimientoSuscripcionCampana = {
    suscripcionId: number;
    empresaId: number;
    empresaNombre: string;
    productoPlan: string;
    fabricante: string;
    avisosActivos: boolean;
    /** Fecha más urgente: negativo = vencida hace N días. */
    dias: number;
    /** Renovación y/o término dentro de la ventana, más urgente primero. */
    fechas: {
        tipoFecha: "RENOVACION" | "TERMINO";
        /** YYYY-MM-DD */
        fecha: string;
        dias: number;
    }[];
};
export declare function vencimientosSuscripcionesCampana(): Promise<VencimientoSuscripcionCampana[]>;
//# sourceMappingURL=suscripciones-vencimientos.service.d.ts.map