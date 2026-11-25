import type { EmpresaKey } from "./cobranza-estado.service.js";
export declare const TIPO_PAGO_RECIBIDO = "PAGO_RECIBIDO";
export type PagoRecibidoInput = {
    empresaKey: EmpresaKey;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    /** Monto de la factura (monto − NC). */
    montoFactura: number;
    /** Monto de este pago (el que completa el saldo). */
    montoPago: number;
    /** YYYY-MM-DD */
    fechaPago: string;
    formaPago: string | null;
};
export type ResultadoAvisoPago = {
    enviados: string[];
    errores: Array<{
        email: string;
        error: string;
    }>;
    /** Motivo por el que no se envió a nadie (sin contactos, ajuste, etc.). */
    omitido: string | null;
};
export declare function construirAsuntoPagoRecibido(empresaKey: EmpresaKey, folio: string): string;
/**
 * Envía «Pago recibido» a los contactos de Cobranza del cliente.
 * No lanza errores: devuelve qué se envió y qué falló (el pago ya quedó registrado).
 */
export declare function notificarPagoRecibido(params: PagoRecibidoInput): Promise<ResultadoAvisoPago>;
/** Texto corto para la pantalla. */
export declare function resumenAvisoPago(aviso: ResultadoAvisoPago | null): string;
//# sourceMappingURL=pago-recibido.service.d.ts.map