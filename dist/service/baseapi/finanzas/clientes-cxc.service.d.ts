import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";
import { type ResumenPuntualidad } from "./puntualidad-cliente.service.js";
/** Lo mínimo que se usa de un documento del núcleo (DocumentoCxc del controlador). */
export type DocumentoClienteBase = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    saldo: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
    diasDiferencia: number | null;
    pagadoAt: string | null;
    formaPago: string | null;
    vencimientoPactado: string | null;
};
export type ResumenEmpresaCliente = {
    facturas: number;
    abiertos: number;
    porCobrar: number;
    vencidos: number;
    vencido: number;
    porVencer: number;
    maxDiasVencido: number;
    ultimaEmision: string | null;
    ultimoPago: string | null;
};
export type EstadoModuloCliente = {
    receptorId: number | null;
    activo: boolean;
    /** recibeFacturas / recibeCobranza del receptor: envíos automáticos. */
    recibe: boolean;
    /** Contactos activos que reciben (facturas o cobranza). */
    contactos: number;
};
export type ClienteCxcFila = {
    rut: string;
    razonSocial: string | null;
    empresa: {
        id: number;
        nombre: string;
    } | null;
    diasCredito: number | null;
    facturacion: EstadoModuloCliente;
    cobranza: EstadoModuloCliente;
    porEmpresa: Record<EmpresaKey, ResumenEmpresaCliente | null>;
    porCobrar: number;
    vencido: number;
    maxDiasVencido: number;
    totalContactos: number;
    puntualidad: {
        estado: ResumenPuntualidad["estado"];
        score: number | null;
        totalEvaluados: number;
        porcentajeATiempo: number;
        promedioDiasAtraso: number;
    } | null;
};
export type ContactoClienteModulo = {
    id: number;
    recibe: boolean;
    principal: boolean;
};
export type ContactoClienteCxc = {
    email: string;
    nombre: string | null;
    facturas: ContactoClienteModulo | null;
    cobranza: ContactoClienteModulo | null;
};
export type EnvioClienteCxc = {
    tipo: "FACTURA" | "RECORDATORIO";
    empresaKey: string;
    documento: string;
    email: string;
    estado: string;
    automatico: boolean;
    tipoRecordatorio: string | null;
    enviadoAt: string | null;
    /** enviadoAt o, si no se envió, la última actualización. */
    fecha: string;
    error: string | null;
};
export type ComportamientoGrupo = ResumenPuntualidad & {
    /** Promedio de días entre la emisión y el pago. */
    promedioDiasPago: number | null;
    montoPagado: number;
};
export type ComportamientoClienteCxc = {
    desde: string;
    hasta: string;
    total: ComportamientoGrupo | null;
    porEmpresa: Record<EmpresaKey, ComportamientoGrupo | null>;
    /** Pagadas en el período que no se evalúan: cerradas como AJUSTE o sin vencimiento. */
    excluidos: number;
    documentos: Array<{
        empresaKey: EmpresaKey;
        tipoDoc: string;
        folio: string;
        fechaEmision: string | null;
        vencimiento: string;
        pagadoAt: string;
        diasAtraso: number;
        monto: number;
        formaPago: string | null;
    }>;
};
export type FichaClienteCxc<D> = ClienteCxcFila & {
    plazos: Record<EmpresaKey, string>;
    contactos: ContactoClienteCxc[];
    documentos: Array<D & {
        empresaKey: EmpresaKey;
    }>;
    comportamiento: ComportamientoClienteCxc;
    historial: EnvioClienteCxc[];
};
export type ConfigClienteInput = {
    razonSocial?: string | null;
    diasCredito?: number | null;
    recibeFacturas?: boolean;
    recibeCobranza?: boolean;
};
export type ContactoClienteInput = {
    /** Correo actual (si se está editando); vacío = contacto nuevo. */
    emailOriginal?: string | null;
    email: string;
    nombre?: string | null;
    facturas: boolean;
    cobranza: boolean;
    principalFacturas?: boolean;
    principalCobranza?: boolean;
};
/** Error de validación: el controlador lo responde como 400. */
export declare class ClienteCxcError extends Error {
}
export declare function normalizarRutCliente(value: unknown): string;
/** Todos los RUT que tienen receptor (facturación o cobranza) o facturas en el núcleo. */
export declare function listarClientesCxc(documentos: Record<EmpresaKey, DocumentoClienteBase[]>): Promise<ClienteCxcFila[]>;
export declare function obtenerFichaClienteCxc<D extends DocumentoClienteBase>(rutEntrada: string, documentos: Record<EmpresaKey, D[]>): Promise<FichaClienteCxc<D>>;
export declare function guardarConfigClienteCxc(rutEntrada: string, input: ConfigClienteInput): Promise<void>;
export declare function guardarContactoClienteCxc(rutEntrada: string, input: ContactoClienteInput): Promise<void>;
/** Borra el correo de los dos módulos (los servicios protegen el último contacto válido). */
export declare function eliminarContactoClienteCxc(rutEntrada: string, emailEntrada: string): Promise<void>;
//# sourceMappingURL=clientes-cxc.service.d.ts.map