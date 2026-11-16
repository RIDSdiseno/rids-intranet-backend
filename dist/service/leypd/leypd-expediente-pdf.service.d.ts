export type ExpedienteLeypdPdf = {
    buffer: Buffer;
    nombreArchivo: string;
    incluidos: number;
    omitidos: number;
};
export declare function generarExpedienteLeypdPdf(empresaId: number, generadoPor?: string | null): Promise<ExpedienteLeypdPdf>;
//# sourceMappingURL=leypd-expediente-pdf.service.d.ts.map