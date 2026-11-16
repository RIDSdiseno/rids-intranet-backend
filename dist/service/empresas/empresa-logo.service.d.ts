export declare const MAX_BYTES_LOGO: number;
export declare class LogoEmpresaInvalidoError extends Error {
    constructor(message: string);
}
export declare class EmpresaLogoNoEncontradaError extends Error {
    constructor(message?: string);
}
/** URL PNG de tamaño acotado (para mostrar y para PDF). */
export declare function urlLogoPng(publicId: string, ancho?: number, alto?: number): string;
export type LogoEmpresaInfo = {
    logoUrl: string | null;
    logoPngUrl: string | null;
    actualizadoAt: Date | null;
};
export declare function obtenerLogoEmpresa(empresaId: number): Promise<LogoEmpresaInfo>;
export declare function subirLogoEmpresa(empresaId: number, buffer: Buffer): Promise<LogoEmpresaInfo>;
export declare function eliminarLogoEmpresa(empresaId: number): Promise<LogoEmpresaInfo>;
/**
 * PNG del logo de la empresa para dibujarlo con PDFKit.
 * Devuelve null si no tiene logo o si falla la descarga: el PDF
 * se genera igual (sin logo de la empresa).
 */
export declare function logoEmpresaPngParaPdf(empresaId: number): Promise<Buffer | null>;
//# sourceMappingURL=empresa-logo.service.d.ts.map