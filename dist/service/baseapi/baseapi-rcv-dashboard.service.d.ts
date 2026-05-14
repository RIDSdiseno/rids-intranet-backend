import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";
export type TipoRcvDashboard = "ventas" | "compras";
type GetDashboardParams = {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    tipo: TipoRcvDashboard;
};
export declare function getBaseApiRcvDashboard(params: GetDashboardParams): Promise<{
    exists: boolean;
    empresa: EmpresaBaseApiKey;
    mes: string;
    ano: string;
    tipo: TipoRcvDashboard;
    cacheTipo: string;
    cacheUpdatedAt: null;
    kpis: {
        totalDocumentos: number;
        montoNeto: number;
        montoIva: number;
        montoTotal: number;
        promedioDocumento: number;
        contrapartesUnicas: number;
        deltaPctVsMesAnterior: null;
    };
    porTipoDocumento: never[];
    topContrapartesMonto: never[];
    topContrapartesCantidad: never[];
    porDia: never[];
    documentos: never[];
} | {
    exists: boolean;
    empresa: EmpresaBaseApiKey;
    mes: string;
    ano: string;
    tipo: TipoRcvDashboard;
    cacheTipo: string;
    cacheUpdatedAt: Date;
    kpis: {
        totalDocumentos: number;
        montoNeto: any;
        montoIva: any;
        montoTotal: any;
        promedioDocumento: number;
        contrapartesUnicas: number;
        deltaPctVsMesAnterior: number | null;
    };
    porTipoDocumento: {
        tipoDocumento: string;
        cantidad: number;
        montoNeto: number;
        montoIva: number;
        montoTotal: number;
    }[];
    topContrapartesMonto: {
        rut: string;
        nombre: string;
        cantidad: number;
        montoNeto: number;
        montoIva: number;
        montoTotal: number;
    }[];
    topContrapartesCantidad: {
        rut: string;
        nombre: string;
        cantidad: number;
        montoNeto: number;
        montoIva: number;
        montoTotal: number;
    }[];
    porDia: {
        fecha: string;
        cantidad: number;
        montoTotal: number;
    }[];
    documentos: any[];
}>;
export {};
//# sourceMappingURL=baseapi-rcv-dashboard.service.d.ts.map