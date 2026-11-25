export interface EmpresaAccesibleCliente {
    id_empresa: number;
    nombre: string;
}
export interface AlcanceCliente {
    /** Empresa del usuario (la del token / Tecnico.empresaId). */
    empresaIdPropia: number | null;
    verTodoGrupo: boolean;
    grupo: {
        id: number;
        nombre: string;
    } | null;
    /** Empresas que puede ver (la propia primero). Vacío si el usuario no es CLIENTE activo. */
    empresas: EmpresaAccesibleCliente[];
}
export declare function invalidarAlcanceClientes(): void;
export declare function obtenerAlcanceCliente(userId: number): Promise<AlcanceCliente>;
/** ¿El usuario CLIENTE puede ver la empresa indicada? */
export declare function clientePuedeVerEmpresa(userId: number, empresaId: number): Promise<boolean>;
//# sourceMappingURL=alcance-cliente.service.d.ts.map