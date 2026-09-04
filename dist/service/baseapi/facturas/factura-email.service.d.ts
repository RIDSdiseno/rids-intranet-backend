import type { EmpresaBaseApiKey } from "../baseapi.empresas.js";
export type EnviarCorreoFacturaParams = {
    empresaKey: EmpresaBaseApiKey;
    emailDestino: string;
    nombreDestino?: string | null;
    razonSocial?: string | null;
    tipoDoc: string;
    folio: string;
    montoTotal: number;
    fechaEmision: string;
    adjuntoPdf?: {
        filename: string;
        content: Buffer;
    };
};
export type ResultadoEnvioCorreoFactura = {
    ok: boolean;
    messageId?: string;
    error?: string;
};
export declare function construirAsuntoFactura(params: {
    empresaKey: EmpresaBaseApiKey;
    tipoDoc: string;
    folio: string;
}): string;
export declare function enviarCorreoFactura(params: EnviarCorreoFacturaParams): Promise<ResultadoEnvioCorreoFactura>;
//# sourceMappingURL=factura-email.service.d.ts.map