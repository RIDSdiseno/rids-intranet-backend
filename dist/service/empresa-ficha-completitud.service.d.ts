export type EstadoCompletitudSeccion = "COMPLETA" | "INCOMPLETA" | "SIN_DATOS" | "NO_APLICA";
export type FaltanteFichaEmpresa = {
    campo: string;
    label: string;
    registro?: string;
};
export type CompletitudSeccionFicha = {
    key: string;
    label: string;
    obligatoria: boolean;
    estado: EstadoCompletitudSeccion;
    porcentaje: number;
    totalCampos: number;
    camposCompletos: number;
    faltantes: FaltanteFichaEmpresa[];
};
export type CompletitudFichaEmpresa = {
    estado: "COMPLETA" | "INCOMPLETA";
    porcentaje: number;
    totalSecciones: number;
    seccionesCompletas: number;
    seccionesIncompletas: number;
    totalFaltantes: number;
    secciones: CompletitudSeccionFicha[];
};
export declare function evaluarCompletitudFichasEmpresas(empresaIds: number[]): Promise<Map<number, CompletitudFichaEmpresa>>;
//# sourceMappingURL=empresa-ficha-completitud.service.d.ts.map