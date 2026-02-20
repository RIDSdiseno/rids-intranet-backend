export declare function getInventarioByEmpresa(params: {
    empresaId?: number;
    empresaNombre?: string;
}): Promise<({
    solicitante: {
        nombre: string;
        email: string | null;
        empresa: {
            nombre: string;
        };
    } | null;
    detalle: {
        macWifi: string | null;
        so: string | null;
        office: string | null;
        teamViewer: string | null;
        revisado: string | null;
    } | null;
} & {
    id_equipo: number;
    idSolicitante: number | null;
    serial: string | null;
    marca: string;
    modelo: string;
    procesador: string | null;
    ram: string | null;
    disco: string | null;
    propiedad: string;
    tipo: import("@prisma/client").$Enums.TipoEquipo;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map