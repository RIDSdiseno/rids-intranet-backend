export type EstadoCampoFichaPdf = "COMPLETO" | "DESDE_CRM" | "SUGERIDO" | "EN_PROCESO" | "FALTA";
export type FichaLeypdPdf = {
    buffer: Buffer;
    nombreArchivo: string;
};
export declare function generarFichaLeypdPdf(empresaId: number, generadoPor?: string | null): Promise<FichaLeypdPdf>;
//# sourceMappingURL=leypd-ficha-pdf.service.d.ts.map