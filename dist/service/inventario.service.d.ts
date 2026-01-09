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
    equipo: {
        macWifi: string | null;
        so: string | null;
        office: string | null;
        teamViewer: string | null;
        revisado: string | null;
    }[];
} & {
    id_equipo: number;
    idSolicitante: number | null;
    serial: string | null;
    marca: string;
    modelo: string;
    tipo: import("@prisma/client").$Enums.TipoEquipo;
    procesador: string | null;
    ram: string | null;
    disco: string | null;
    propiedad: string;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map