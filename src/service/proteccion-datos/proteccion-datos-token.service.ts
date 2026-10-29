// src/service/proteccion-datos/proteccion-datos-token.service.ts
import {
    createHash,
    randomBytes,
} from "crypto";

import type {
    TokenConsentimientoGenerado,
} from "./proteccion-datos.types.js";

const TOKEN_BYTES = 32;

/* =========================================================
   SHA-256
   ========================================================= */

function hashSha256(
    value: string,
): string {
    return createHash(
        "sha256",
    )
        .update(
            value,
            "utf8",
        )
        .digest(
            "hex",
        );
}

/* =========================================================
   TOKEN
   ========================================================= */

export function generarTokenConsentimiento(): string {
    return randomBytes(
        TOKEN_BYTES,
    ).toString(
        "hex",
    );
}

/* =========================================================
   HASH TOKEN
   ========================================================= */

export function hashTokenConsentimiento(
    token: string,
): string {
    if (
        typeof token !== "string" ||
        !token.trim()
    ) {
        throw new Error(
            "Token de consentimiento inválido",
        );
    }

    return hashSha256(
        token.trim(),
    );
}

/* =========================================================
   TOKEN + HASH
   ========================================================= */

export function generarTokenConsentimientoCompleto():
    TokenConsentimientoGenerado {

    const token =
        generarTokenConsentimiento();

    return {
        token,
        tokenHash:
            hashTokenConsentimiento(
                token,
            ),
    };
}