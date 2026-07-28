export declare function monthRange(ym: string): {
    start: Date;
    end: Date;
};
export declare function buildReporteEmpresaData(empresaId: number, ym: string): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
    };
    month: string;
    kpis: {
        visitas: {
            count: number;
            totalMinutos: number;
            avgMinutos: number;
            totalTiempoTexto: string;
            avgTiempoTexto: string;
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
        licencias: {
            total: number;
            totalUsuariosConLicencia: number;
        };
    };
    visitas: {
        total: number;
        totalMinutos: number;
        avgMinutos: number;
        totalTiempoTexto: string;
        avgTiempoTexto: string;
        detalle: {
            duracionMinutos: number;
            duracionTexto: string;
            solicitante: string;
            inicio: Date;
            fin: Date | null;
            confImpresoras: boolean;
            confTelefonos: boolean;
            confPiePagina: boolean;
            otros: boolean;
            otrosDetalle: string | null;
            actualizaciones: boolean;
            antivirus: boolean;
            ccleaner: boolean;
            estadoDisco: boolean;
            licenciaOffice: boolean;
            licenciaWindows: boolean;
            mantenimientoReloj: boolean;
            rendimientoEquipo: boolean;
            sucursal: {
                nombre: string;
            } | null;
            tecnico: {
                nombre: string;
            };
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
        total: number;
        porMarca: {
            marca: string;
            cantidad: number;
        }[];
        detalle: {
            codigo: number;
            usuario: string;
            correo: string;
            estadoEquipo: import("@prisma/client").$Enums.EstadoEquipo;
            serial: string;
            marca: string;
            modelo: string;
            cpu: string;
            ram: string;
            disco: string;
            sistemaOperativo: string;
        }[];
        equipos: {
            codigo: number;
            usuario: string;
            correo: string;
            estadoEquipo: import("@prisma/client").$Enums.EstadoEquipo;
            serial: string;
            marca: string;
            modelo: string;
            cpu: string;
            ram: string;
            disco: string;
            sistemaOperativo: string;
        }[];
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
    licencias: {
        total: number;
        totalUsuariosConLicencia: number;
        porTipo: {
            skuId: string;
            skuPartNumber: string;
            displayName: string;
            cantidad: number;
        }[];
        usuarios: {
            solicitanteId: number;
            nombre: string | null;
            email: string | null;
            skuId: string;
            skuPartNumber: string;
            displayName: string;
            assignedAt: Date | null;
        }[];
    };
    mantenciones: {
        total: number;
        detalle: {
            solicitante: string;
            inicio: Date;
            fin: Date | null;
            status: string;
            tecnico: {
                nombre: string;
            } | null;
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