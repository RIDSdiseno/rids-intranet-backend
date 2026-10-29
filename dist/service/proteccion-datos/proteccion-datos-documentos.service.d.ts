type ArchivoDocumentoProteccionDatos = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};
export declare function subirDocumentoProteccionDatos(file: ArchivoDocumentoProteccionDatos): Promise<{
    titulo: string;
    nombre: string;
    path: string;
    contentType: string;
    size: number;
    sha256: string;
}>;
export declare function crearUrlFirmadaDocumentoProteccionDatos(path: string, expiresInSeconds?: number): Promise<string>;
export {};
//# sourceMappingURL=proteccion-datos-documentos.service.d.ts.map