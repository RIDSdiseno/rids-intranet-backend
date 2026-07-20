// src/utils/coordenadas.ts

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
export function clasificarCoordenadas(latitud: unknown, longitud: unknown): EstadoCoordenadas {
  const latOmitida = latitud === undefined;
  const lngOmitida = longitud === undefined;

  if (latOmitida && lngOmitida) return "OMITIDAS";
  if (latOmitida !== lngOmitida) return "INVALIDAS";

  const latNula = latitud === null;
  const lngNula = longitud === null;

  if (latNula && lngNula) return "NULAS";
  if (latNula !== lngNula) return "INVALIDAS";

  if (typeof latitud !== "number" || typeof longitud !== "number") return "INVALIDAS";
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return "INVALIDAS";
  if (latitud < -90 || latitud > 90) return "INVALIDAS";
  if (longitud < -180 || longitud > 180) return "INVALIDAS";

  return "VALIDAS";
}

export const MENSAJE_COORDENADAS_INVALIDAS =
  "Coordenadas inválidas: envía latitud y longitud juntas, ambas numéricas y dentro de rango (-90 a 90 / -180 a 180), o ambas null para eliminarlas.";
