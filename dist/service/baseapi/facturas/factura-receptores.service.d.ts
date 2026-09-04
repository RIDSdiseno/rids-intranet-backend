type ListarReceptoresParams = {
    search?: string;
    origen?: string;
    activo?: boolean;
    recibeFacturas?: boolean;
    sinContactos?: boolean;
    empresaId?: number;
};
export declare function listarReceptoresFacturacion(params?: ListarReceptoresParams): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    contactos: {
        nombre: string | null;
        recibeFacturas: boolean;
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
    recibeFacturas: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
})[]>;
export declare function obtenerReceptorFacturacion(id: number): Promise<({
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    contactos: {
        nombre: string | null;
        recibeFacturas: boolean;
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
    recibeFacturas: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
}) | null>;
export declare function crearReceptorFacturacion(data: {
    rut: string;
    razonSocial?: string | null;
    activo?: boolean;
}): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
    } | null;
    contactos: {
        nombre: string | null;
        recibeFacturas: boolean;
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
    recibeFacturas: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
}>;
export declare function actualizarReceptorFacturacion(id: number, data: {
    razonSocial?: string | null;
    activo?: boolean;
    recibeFacturas?: boolean;
}): Promise<{
    razonSocial: string | null;
    recibeFacturas: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
}>;
export declare function crearContactoReceptor(receptorId: number, data: {
    nombre?: string | null;
    email: string;
    principal?: boolean;
    activo?: boolean;
    recibeFacturas?: boolean;
}): Promise<{
    nombre: string | null;
    recibeFacturas: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function actualizarContactoReceptor(receptorId: number, contactoId: number, data: {
    nombre?: string | null;
    email?: string;
    principal?: boolean;
    activo?: boolean;
    recibeFacturas?: boolean;
}): Promise<{
    nombre: string | null;
    recibeFacturas: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function eliminarContactoReceptor(receptorId: number, contactoId: number): Promise<{
    nombre: string | null;
    recibeFacturas: boolean;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    principal: boolean;
    activo: boolean;
    receptorId: number;
}>;
export declare function eliminarReceptorFacturacion(id: number): Promise<{
    razonSocial: string | null;
    recibeFacturas: boolean;
    empresaId: number | null;
    rut: string;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    activo: boolean;
}>;
export {};
//# sourceMappingURL=factura-receptores.service.d.ts.map