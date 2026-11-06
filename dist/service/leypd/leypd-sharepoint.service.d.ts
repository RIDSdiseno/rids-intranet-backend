export type DocumentoSharepointLeypd = {
    nombre: string;
    webUrl: string;
    tamano: number | null;
    modificadoAt: string | null;
    esCarpeta: boolean;
};
export type ElementoSharepointLeypd = {
    numero: number;
    carpetaEsperada: string;
    existe: boolean;
    itemId: string | null;
    webUrl: string | null;
    documentos: DocumentoSharepointLeypd[];
    /** Documentos esperados que no se encontraron. */
    faltantes: string[];
    /** Documentos condicionales que no se encontraron. */
    opcionalesFaltantes: string[];
};
export declare function obtenerSharepointLeypd(empresaId: number): Promise<{
    vinculado: boolean;
    carpeta: null;
    checklist: null;
    sincronizadoAt: null;
    ultimoError: null;
    elementos: ElementoSharepointLeypd[];
} | {
    vinculado: boolean;
    carpeta: {
        nombre: string;
        webUrl: string;
    };
    checklist: {
        nombre: string | null;
        webUrl: string;
    } | null;
    sincronizadoAt: Date | null;
    ultimoError: string | null;
    elementos: ElementoSharepointLeypd[];
}>;
/**
 * Lee la carpeta LEYPD del cliente y actualiza:
 * - checklist
  * - existencia, URL y documentos de las 13 carpetas
 * - documentos faltantes: según lo que generó el worker
 *   (LeypdDocumentoGenerado) o, si aún no hay registro,
 *   según el catálogo
 *
 * Solo lectura: no crea ni modifica nada en SharePoint.
 */
export declare function sincronizarSharepointLeypd(empresaId: number): Promise<{
    vinculado: boolean;
    carpeta: null;
    checklist: null;
    sincronizadoAt: null;
    ultimoError: null;
    elementos: ElementoSharepointLeypd[];
} | {
    vinculado: boolean;
    carpeta: {
        nombre: string;
        webUrl: string;
    };
    checklist: {
        nombre: string | null;
        webUrl: string;
    } | null;
    sincronizadoAt: Date | null;
    ultimoError: string | null;
    elementos: ElementoSharepointLeypd[];
}>;
/**
 * Vincula (o re-vincula) la carpeta LEYPD de una empresa
 * a partir de su URL y sincroniza inmediatamente.
 */
export declare function vincularSharepointLeypd(empresaId: number, url: string, actorId: number | null): Promise<{
    vinculado: boolean;
    carpeta: null;
    checklist: null;
    sincronizadoAt: null;
    ultimoError: null;
    elementos: ElementoSharepointLeypd[];
} | {
    vinculado: boolean;
    carpeta: {
        nombre: string;
        webUrl: string;
    };
    checklist: {
        nombre: string | null;
        webUrl: string;
    } | null;
    sincronizadoAt: Date | null;
    ultimoError: string | null;
    elementos: ElementoSharepointLeypd[];
}>;
/**
 * Re-sincroniza todas las empresas vinculadas, una tras otra,
 * sin bloquear la respuesta HTTP.
 *
 * Se usa al terminar una actualización documental del worker,
 * para que los faltantes del CRM reflejen los documentos nuevos.
 * Cada error queda en ultimoError de su empresa.
 */
export declare function sincronizarTodasSharepointLeypdEnSegundoPlano(): {
    iniciada: boolean;
};
//# sourceMappingURL=leypd-sharepoint.service.d.ts.map