export declare const MAX_BYTES_DOCUMENTO: number;
export declare const TIPOS_DOCUMENTO_OPORTUNIDAD: readonly ["PROPUESTA", "BASES", "ORDEN_COMPRA", "CONTRATO", "OTRO"];
export type TipoDocumentoOportunidad = (typeof TIPOS_DOCUMENTO_OPORTUNIDAD)[number];
export declare class DocumentoOportunidadError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status?: number);
}
export declare function listarDocumentosOportunidad(oportunidadId: number): Promise<{
    nombre: string;
    createdAt: Date;
    id: number;
    tipo: string;
    descripcion: string | null;
    bytes: number;
    mimeType: string;
    subidoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
    oportunidadId: number;
}[]>;
export declare function subirDocumentoOportunidad(oportunidadId: number, actorId: number | null, archivo: Express.Multer.File, datos: {
    tipo: TipoDocumentoOportunidad;
    descripcion: string | null;
}): Promise<{
    nombre: string;
    createdAt: Date;
    id: number;
    tipo: string;
    descripcion: string | null;
    bytes: number;
    mimeType: string;
    subidoPor: {
        nombre: string;
        id_tecnico: number;
    } | null;
    oportunidadId: number;
}>;
export declare function obtenerUrlDocumentoOportunidad(oportunidadId: number, documentoId: number, descargar: boolean): Promise<{
    id: number;
    nombre: string;
    url: string;
    expiresIn: number;
}>;
export declare function eliminarDocumentoOportunidad(oportunidadId: number, documentoId: number): Promise<{
    id: number;
}>;
//# sourceMappingURL=oportunidades-documentos.service.d.ts.map