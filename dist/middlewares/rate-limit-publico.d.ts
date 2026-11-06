/**
 * Tope general por IP.
 *
 * Es alto a propósito: en una campaña de consentimiento,
 * todos los trabajadores de una oficina pueden salir
 * a internet con la MISMA IP pública.
 */
export declare const limitePublicoPorIp: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Tope de escrituras por enlace (token), sin importar la IP.
 * Evita que un mismo enlace se use para inundar la base.
 * Los GET no cuentan.
 */
export declare const limitePublicoPorEnlace: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rate-limit-publico.d.ts.map