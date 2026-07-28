export declare function getInventarioByEmpresa(params: {
    empresaId?: number;
    empresaNombre?: string;
    createdFrom?: Date;
    createdTo?: Date;
    updatedFrom?: Date;
    updatedTo?: Date;
}): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    solicitante: {
        empresa: {
            id_empresa: number;
            nombre: string;
        };
        nombre: string;
        email: string | null;
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
    empresaId: number | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
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
    origenCotizacionId: number | null;
    productoId: number | null;
    estado: import("@prisma/client").$Enums.EstadoEquipo;
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
    observaciones: string | null;
    mantGeneralConfigPath: string | null;
    mantGeneralExePath: string | null;
    mantGeneralInstalado: boolean;
    mantGeneralInstalledAt: Date | null;
    mantGeneralLastSeenAt: Date | null;
    mantGeneralTecnicoId: number | null;
    mantGeneralVersion: string | null;
    propietarioExterno: string | null;
})[]>;
//# sourceMappingURL=inventario.service.d.ts.map