import { type CampoFichaLeypd } from "./leypd-ficha-campos.js";
export declare class FichaLeypdValidacionError extends Error {
    readonly errores: Record<string, string>;
    constructor(errores: Record<string, string>);
}
export declare function esValorVacio(valor: unknown): boolean;
/**
 * Valida RUT chileno por dígito verificador (módulo 11).
 * Acepta 12.345.678-9, 12345678-9 o 123456789.
 */
export declare function validarRutChileno(rut: string): boolean;
/**
 * Devuelve un mensaje de error o null si es válido.
 * Los valores vacíos no se validan aquí.
 */
export declare function validarValorCampoFichaLeypd(campo: CampoFichaLeypd, valor: unknown): string | null;
/**
 * Valida un payload de cambios:
 * - solo keys del catálogo oficial
 * - formato y largo de cada valor no vacío
 */
export declare function validarCambiosFichaLeypd(datos: Record<string, unknown>): void;
/**
 * Verifica obligatorios sobre los datos finales.
 *
 * Las preguntas condicionales no se exigen
 * hasta implementar la aplicabilidad (Fase A.2).
 */
export declare function validarObligatoriosFichaLeypd(datosFinales: Record<string, {
    valor: unknown;
} | undefined>): void;
//# sourceMappingURL=leypd-ficha-validacion.d.ts.map