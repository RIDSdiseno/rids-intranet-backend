import type { EmpresaBaseApiKey } from "../baseapi.empresas.js";
import type { EstadoPuntualidadCliente } from "./puntualidad-cliente.service.js";
export type FinanzasClientePago = {
    rut: string;
    razonSocial: string;
    estado: EstadoPuntualidadCliente;
    score: number | null;
    totalConciliadas: number;
    conVencimientoRegistrado: number;
    aTiempo: number;
    atrasadas: number;
    porcentajeATiempo: number;
    promedioDiasAtraso: number;
    montoPagado: number;
    ultimaFechaPago: Date | null;
};
export declare function obtenerAnalisisClientesFinanzas(params: {
    empresaKey: EmpresaBaseApiKey;
    ano?: number;
}): Promise<{
    totalClientes: number;
    resumen: {
        excelente: number;
        buenPagador: number;
        irregular: number;
        riesgoMora: number;
        sinHistorial: number;
    };
    mejoresPagadores: FinanzasClientePago[];
    mayorRiesgo: FinanzasClientePago[];
    clientes: FinanzasClientePago[];
}>;
//# sourceMappingURL=finanzas-clientes.service.d.ts.map