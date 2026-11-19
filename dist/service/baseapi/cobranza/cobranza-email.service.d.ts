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
export type FacturaCorreoCobranza = {
    tipoDoc: string;
    folio: string;
    /** YYYY-MM-DD */
    fechaVencimiento: string;
    diasDiferencia: number;
    saldo: number;
};
export type EnviarCorreoCobranzaConsolidadoParams = {
    empresaKey: EmpresaKey;
    emailDestino: string;
    nombreDestino?: string | null;
    razonSocial?: string | null;
    facturas: FacturaCorreoCobranza[];
    /** Todo lo abierto del cliente con esta empresa (incluye lo que no toca hoy). */
    totalCliente: {
        saldo: number;
        documentos: number;
    };
    adjuntos: {
        filename: string;
        content: Buffer;
    }[];
    /** Documentos cuyo PDF no se adjuntó (tope de tamaño o error al generarlo). */
    documentosSinAdjunto: string[];
};
export declare function nombreDocumentoCobranza(tipoDoc: string, folio: string): string;
export declare function construirAsuntoCobranzaConsolidado(params: {
    empresaKey: EmpresaKey;
    facturas: FacturaCorreoCobranza[];
}): string;
export declare function enviarCorreoCobranzaConsolidado(params: EnviarCorreoCobranzaConsolidadoParams): Promise<ResultadoEnvioCorreoCobranza>;
export declare function enviarCorreoCobranza(params: EnviarCorreoCobranzaParams): Promise<ResultadoEnvioCorreoCobranza>;
//# sourceMappingURL=cobranza-email.service.d.ts.map