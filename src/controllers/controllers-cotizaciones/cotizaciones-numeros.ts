// src/controllers/controllers-cotizaciones/cotizaciones-numeros.ts
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
export function parseDecimalInput(
    value: unknown,
    fallback = 0
): number {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    if (typeof value === "number") {
        return Number.isFinite(value)
            ? value
            : fallback;
    }

    const normalized = String(value)
        .trim()
        .replace(",", ".");

    const parsed = Number(normalized);

    return Number.isFinite(parsed)
        ? parsed
        : fallback;
}

/**
 * Redondea valores financieros a dos decimales.
 */
export function redondearDinero(
    value: number
): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.round(
        (value + Number.EPSILON) * 100
    ) / 100;
}

/**
 * Descuento entre 0 y 100.
 */
export function normalizarDescuento(
    value: unknown
): number {
    const parsed = parseDecimalInput(
        value,
        0
    );

    return redondearDinero(
        Math.min(
            100,
            Math.max(0, parsed)
        )
    );
}

/**
 * Porcentaje de ganancia.
 *
 * Puede ser superior a 100.
 */
export function normalizarGanancia(
    value: unknown
): number {
    const parsed = parseDecimalInput(
        value,
        0
    );

    return redondearDinero(
        Math.max(0, parsed)
    );
}

/**
 * La cantidad continúa siendo entera porque
 * Prisma la mantiene como Int.
 */
export function normalizarCantidad(
    value: unknown
): number {
    const parsed = parseDecimalInput(
        value,
        1
    );

    return Math.max(
        1,
        Math.trunc(parsed)
    );
}

export type ItemCotizacionCalculo = {
    tipo?: string;
    cantidad?: unknown;
    precio?: unknown;
    precioOriginalCLP?: unknown;
    porcentaje?: unknown;
    tieneDescuento?: unknown;
    tieneIVA?: unknown;
};

const IVA_CHILE = 0.19;

/**
 * Calcula subtotal, descuentos, IVA y total
 * utilizando los ítems como fuente de verdad.
 */
export function calcularTotalesCotizacionBackend(
    items: ItemCotizacionCalculo[]
) {
    let subtotalBruto = 0;
    let descuentosIndividuales = 0;
    let descuentoGlobal = 0;
    let subtotalAntesGlobal = 0;
    let ivaAntesGlobal = 0;

    /*
     * Subtotal bruto de productos y servicios.
     */
    for (const item of items) {
        if (item.tipo === "ADICIONAL") {
            continue;
        }

        const precio = redondearDinero(
            parseDecimalInput(
                item.precioOriginalCLP ??
                item.precio,
                0
            )
        );

        const cantidad = normalizarCantidad(
            item.cantidad
        );

        subtotalBruto +=
            precio * cantidad;
    }

    /*
     * Descuentos individuales e IVA.
     */
    for (const item of items) {
        if (item.tipo === "ADICIONAL") {
            continue;
        }

        const precio = redondearDinero(
            parseDecimalInput(
                item.precioOriginalCLP ??
                item.precio,
                0
            )
        );

        const cantidad = normalizarCantidad(
            item.cantidad
        );

        const porcentaje = normalizarDescuento(
            item.porcentaje
        );

        const base =
            precio * cantidad;

        const descuento =
            Boolean(item.tieneDescuento) &&
                porcentaje > 0
                ? base *
                (porcentaje / 100)
                : 0;

        const neto = Math.max(
            0,
            base - descuento
        );

        descuentosIndividuales +=
            descuento;

        subtotalAntesGlobal +=
            neto;

        if (Boolean(item.tieneIVA)) {
            ivaAntesGlobal +=
                neto * IVA_CHILE;
        }
    }

    /*
     * Ítems ADICIONAL como descuentos globales.
     */
    for (const item of items) {
        if (item.tipo !== "ADICIONAL") {
            continue;
        }

        const porcentaje = normalizarDescuento(
            item.porcentaje
        );

        descuentoGlobal +=
            subtotalBruto *
            (porcentaje / 100);
    }

    descuentoGlobal = Math.min(
        descuentoGlobal,
        subtotalAntesGlobal
    );

    const subtotal = Math.max(
        0,
        subtotalAntesGlobal -
        descuentoGlobal
    );

    /*
     * Reducir proporcionalmente el IVA cuando
     * se aplica un descuento global.
     */
    const factorGlobal =
        subtotalAntesGlobal > 0
            ? subtotal /
            subtotalAntesGlobal
            : 0;

    const iva =
        ivaAntesGlobal *
        factorGlobal;

    const descuentos =
        descuentosIndividuales +
        descuentoGlobal;

    const total =
        subtotal + iva;

    return {
        subtotalBruto:
            redondearDinero(
                subtotalBruto
            ),

        descuentos:
            redondearDinero(
                descuentos
            ),

        subtotal:
            redondearDinero(
                subtotal
            ),

        iva:
            redondearDinero(
                iva
            ),

        total:
            redondearDinero(
                total
            ),
    };
}