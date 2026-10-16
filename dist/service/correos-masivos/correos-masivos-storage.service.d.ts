export declare function subirArchivoPlantilla({ plantillaId, nombre, buffer, contentType, }: {
    plantillaId: number;
    nombre: string;
    buffer: Buffer;
    contentType: string;
}): Promise<string>;
export declare function descargarArchivoPlantilla(storagePath: string): Promise<Buffer>;
export declare function crearUrlPreviewPlantilla(storagePath: string, expiresIn?: number): Promise<string>;
export declare function eliminarArchivoPlantilla(storagePath: string): Promise<void>;
//# sourceMappingURL=correos-masivos-storage.service.d.ts.map