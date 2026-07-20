export type EstadoCoordenadas = "OMITIDAS" | "NULAS" | "VALIDAS" | "INVALIDAS";
/**
 * Regla única de validación de un par latitud/longitud, compartida entre
 * DetalleEmpresa y Sucursal para que el comportamiento sea idéntico en ambos:
 *
 * - ambos omitidos (undefined)      -> OMITIDAS  (no tocar los valores existentes)
 * - ambos null                      -> NULAS     (eliminar coordenadas)
 * - ambos numéricos y en rango      -> VALIDAS   (actualizar)
 * - cualquier otra combinación      -> INVALIDAS (rechazar con 400)
 */
export declare function clasificarCoordenadas(latitud: unknown, longitud: unknown): EstadoCoordenadas;
export declare const MENSAJE_COORDENADAS_INVALIDAS = "Coordenadas inv\u00E1lidas: env\u00EDa latitud y longitud juntas, ambas num\u00E9ricas y dentro de rango (-90 a 90 / -180 a 180), o ambas null para eliminarlas.";
//# sourceMappingURL=coordenadas.d.ts.map