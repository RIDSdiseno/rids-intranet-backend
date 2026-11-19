import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";
export type TipoEnvioCxc = "factura" | "recordatorio";
export type ModoEnvioCxc = {
    /** PRUEBA: todo llega a la casilla de pruebas · REAL: llega al cliente · BLOQUEADO: no hay configuración. */
    modo: "PRUEBA" | "REAL" | "BLOQUEADO";
    /** Casilla de pruebas enmascarada (solo en modo PRUEBA). */
    destinoPrueba: string | null;
    variables: string;
};
/** Datos del documento que vienen del cálculo de cuentas por cobrar (nunca del cliente HTTP). */
export type DocumentoEnvioCxc = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    periodo: string;
    fechaEmision: string | null;
    montoOriginal: number;
    saldo: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
    fechaVencimiento: string | null;
    diasDiferencia: number | null;
};
export type ContactoEnvioCxc = {
    email: string;
    nombre: string | null;
    principal: boolean;
    /** recibeFacturas / recibeCobranza del contacto: se marca por defecto. */
    habilitado: boolean;
};
export type HistorialEnvioCxc = {
    email: string;
    estado: string;
    automatico: boolean;
    tipoRecordatorio: string | null;
    enviadoAt: string | null;
    actualizadoAt: string;
    error: string | null;
};
export type OpcionesEnvioCxc = {
    tipo: TipoEnvioCxc;
    modo: ModoEnvioCxc;
    receptor: {
        configurado: boolean;
        activo: boolean;
        /** recibeFacturas / recibeCobranza del receptor (envío automático). */
        recibeAutomatico: boolean;
    };
    contactos: ContactoEnvioCxc[];
    historial: HistorialEnvioCxc[];
};
export type ResultadoEnvioCxc = {
    tipo: TipoEnvioCxc;
    modo: ModoEnvioCxc["modo"];
    enviados: number;
    errores: number;
    resultados: Array<{
        email: string;
        ok: boolean;
        registrado: boolean;
        error: string | null;
    }>;
};
/** Error de validación: el controlador lo responde como 400. */
export declare class EnvioCxcError extends Error {
}
/** Replica la prioridad de las plantillas: casilla de prueba > envío real habilitado > bloqueado. */
export declare function modoEnvioCxc(tipo: TipoEnvioCxc): ModoEnvioCxc;
export declare function obtenerOpcionesEnvioCxc(params: {
    tipo: TipoEnvioCxc;
    empresaKey: EmpresaKey;
    documento: DocumentoEnvioCxc;
}): Promise<OpcionesEnvioCxc>;
export declare function enviarDocumentoCxc(params: {
    tipo: TipoEnvioCxc;
    empresaKey: EmpresaKey;
    documento: DocumentoEnvioCxc;
    emails: string[];
    usuario: string;
}): Promise<ResultadoEnvioCxc>;
//# sourceMappingURL=cxc-envios.service.d.ts.map