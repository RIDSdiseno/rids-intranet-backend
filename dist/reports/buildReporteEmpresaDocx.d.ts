export declare function buildReporteEmpresaDocx(data: {
    empresa: {
        id_empresa: number;
        nombre: string;
    };
    month: string;
    kpis: {
        visitas: {
            count: number;
            totalMs: number;
            avgMs: number;
        };
        equipos: {
            count: number;
        };
        tickets: {
            total: number;
        };
    };
    visitasPorTipo: {
        tipo: string;
        cantidad: number;
    }[];
}): Promise<Buffer>;
//# sourceMappingURL=buildReporteEmpresaDocx.d.ts.map