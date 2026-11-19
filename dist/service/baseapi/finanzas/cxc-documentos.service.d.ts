import { type EmpresaKey } from "../cobranza/cobranza-estado.service.js";
import { type NotaCreditoAplicada } from "../cobranza/cobranza-notas-credito.service.js";
export type EstadoCxc = "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
export type TramoAntiguedad = "AL_DIA" | "1_30" | "31_60" | "61_90" | "MAS_90";
export type DocumentoCxc = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    periodo: string;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    saldo: number;
    montoAbonado: number;
    abonos: number;
    notasCredito: NotaCreditoAplicada[];
    estado: EstadoCxc;
    fechaVencimiento: string | null;
    origenVencimiento: string;
    /** Convención de cobranza: >0 días vencido, <=0 faltan días. */
    diasDiferencia: number | null;
    tramo: TramoAntiguedad | null;
    pagadoAt: string | null;
    formaPago: string | null;
    vencimientoPactado: string | null;
};
export type DiagnosticoCxc = {
    periodosLeidos: string[];
    documentosRcv: number;
    duplicadosOmitidos: number;
    documentosCobrables: number;
    notasCreditoEnRcv: number;
    facturasConNc: number;
    compensados: number;
    ndSoloReversa: number;
    conciliadasEnBd: number;
    conciliadasEmparejadas: number;
    /** Conciliadas en BD sin documento en los caches leídos (máx. 50). */
    conciliadasSinDocumento: string[];
    sinVencimiento: number;
    origenVencimiento: Record<string, number>;
    plazoEmpresa: number;
    ncInferidas: Array<{
        nc: string;
        factura: string;
        rut: string;
        monto: number;
    }>;
    ncSinAplicar: Array<{
        folio: string;
        periodo: string;
        rut: string;
        razonSocial: string | null;
        fechaEmision: string | null;
        monto: number;
    }>;
};
/** Nota de crédito o débito del RCV y cómo se aplicó. */
export type NotaCxc = {
    tipoDoc: "61" | "56";
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    periodo: string;
    fechaEmision: string | null;
    monto: number;
    /** Documento afectado (ej. "33-1245"); null si no se aplicó. */
    aplicadaA: string | null;
    metodo: "XML" | "INFERIDA" | "SIN_APLICAR" | "ND_REVERSA" | "ND_COBRABLE";
};
export type ResultadoDocumentosCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    documentos: DocumentoCxc[];
    notas: NotaCxc[];
    diagnostico: DiagnosticoCxc;
};
type Monto = {
    monto: number;
    documentos: number;
};
export type ResumenCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    tarjetas: {
        pagosMes: Monto;
        porVencer: Monto;
        vencido: Monto;
        sinVencimiento: Monto;
        /** porVencer + vencido + sinVencimiento */
        total: Monto;
    };
    antiguedad: Array<{
        tramo: TramoAntiguedad;
        etiqueta: string;
    } & Monto>;
    /** Por mes de emisión (últimos `meses`): saldo pagado, por vencer y vencido. */
    porMesEmision: Array<{
        periodo: string;
        pagado: number;
        porVencer: number;
        vencido: number;
    }>;
    /** Saldo abierto por mes de vencimiento (VENCIDO agrupado aparte). */
    proyeccion: Array<{
        periodo: string;
    } & Monto>;
    diagnostico: DiagnosticoCxc;
};
type PlazoEmpresa = {
    tipo: "DIAS";
    dias: number;
    prioritario: boolean;
} | {
    tipo: "DIA_1_MES_SIGUIENTE";
    prioritario: boolean;
};
export declare const PLAZO_EMPRESA: Record<EmpresaKey, PlazoEmpresa>;
/** Vencimiento según el plazo de la empresa (YYYY-MM-DD). */
export declare function vencimientoPorPlazo(fechaEmision: string, plazo: PlazoEmpresa): string;
type NcSinXml = {
    folio: string;
    rut: string;
    monto: number;
    fecha: string;
};
type FacturaCandidata = {
    key: string;
    tipoDoc: string;
    folio: string;
    rut: string;
    monto: number;
    fecha: string;
};
export declare function inferirNotasCreditoSinXml(ncs: NcSinXml[], facturas: FacturaCandidata[]): {
    nc: NcSinXml;
    factura: FacturaCandidata;
}[];
export declare function obtenerDocumentosCxc(params: {
    empresaKey: EmpresaKey;
    desdeAno?: number;
    consultaSii?: boolean;
    referencia?: Date;
}): Promise<ResultadoDocumentosCxc>;
export declare function obtenerResumenCxc(params: {
    empresaKey: EmpresaKey;
    desdeAno?: number;
    consultaSii?: boolean;
    meses?: number;
    referencia?: Date;
}): Promise<ResumenCxc & {
    documentos: DocumentoCxc[];
    notas: NotaCxc[];
}>;
export {};
//# sourceMappingURL=cxc-documentos.service.d.ts.map