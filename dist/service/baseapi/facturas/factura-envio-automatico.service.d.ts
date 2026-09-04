import type { EmpresaBaseApiKey } from "../baseapi.empresas.js";
export type EmpresaFacturaKey = EmpresaBaseApiKey;
export type DestinatarioFactura = {
    contactoId: number;
    nombre: string;
    email: string;
    cargo: string | null;
    principal: boolean;
    yaRegistrado: boolean;
    estadoEnvio: string | null;
    enviadoAt: Date | null;
};
export type CandidatoFacturaEmitida = {
    empresaKey: EmpresaFacturaKey;
    tipoRcv: "ventas";
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    montoTotal: number;
    fechaEmision: string;
    diasAntiguedad: number;
    periodoOrigen: string;
    empresaClienteId: number | null;
    empresaClienteNombre: string | null;
    empresaClienteActiva: boolean;
    empresaRecibeFacturas: boolean;
    destinatarios: DestinatarioFactura[];
    tieneDestinatarios: boolean;
    yaRegistradaParaTodos: boolean;
};
export type ResultadoFacturaEmpresa = {
    empresa: EmpresaFacturaKey;
    configurada: boolean;
    activa: boolean;
    envioAutomatico: boolean;
    diasAntiguedadMax: number;
    documentosAnalizados: number;
    facturasTipoPermitido: number;
    fueraDeAntiguedad: number;
    sinIdentificacion: number;
    candidatos: number;
    candidatosConDestinatario: number;
    candidatosSinDestinatario: number;
    detalle: CandidatoFacturaEmitida[];
    error?: string;
};
export type ResultadoSimulacionFacturas = {
    modo: "SIMULACION";
    generadoAt: Date;
    empresas: ResultadoFacturaEmpresa[];
    totalDocumentos: number;
    totalCandidatos: number;
};
export type ResultadoPreparacionFacturas = {
    modo: "PREPARACION";
    generadoAt: Date;
    empresas: EmpresaFacturaKey[];
    documentosEvaluados: number;
    candidatosEnviables: number;
    registrosEsperados: number;
    nuevos: number;
    existentes: number;
    emailsEnviados: 0;
};
export declare function simularFacturasEmitidas(options?: {
    empresas?: EmpresaFacturaKey[];
}): Promise<ResultadoSimulacionFacturas>;
export declare function prepararFacturasEmitidas(options?: {
    empresas?: EmpresaFacturaKey[];
    refrescarPeriodosRecientes?: boolean;
}): Promise<ResultadoPreparacionFacturas>;
//# sourceMappingURL=factura-envio-automatico.service.d.ts.map