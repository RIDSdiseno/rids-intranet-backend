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
        id: number;
        idEquipo: number;
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
    observaciones: string | null;
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
    agenteActivo: boolean;
    agenteVersion: string | null;
    diskFreeGb: number | null;
    diskTotalGb: number | null;
    dominio: string | null;
    estadoAgente: import("@prisma/client").$Enums.EstadoAgenteEquipo;
    hostname: string | null;
    lastBootAt: Date | null;
    lastSeenAt: Date | null;
    localIp: string | null;
    macAddress: string | null;
    motivoRevisionSolicitante: string | null;
    publicIp: string | null;
    ramGb: number | null;
    requiereRevisionSolicitante: boolean;
    solicitanteDetectadoEmail: string | null;
    solicitanteDetectadoId: number | null;
    usuarioActual: string | null;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map