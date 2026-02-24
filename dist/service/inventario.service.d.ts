export declare function getInventarioByEmpresa(params: {
    empresaId?: number;
    empresaNombre?: string;
}): Promise<({
    solicitante: {
        empresa: {
            nombre: string;
        };
        nombre: string;
        email: string | null;
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
    id_equipo: number;
    idSolicitante: number | null;
    serial: string | null;
    marca: string;
    modelo: string;
    procesador: string | null;
    ram: string | null;
    disco: string | null;
    propiedad: string;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map