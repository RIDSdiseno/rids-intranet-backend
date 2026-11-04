// src/middlewares/rate-limit-publico.ts

import rateLimit from "express-rate-limit";

/*
 * Límites para endpoints públicos (sin login):
 * - Ficha Ley PD:        /api/public/leypd/*
 * - Consentimientos:     /api/proteccion-datos/publico/*
 *
 * Requiere app.set("trust proxy", 1) (ya configurado),
 * si no todas las requests tendrían la IP del proxy de Railway.
 *
 * Store en memoria: si Railway corre varias instancias,
 * cada una cuenta por separado (límite efectivo más laxo).
 */

const DIEZ_MINUTOS =
    10 * 60 * 1000;

const respuesta429 = {
    ok: false,
    error: "RATE_LIMIT",
    message:
        "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
};

/**
 * Tope general por IP.
 *
 * Es alto a propósito: en una campaña de consentimiento,
 * todos los trabajadores de una oficina pueden salir
 * a internet con la MISMA IP pública.
 */
export const limitePublicoPorIp =
    rateLimit({
        windowMs: DIEZ_MINUTOS,
        limit: 300,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: respuesta429,
    });

/**
 * Tope de escrituras por enlace (token), sin importar la IP.
 * Evita que un mismo enlace se use para inundar la base.
 * Los GET no cuentan.
 */
export const limitePublicoPorEnlace =
    rateLimit({
        windowMs: DIEZ_MINUTOS,
        limit: 60,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: respuesta429,

        skip: (req) =>
            req.method === "GET",

        keyGenerator: (req) =>
            `${req.baseUrl}${req.path}`,
    });