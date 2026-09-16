import { type EmpresaKey } from "../cobranza/cobranza-estado.service.js";
type MesDashboard = {
    mes: number;
    label: string;
    facturadoBruto: number;
    facturadoNeto: number;
    documentosVentas: number;
    comprasBruto: number;
    comprasNeto: number;
    documentosCompras: number;
    pagado: number;
    documentosPagados: number;
    porVencer: number;
    documentosPorVencer: number;
    vencido: number;
    documentosVencidos: number;
    recordatorios: number;
};
type FinanzasResumen = {
    montoFacturado: number;
    totalDocumentos: number;
    montoCompras: number;
    totalDocumentosCompras: number;
    montoPorVencer: number;
    documentosPorVencer: number;
    montoVencido: number;
    documentosVencidos: number;
    montoPagado: number;
    documentosPagados: number;
    recordatoriosEnviados: number;
};
export declare function obtenerDashboardFinanzas(params: {
    empresaKey: EmpresaKey;
    ano: number;
}): Promise<{
    empresa: EmpresaKey;
    ano: number;
    resumen: FinanzasResumen;
    meses: MesDashboard[];
    ultimaActualizacion: Date | null;
    mesesConCache: (string | null)[];
    mesesConCompras: (string | null)[];
    cacheUtilizado: {
        mes: string | null;
        tipo: string;
        updatedAt: Date;
    }[];
}>;
export {};
//# sourceMappingURL=finanzas-dashboard.service.d.ts.map