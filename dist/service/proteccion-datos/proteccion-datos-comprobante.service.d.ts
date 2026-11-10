export declare function folioComprobante(consentimientoId: number): string;
/**
 * HMAC-SHA256 sobre los datos de la firma.
 * Primeros 16 hex en mayúsculas, en grupos de 4.
 *
 * Si cambia el secreto, los códigos ya emitidos dejan de validar.
 */
export declare function codigoVerificacion({ consentimientoId, email, fechaRespuesta, documentoHash, }: {
    consentimientoId: number;
    email: string;
    fechaRespuesta: Date;
    documentoHash: string;
}): string;
type Fila = {
    etiqueta: string;
    valor: string;
    mono?: boolean;
};
export type DatosComprobantePdf = {
    empresa: string;
    tituloFormulario: string;
    firmante: Fila[];
    registro: Fila[];
    declaraciones: string[];
    autorizaciones: Fila[];
    notaAutorizaciones: string;
    conservacion: string;
    derechos: string;
    pie: string;
};
export declare function generarPdfComprobante(datos: DatosComprobantePdf): Promise<Buffer>;
export declare function enviarComprobanteFirma(consentimientoId: number): Promise<void>;
export {};
//# sourceMappingURL=proteccion-datos-comprobante.service.d.ts.map