export declare function getInventarioByEmpresa(params: {
    empresaId?: number;
    empresaNombre?: string;
    createdFrom?: Date;
    createdTo?: Date;
    updatedFrom?: Date;
    updatedTo?: Date;
}): Promise<({
    empresa: {
        nombre: string;
        id_empresa: number;
    } | null;
    solicitante: {
        nombre: string;
        email: string | null;
        empresa: {
            nombre: string;
            id_empresa: number;
        };
    } | null;
    detalle: {
        macWifi: string | null;
        so: string | null;
        estadoAlm: string | null;
        office: string | null;
        teamViewer: string | null;
        claveTv: string | null;
        revisado: string | null;
        adminRidsPassword: string | null;
        adminRidsUsuario: string | null;
        passwordEmpresa: string | null;
        passwordPersonal: string | null;
        usuarioEmpresa: string | null;
        usuarioPersonal: string | null;
        redEthernet: string | null;
    } | null;
} & {
    updatedAt: Date;
    empresaId: number | null;
    deletedAt: Date | null;
    createdAt: Date;
    estado: import("@prisma/client").$Enums.EstadoEquipo;
    tipo: import("@prisma/client").$Enums.TipoEquipo;
    marca: string;
    modelo: string;
    productoId: number | null;
    id_equipo: number;
    idSolicitante: number | null;
    serial: string | null;
    procesador: string | null;
    ram: string | null;
    disco: string | null;
    propiedad: string;
    origenCotizacionId: number | null;
    anioPc: number | null;
    anioPcOrigen: string | null;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map