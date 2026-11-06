export type EstadoLeypd = "NO_INICIADO" | "EN_PROGRESO" | "IMPLEMENTADO" | "NO_APLICA";
export interface ActualizarElementoLeypdInput {
    estado: EstadoLeypd;
    responsable?: string | null;
    fechaCompromiso?: Date | null;
    evidencia?: string | null;
    observaciones?: string | null;
    actualizadoPorId?: number | null;
}
export declare function listarEmpresasLeypd(): Promise<{
    resumen: {
        totalEmpresas: number;
        clientesCompletos: number;
        clientesSinIniciar: number;
        compromisosVencidos: number;
        sharepointVinculadas: number;
        elementosImplementados: number;
    };
    empresas: {
        ficha: {
            existe: boolean;
            respondida: boolean;
            respondidoAt: Date | null;
            updatedAt: Date | null;
        };
        sharepoint: {
            vinculado: boolean;
            carpetaWebUrl: null;
            sincronizadoAt: null;
            ultimoError: null;
            carpetasFaltantes: number;
            documentosFaltantes: number;
        } | {
            vinculado: boolean;
            carpetaWebUrl: string;
            sincronizadoAt: Date | null;
            ultimoError: string | null;
            carpetasFaltantes: number;
            documentosFaltantes: number;
        };
        total: number;
        implementados: number;
        noAplica: number;
        enProgreso: number;
        sinIniciar: number;
        completados: number;
        porcentaje: number;
        vencidos: number;
        ultimaActualizacion: Date | null;
        empresaId: number;
        empresaNombre: string;
        razonSocial: string | null;
    }[];
}>;
export declare function obtenerDetalleLeypdEmpresa(empresaId: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    };
    resumen: {
        total: number;
        implementados: number;
        noAplica: number;
        enProgreso: number;
        sinIniciar: number;
        completados: number;
        porcentaje: number;
        vencidos: number;
        ultimaActualizacion: Date | null;
    };
    elementos: {
        id: number | null;
        estado: EstadoLeypd;
        responsable: string | null;
        fechaCompromiso: Date | null;
        evidencia: string | null;
        observaciones: string | null;
        actualizadoPorId: number | null;
        createdAt: Date | null;
        updatedAt: Date | null;
        numero: number;
        codigo: string;
        titulo: string;
        carpeta: string;
        descripcion: string;
        aplicabilidad: import("./leypd-catalogo.js").AplicabilidadLeypd;
        documentos: import("./leypd-catalogo.js").LeypdDocumentoCatalogo[];
    }[];
}>;
export declare function actualizarElementoLeypd(empresaId: number, numero: number, input: ActualizarElementoLeypdInput): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: string;
    observaciones: string | null;
    numero: number;
    responsable: string | null;
    fechaCompromiso: Date | null;
    evidencia: string | null;
    actualizadoPorId: number | null;
}>;
//# sourceMappingURL=leypd.service.d.ts.map