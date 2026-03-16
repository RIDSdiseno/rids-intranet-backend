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
        mantenciones: {
            total: number;
        };
    };
    visitas: {
        detalle: {
            solicitante: string;
            sucursal: {
                nombre: string;
            } | null;
            tecnico: {
                nombre: string;
            };
            inicio: Date;
            fin: Date | null;
            actualizaciones: boolean;
            antivirus: boolean;
            ccleaner: boolean;
            estadoDisco: boolean;
            licenciaOffice: boolean;
            licenciaWindows: boolean;
            mantenimientoReloj: boolean;
            rendimientoEquipo: boolean;
            confImpresoras: boolean;
            confTelefonos: boolean;
            confPiePagina: boolean;
            otros: boolean;
            otrosDetalle: string | null;
        }[];
        porTipo: {
            tipo: string;
            cantidad: number;
        }[];
        porTecnico: {
            tecnico: string;
            cantidad: number;
        }[];
    };
    mantenimientos: {
        item: string;
        cantidad: number;
    }[];
    extras: {
        totales: {
            item: string;
            cantidad: number;
        }[];
        detalles: {
            detalle: string;
            cantidad: number;
        }[];
    };
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
        detalle: any[];
        total: number;
        topUsuarios: {
            usuario: string;
            email?: string;
            cantidad: number;
        }[];
        topUsuariosGeneral: {
            usuario: string;
            solicitudes: number;
        }[];
    };
    mantenciones: {
        total: number;
        detalle: {
            solicitante: string;
            tecnico: {
                nombre: string;
            } | null;
            inicio: Date;
            fin: Date | null;
            status: string;
            id_mantencion: number;
        }[];
        porStatus: {
            status: string;
            cantidad: number;
        }[];
        porTecnico: {
            tecnico: string;
            cantidad: number;
        }[];
        porDia: {
            fecha: string;
            cantidad: number;
        }[];
        topSolicitantes: {
            solicitante: string;
            cantidad: number;
        }[];
    };
    usuariosCRM: {
        usuario: string;
        email: string | null;
    }[];
    narrativa: {
        resumen: string;
    };
}>;
//# sourceMappingURL=reportEmpresa.service.d.ts.map