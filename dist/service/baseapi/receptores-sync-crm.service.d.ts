export type ModuloReceptores = "FACTURACION" | "COBRANZA";
export type AccionReceptorSync = "CREAR" | "VINCULAR" | "SOLO_CONTACTOS";
export type DetalleSyncReceptor = {
    empresaId: number;
    empresa: string;
    rut: string;
    accion: AccionReceptorSync;
    contactosNuevos: string[];
};
export type ResultadoSyncReceptores = {
    modulo: ModuloReceptores;
    aplicado: boolean;
    empresasEvaluadas: number;
    empresasSinRut: number;
    empresasSinRutDetalle: Array<{
        empresaId: number;
        empresa: string;
    }>;
    sinCambios: number;
    receptoresCreados: number;
    receptoresVinculados: number;
    contactosCreados: number;
    contactosSinEmailValido: number;
    rutDuplicados: Array<{
        rut: string;
        empresas: string[];
    }>;
    errores: Array<{
        empresa: string;
        rut: string;
        error: string;
    }>;
    detalle: DetalleSyncReceptor[];
};
export declare function sincronizarReceptoresDesdeCrm(modulo: ModuloReceptores, aplicar: boolean): Promise<ResultadoSyncReceptores>;
//# sourceMappingURL=receptores-sync-crm.service.d.ts.map