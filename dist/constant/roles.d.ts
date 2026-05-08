export declare const ROLES: {
    readonly ADMIN: "ADMIN";
    readonly TECNICO: "TECNICO";
    readonly CLIENTE: "CLIENTE";
    readonly VENTAS: "VENTAS";
};
export declare const ROLE_GROUPS: {
    ADMIN_ONLY: "ADMIN"[];
    FACTURACION: ("ADMIN" | "VENTAS")[];
    COTIZACIONES: ("ADMIN" | "VENTAS")[];
    HELPDESK: ("TECNICO" | "ADMIN")[];
    VISITAS: ("TECNICO" | "ADMIN")[];
    EMPRESAS_READ: ("TECNICO" | "ADMIN" | "VENTAS")[];
};
//# sourceMappingURL=roles.d.ts.map