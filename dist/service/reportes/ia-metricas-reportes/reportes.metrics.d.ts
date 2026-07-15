export declare const asBool: (v: unknown) => v is true | 1 | "1";
export declare function contarMantenimientos(visitas: any[]): {
    item: string;
    cantidad: number;
}[];
export declare function contarExtras(visitas: any[]): {
    totales: {
        item: string;
        cantidad: number;
    }[];
    detalles: {
        detalle: string;
        cantidad: number;
    }[];
};
export declare function contarTiposVisita(visitas: any[]): {
    tipo: string;
    cantidad: number;
}[];
export declare function obtenerTopUsuariosGeneral(visitas: any[], tickets: any[]): {
    usuario: string;
    solicitudes: number;
}[];
//# sourceMappingURL=reportes.metrics.d.ts.map