export type AplicabilidadLeypd = "GENERAL" | "CONDICIONAL";
export type TipoDocumentoLeypd = "DOCX" | "PDF" | "XLSX" | "JS" | "CARPETA";
export interface LeypdDocumentoCatalogo {
    orden: number;
    nombreBase: string;
    tipo: TipoDocumentoLeypd;
    condicional?: boolean;
    subcarpeta?: string;
}
export interface LeypdCatalogoItem {
    numero: number;
    codigo: string;
    titulo: string;
    carpeta: string;
    descripcion: string;
    aplicabilidad: AplicabilidadLeypd;
    documentos: LeypdDocumentoCatalogo[];
}
export declare const LEYPD_ELEMENTOS: LeypdCatalogoItem[];
export declare const TOTAL_ELEMENTOS_LEYPD: number;
export declare function obtenerElementoCatalogo(numero: number): LeypdCatalogoItem | undefined;
export declare function obtenerElementoCatalogoPorCodigo(codigo: string): LeypdCatalogoItem | undefined;
export declare function obtenerCarpetaElementoLeypd(numero: number): string | null;
export declare function formatearNumeroLeypd(numero: number): string;
export declare function generarNombreFichaElemento(numero: number, cliente: string): string;
export declare function generarNombreInformeElemento(numero: number, cliente: string): string;
export declare function generarNombreChecklistLeypd(cliente: string): string;
export declare function generarNombreDocumentoLeypd(documento: LeypdDocumentoCatalogo, cliente: string): string;
//# sourceMappingURL=leypd-catalogo.d.ts.map