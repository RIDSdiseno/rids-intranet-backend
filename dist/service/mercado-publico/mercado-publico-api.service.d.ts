export type MercadoPublicoLicitacionApi = {
    CodigoExterno?: string;
    Nombre?: string;
    CodigoEstado?: number;
    FechaCierre?: string;
    Descripcion?: string;
    Estado?: string;
    Tipo?: string;
    Moneda?: string;
    MontoEstimado?: number;
    Comprador?: {
        CodigoOrganismo?: string;
        NombreOrganismo?: string;
        RutUnidad?: string;
        CodigoUnidad?: string;
        NombreUnidad?: string;
        DireccionUnidad?: string;
        ComunaUnidad?: string;
        RegionUnidad?: string;
        NombreUsuario?: string;
        CargoUsuario?: string;
    };
    Fechas?: {
        FechaCreacion?: string;
        FechaCierre?: string;
        FechaPublicacion?: string;
    };
    NombreResponsableContrato?: string;
    EmailResponsableContrato?: string;
    FonoResponsableContrato?: string;
    Items?: {
        Cantidad?: number;
        Listado?: Array<{
            CodigoProducto?: number;
            CodigoCategoria?: string;
            Categoria?: string;
            NombreProducto?: string;
            Descripcion?: string;
            Cantidad?: number;
        }>;
    };
    [key: string]: unknown;
};
type MercadoPublicoRespuesta = {
    Cantidad?: number;
    FechaCreacion?: string;
    Version?: string;
    Listado?: MercadoPublicoLicitacionApi[];
};
export declare function consultarLicitacionesPorFecha(fecha: string, estado?: string): Promise<MercadoPublicoRespuesta>;
export declare function consultarLicitacionesActivas(): Promise<MercadoPublicoRespuesta>;
export declare function consultarLicitacionDetalle(codigo: string): Promise<MercadoPublicoLicitacionApi | null>;
export {};
//# sourceMappingURL=mercado-publico-api.service.d.ts.map