export declare const HOSTNAME_MAX = 15;
/** Mayusculas, sin tildes ni caracteres fuera de A-Z / 0-9 (la Ñ pasa a N). */
export declare function normalizarTexto(valor: string): string;
/** Sigla de la empresa: iniciales (hasta 4) o, si es una sola palabra, sus 4 primeras letras. */
export declare function calcularSiglaEmpresa(nombre: string): string;
/**
 * Inicial del primer nombre + primer apellido.
 *   2-3 palabras: Juan Perez [Soto] -> JPEREZ
 *   4+ palabras:  Juan Carlos Perez Soto -> JPEREZ (penultima)
 */
export declare function calcularParteSolicitante(nombre: string): string | null;
export declare function prefijoTipo(tipo: string): string;
/** Candidato n (1 = sin sufijo), recortando el nombre para respetar el maximo. */
export declare function armarCandidato(base: string, nombre: string, n: number): string;
export type HostnameSugeridoResultado = {
    ok: true;
    idEquipo: number;
    actual: string | null;
    sugerido: string | null;
    coincide: boolean;
    motivo: string | null;
    detalle: {
        prefijo: string | null;
        sigla: string | null;
        parteSolicitante: string | null;
        sinSolicitante: boolean;
    };
};
/**
 * Calcula la sugerencia a partir de los datos ya cargados.
 * `ocupados`: hostnames (en mayusculas) de los otros equipos de la empresa.
 */
export declare function sugerirHostname(params: {
    tipo: string;
    hostnameActual: string | null;
    nombreEmpresa: string | null;
    nombreSolicitante: string | null;
    ocupados: Set<string>;
}): {
    sugerido: string | null;
    motivo: string | null;
    prefijo: string | null;
    sigla: string | null;
    parteSolicitante: string | null;
};
/** Carga los datos del equipo y calcula el hostname sugerido. null = equipo no existe. */
export declare function obtenerHostnameSugerido(idEquipo: number): Promise<HostnameSugeridoResultado | null>;
//# sourceMappingURL=hostname-sugerido.service.d.ts.map