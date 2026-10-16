export type PlantillaAttachmentPreparado = {
    name: string;
    contentType: string;
    contentBytes: string;
    size?: number;
    isInline?: boolean;
    contentId?: string;
};
export type PlantillaPreparadaEnvio = {
    bodyHtml: string;
    attachments: PlantillaAttachmentPreparado[];
};
export declare function crearPlantillaCorreo({ nombre, descripcion, uso, nombreArchivo, mimeType, buffer, creadoPorId, }: {
    nombre: string;
    descripcion?: string | null;
    uso?: "CONTENIDO" | "FIRMA";
    nombreArchivo: string;
    mimeType: string;
    buffer: Buffer;
    creadoPorId?: number | null;
}): Promise<{
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoPlantillaCorreo;
    descripcion: string | null;
    activo: boolean;
    creadoPorId: number | null;
    bytes: number | null;
    mimeType: string | null;
    storagePath: string | null;
    nombreArchivo: string | null;
    htmlProcesado: string | null;
    uso: import("@prisma/client").$Enums.UsoPlantillaCorreo;
}>;
export declare function listarPlantillasCorreo(uso?: "CONTENIDO" | "FIRMA"): Promise<{
    previewUrl: string | null;
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoPlantillaCorreo;
    descripcion: string | null;
    bytes: number | null;
    mimeType: string | null;
    storagePath: string | null;
    nombreArchivo: string | null;
    uso: import("@prisma/client").$Enums.UsoPlantillaCorreo;
}[]>;
export declare function obtenerPlantillaCorreo(id: number): Promise<{
    previewUrl: string | null;
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoPlantillaCorreo;
    descripcion: string | null;
    activo: boolean;
    creadoPorId: number | null;
    bytes: number | null;
    mimeType: string | null;
    storagePath: string | null;
    nombreArchivo: string | null;
    htmlProcesado: string | null;
    uso: import("@prisma/client").$Enums.UsoPlantillaCorreo;
}>;
export declare function prepararPlantillaParaEnvio(id: number): Promise<PlantillaPreparadaEnvio>;
export declare function prepararFirmaParaEnvio(id: number): Promise<PlantillaPreparadaEnvio>;
export declare function eliminarPlantillaCorreo(id: number): Promise<{
    ok: boolean;
}>;
export declare function actualizarPlantillaCorreo(id: number, data: {
    nombre?: string;
    descripcion?: string | null;
    uso?: "CONTENIDO" | "FIRMA";
    activo?: boolean;
}): Promise<{
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoPlantillaCorreo;
    descripcion: string | null;
    activo: boolean;
    creadoPorId: number | null;
    bytes: number | null;
    mimeType: string | null;
    storagePath: string | null;
    nombreArchivo: string | null;
    htmlProcesado: string | null;
    uso: import("@prisma/client").$Enums.UsoPlantillaCorreo;
}>;
//# sourceMappingURL=correos-masivos-template.service.d.ts.map