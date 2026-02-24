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
            usuariosActivos: number;
        };
        mantenciones: {
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
            serial: string | null;
            marca: string;
            modelo: string;
            procesador: string | null;
            ram: string | null;
            disco: string | null;
            propiedad: string;
        }[];
        total: number;
    };
    tickets: {
        detalle: any[];
        total: number;
        topUsuarios: {
            usuario: string;
            email: string | undefined;
            cantidad: number;
        }[];
        usuariosListado: {
            usuario: string;
            email: string | undefined;
            cantidad: number;
        }[];
    };
    usuariosCRM: {
        usuario: string;
        email: string | undefined;
    }[];
    mantenciones: {
        detalle: {
            solicitante: string;
            tecnico: {
                nombre: string;
            };
            inicio: Date;
            fin: Date | null;
            status: string;
            id_mantencion: number;
        }[];
        total: number;
        porStatus: {
            status: string;
            cantidad: number;
        }[];
    };
    narrativa: {
        resumen: string;
    };
}>;
//# sourceMappingURL=reportEmpresa.service.d.ts.map