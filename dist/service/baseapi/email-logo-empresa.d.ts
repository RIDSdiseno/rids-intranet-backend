import type { GraphFinanzasAttachment } from "./graph-finanzas.service.js";
export declare const CID_LOGO_EMPRESA = "logo-empresa";
/** Adjunto inline del logo (o null si no hay archivo). */
export declare function adjuntoLogoEmpresa(empresaKey: string): GraphFinanzasAttachment | null;
/** <img> del logo para la cabecera del correo (vacío si no hay archivo). */
export declare function htmlLogoEmpresa(empresaKey: string, alt: string, alto?: number): string;
//# sourceMappingURL=email-logo-empresa.d.ts.map