export declare function normalizarRutRelacion(value: string | null | undefined): string;
export declare function obtenerRelacionEmpresaEntidades(empresaId: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        isActive: boolean;
        detalleEmpresa: {
            email: string | null;
            telefono: string | null;
            rut: string;
            direccion: string | null;
        } | null;
        entidadGestioos: {
            nombre: string;
            telefono: string | null;
            empresaId: number | null;
            rut: string | null;
            origen: import("@prisma/client").$Enums.OrigenGestioo;
            id: number;
            direccion: string | null;
            tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
            correo: string | null;
        }[];
    };
    entidadesRelacionadas: {
        nombre: string;
        telefono: string | null;
        empresaId: number | null;
        rut: string | null;
        origen: import("@prisma/client").$Enums.OrigenGestioo;
        id: number;
        direccion: string | null;
        tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
        correo: string | null;
    }[];
    sugerencias: {
        coincidencia: string;
        vinculacionAutomaticaDisponible: boolean;
        nombre: string;
        telefono: string | null;
        empresaId: number | null;
        rut: string | null;
        origen: import("@prisma/client").$Enums.OrigenGestioo;
        id: number;
        direccion: string | null;
        tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
        correo: string | null;
    }[];
}>;
export declare function buscarEntidadesDisponibles(empresaId: number, search: string): Promise<{
    nombre: string;
    telefono: string | null;
    empresaId: number | null;
    rut: string | null;
    origen: import("@prisma/client").$Enums.OrigenGestioo;
    id: number;
    direccion: string | null;
    correo: string | null;
}[]>;
export declare function vincularEntidadEmpresaManual(empresaId: number, entidadId: number): Promise<{
    nombre: string;
    telefono: string | null;
    empresaId: number | null;
    rut: string | null;
    origen: import("@prisma/client").$Enums.OrigenGestioo;
    id: number;
    direccion: string | null;
    tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
    correo: string | null;
} | null>;
export declare function desvincularEntidadEmpresa(empresaId: number, entidadId: number): Promise<{
    nombre: string;
    telefono: string | null;
    empresaId: number | null;
    rut: string | null;
    origen: import("@prisma/client").$Enums.OrigenGestioo;
    id: number;
    direccion: string | null;
    tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
    correo: string | null;
}>;
export declare function intentarVincularEmpresaAutomaticamente(empresaId: number): Promise<{
    vinculada: boolean;
    motivo: string;
    yaExistia?: never;
    entidad?: never;
    coincidencias?: never;
} | {
    vinculada: boolean;
    yaExistia: boolean;
    motivo: string;
    entidad: {
        nombre: string;
        rut: string | null;
        id: number;
    };
    coincidencias?: never;
} | {
    vinculada: boolean;
    motivo: string;
    coincidencias: {
        nombre: string;
        rut: string | null;
        id: number;
    }[];
    yaExistia?: never;
    entidad?: never;
}>;
export declare function intentarVincularEntidadAutomaticamente(entidadId: number): Promise<{
    vinculada: boolean;
    motivo: string;
    yaExistia?: never;
    entidad?: never;
    empresa?: never;
} | {
    vinculada: boolean;
    yaExistia: boolean;
    motivo: string;
    entidad: {
        nombre: string;
        empresaId: number | null;
        rut: string | null;
        id: number;
        tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
    };
    empresa?: never;
} | {
    vinculada: boolean;
    yaExistia: boolean;
    motivo: string;
    entidad: {
        nombre: string;
        telefono: string | null;
        empresaId: number | null;
        rut: string | null;
        origen: import("@prisma/client").$Enums.OrigenGestioo;
        id: number;
        direccion: string | null;
        tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
        correo: string | null;
    };
    empresa: {
        id_empresa: number;
        nombre: string;
        isActive: boolean;
    };
}>;
//# sourceMappingURL=empresa-entidad.service.d.ts.map