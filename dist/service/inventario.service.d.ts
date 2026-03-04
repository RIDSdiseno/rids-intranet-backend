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
    updatedAt: Date;
    createdAt: Date;
    tipo: import("@prisma/client").$Enums.TipoEquipo;
    marca: string;
    modelo: string;
    id_equipo: number;
    idSolicitante: number | null;
    serial: string | null;
    procesador: string | null;
    ram: string | null;
    disco: string | null;
    propiedad: string;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map