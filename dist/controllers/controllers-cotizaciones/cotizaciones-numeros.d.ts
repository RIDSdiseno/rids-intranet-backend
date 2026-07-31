/**
 * Convierte un valor recibido desde la API
 * a un número decimal válido.
 *
 * Admite:
 * 140
 * 140.5
 * "140.5"
 * "140,5"
 */
export declare function parseDecimalInput(value: unknown, fallback?: number): number;
/**
 * Redondea valores financieros a dos decimales.
 */
export declare function redondearDinero(value: number): number;
/**
 * Descuento entre 0 y 100.
 */
export declare function normalizarDescuento(value: unknown): number;
/**
 * Porcentaje de ganancia.
 *
 * Puede ser superior a 100.
 */
export declare function normalizarGanancia(value: unknown): number;
/**
 * La cantidad continúa siendo entera porque
 * Prisma la mantiene como Int.
 */
export declare function normalizarCantidad(value: unknown): number;
export type ItemCotizacionCalculo = {
    tipo?: string;
    cantidad?: unknown;
    precio?: unknown;
    precioOriginalCLP?: unknown;
    porcentaje?: unknown;
    tieneDescuento?: unknown;
    tieneIVA?: unknown;
};
/**
 * Calcula subtotal, descuentos, IVA y total
 * utilizando los ítems como fuente de verdad.
 */
export declare function calcularTotalesCotizacionBackend(items: ItemCotizacionCalculo[]): {
    subtotalBruto: number;
    descuentos: number;
    subtotal: number;
    iva: number;
    total: number;
};
//# sourceMappingURL=cotizaciones-numeros.d.ts.map