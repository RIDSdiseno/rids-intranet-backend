/** YYYY-MM -> [start, end) en UTC */
export declare function monthRange(ym: string): {
    start: Date;
    end: Date;
};
export declare function buildReporteEmpresaData(empresaId: number, ym: string): Promise<{
    empresa: {
        nombre: string;
        id_empresa: number;
    };
    month: string;
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
}>;
//# sourceMappingURL=reportEmpresa.service.d.ts.map