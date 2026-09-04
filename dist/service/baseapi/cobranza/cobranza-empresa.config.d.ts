import type { EmpresaKey } from "./cobranza-estado.service.js";
export type DatosPagoEmpresa = {
    beneficiario: string;
    rut: string;
    banco: string;
    tipoCuenta: string;
    numeroCuenta: string;
    emailPago: string;
    observacion?: string;
};
export type ConfigCorreoEmpresa = {
    nombre: string;
    colorPrimario: string;
    colorFondoSuave: string;
    colorBorde: string;
    correo: string;
    telefono?: string;
    datosPago: DatosPagoEmpresa;
};
export declare function getConfigCorreoEmpresa(empresaKey: EmpresaKey): ConfigCorreoEmpresa;
export declare function getDatosPagoEmpresa(empresaKey: EmpresaKey): DatosPagoEmpresa;
export declare function getNombreEmpresaCobranza(empresaKey: EmpresaKey): string;
//# sourceMappingURL=cobranza-empresa.config.d.ts.map