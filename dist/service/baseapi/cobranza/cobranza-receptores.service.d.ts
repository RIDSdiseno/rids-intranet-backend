export type ListarReceptoresCobranzaParams = {
    search?: string;
    origen?: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    sinContactos?: boolean;
    empresaId?: number;
};
type CrearReceptorCobranzaInput = {
    rut: string;
    razonSocial?: string | null;
    activo?: boolean;
    recibeCobranza?: boolean;
    diasCredito?: number | null;
    empresaId?: number | null;
    origen?: string;
};
type ActualizarReceptorCobranzaInput = {
    razonSocial?: string | null;
    activo?: boolean;
    recibeCobranza?: boolean;
    diasCredito?: number | null;
    empresaId?: number | null;
    origen?: string;
};
type CrearContactoCobranzaInput = {
    nombre?: string | null;
    email: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    principal?: boolean;
    origen?: string;
};
type ActualizarContactoCobranzaInput = {
    nombre?: string | null;
    email?: string;
    activo?: boolean;
    recibeCobranza?: boolean;
    principal?: boolean;
    origen?: string;
};
export declare function normalizarRutCobranza(value: string): string;
export declare function listarReceptoresCobranza(params?: ListarReceptoresCobranzaParams): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    } | null;
    contactos: {
        nombre: string | null;
        recibeCobranza: boolean;
        email: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        principal: boolean;
        activo: boolean;
        receptorId: number;
    }[];
} & {
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
})[]>;
export declare function obtenerReceptorCobranza(id: number): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    } | null;
    contactos: {
        nombre: string | null;
        recibeCobranza: boolean;
        email: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        principal: boolean;
        activo: boolean;
        receptorId: number;
    }[];
} & {
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
}) | null>;
export declare function obtenerReceptorCobranzaPorRut(rut: string): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    } | null;
    contactos: {
        nombre: string | null;
        recibeCobranza: boolean;
        email: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        principal: boolean;
        activo: boolean;
        receptorId: number;
    }[];
} & {
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
}) | null>;
export declare function crearReceptorCobranza(input: CrearReceptorCobranzaInput): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    } | null;
    contactos: {
        nombre: string | null;
        recibeCobranza: boolean;
        email: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        principal: boolean;
        activo: boolean;
        receptorId: number;
    }[];
} & {
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
}>;
export declare function actualizarReceptorCobranza(id: number, input: ActualizarReceptorCobranzaInput): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
        isActive: boolean;
    } | null;
    contactos: {
        nombre: string | null;
        recibeCobranza: boolean;
        email: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        principal: boolean;
        activo: boolean;
        receptorId: number;
    }[];
} & {
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
}>;
export declare function crearContactoCobranza(receptorId: number, input: CrearContactoCobranzaInput): Promise<{
    nombre: string | null;
    recibeCobranza: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function actualizarContactoCobranza(receptorId: number, contactoId: number, input: ActualizarContactoCobranzaInput): Promise<{
    nombre: string | null;
    recibeCobranza: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function eliminarContactoCobranza(receptorId: number, contactoId: number): Promise<{
    nombre: string | null;
    recibeCobranza: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function eliminarReceptorCobranza(id: number): Promise<{
    razonSocial: string | null;
    recibeCobranza: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
    diasCredito: number | null;
}>;
export declare function copiarContactosFacturacionACobranza(receptorCobranzaId: number): Promise<{
    creados: number;
    actualizados: number;
    total: number;
    receptor: ({
        empresa: {
            id_empresa: number;
            nombre: string;
            razonSocial: string | null;
            isActive: boolean;
        } | null;
        contactos: {
            nombre: string | null;
            recibeCobranza: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            origen: string;
            id: number;
            principal: boolean;
            activo: boolean;
            receptorId: number;
        }[];
    } & {
        razonSocial: string | null;
        recibeCobranza: boolean;
        empresaId: number | null;
        rut: string;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
        id: number;
        activo: boolean;
        diasCredito: number | null;
    }) | null;
}>;
export {};
//# sourceMappingURL=cobranza-receptores.service.d.ts.map