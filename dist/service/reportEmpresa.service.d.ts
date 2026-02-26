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
    visitasDetalle: {
        sucursal: {
            nombre: string;
        } | null;
        solicitante: string;
        tecnico: {
            nombre: string;
        };
        inicio: Date;
        fin: Date | null;
        otrosDetalle: string | null;
    }[];
    visitasPorTecnico: {
        tecnico: string;
        cantidad: number;
    }[];
    inventario: {
        equipos: {
            solicitante: {
                nombre: string;
            } | null;
            marca: string;
            modelo: string;
            serial: string | null;
            procesador: string | null;
            ram: string | null;
            disco: string | null;
            propiedad: string;
        }[];
        total: number;
    };
    tickets: {
        detalle: {
            createdAt: Date;
            type: string | null;
            status: number;
        }[];
        total: number;
    };
    narrativa: {
        resumen: string;
    };
}>;
//# sourceMappingURL=reportEmpresa.service.d.ts.map