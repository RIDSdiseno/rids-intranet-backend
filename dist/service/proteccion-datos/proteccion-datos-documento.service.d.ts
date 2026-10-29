/**
 * Normaliza el HTML antes de calcular el hash.
 *
 * IMPORTANTE:
 * esta función NO reemplaza la sanitización HTML.
 *
 * Primero debe sanitizarse el documento.
 * Después se normaliza.
 * Finalmente se calcula el hash.
 */
export declare function normalizarDocumentoHtml(html: string): string;
export declare function hashDocumento(contenidoHtml: string): string;
//# sourceMappingURL=proteccion-datos-documento.service.d.ts.map