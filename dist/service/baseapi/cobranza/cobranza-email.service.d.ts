import type { EmpresaKey } from "./cobranza-estado.service.js";
export type EnviarCorreoCobranzaParams = {
    empresaKey: EmpresaKey;
    emailDestino: string;
    nombreDestino?: string | null;
    razonSocial?: string | null;
    tipoDoc: string;
    folio: string;
    montoTotal: number;
    fechaVencimiento: string;
    diasDiferencia: number;
    tipoRecordatorio: string;
    adjuntoPdf?: {
        filename: string;
        content: Buffer;
    };
};
export type ResultadoEnvioCorreoCobranza = {
    ok: boolean;
    messageId?: string;
    error?: string;
};
export declare function construirAsuntoCobranza(params: {
    empresaKey: EmpresaKey;
    folio: string;
    tipoRecordatorio: string;
}): string;
export declare function enviarCorreoCobranza(params: EnviarCorreoCobranzaParams): Promise<ResultadoEnvioCorreoCobranza>;
//# sourceMappingURL=cobranza-email.service.d.ts.map