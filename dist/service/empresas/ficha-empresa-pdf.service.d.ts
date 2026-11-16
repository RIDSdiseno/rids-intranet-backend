export type OpcionesFichaPdf = {
    /** Contraseñas y claves en claro. Solo para roles internos. */
    incluirSecretos: boolean;
    /** Relación comercial (entidades Gestioo). Solo para roles internos. */
    incluirRelacionComercial: boolean;
    /** Nombre de quien descarga, para el pie de página. */
    generadoPor?: string | null;
};
export type FichaEmpresaPdf = {
    buffer: Buffer;
    nombreArchivo: string;
};
export declare function generarFichaEmpresaPdf(empresaId: number, opciones: OpcionesFichaPdf): Promise<FichaEmpresaPdf | null>;
//# sourceMappingURL=ficha-empresa-pdf.service.d.ts.map