import type { DocumentoLeypdCampoConsentimiento } from "./proteccion-datos.types.js";
export declare function documentosLeypdHabilitados(empresaId: number | null): boolean;
export type DocumentoLeypdResuelto = {
    titulo: string;
    /** Nombre del PDF que verá el destinatario. */
    nombre: string;
    ruta: string;
    driveId: string;
    itemId: string;
    cTag: string | null;
    modificadoAt: string | null;
};
/**
 * Resuelve las referencias de un campo para una empresa.
 * Las que aún no existen en SharePoint se omiten.
 */
export declare function resolverDocumentosLeypd(empresaId: number, referencias: DocumentoLeypdCampoConsentimiento[]): Promise<(DocumentoLeypdResuelto | null)[]>;
/**
 * Agrega a campo.documentos los documentos Ley PD de la empresa
 * del destinatario, con un enlace al backend. Quita
 * documentosLeypd de la salida pública.
 */
export declare function agregarDocumentosLeypdPublicos<C extends {
    key: string;
    documentos?: unknown[];
    documentosLeypd?: DocumentoLeypdCampoConsentimiento[];
}>(campos: C[], contexto: {
    token: string;
    empresaId: number | null;
}): Promise<Awaited<Omit<C, "documentosLeypd">>[]>;
export declare class DocumentoLeypdNoDisponibleError extends Error {
}
/**
 * Devuelve el documento como PDF. Graph convierte .docx/.xlsx
 * con ?format=pdf y responde 302 a una URL pre-autenticada,
 * que se descarga sin el token.
 */
export declare function descargarPdfLeypd(documento: DocumentoLeypdResuelto): Promise<Buffer>;
//# sourceMappingURL=proteccion-datos-leypd-documentos.service.d.ts.map