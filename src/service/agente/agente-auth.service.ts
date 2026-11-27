// src/service/agente/agente-auth.service.ts
//
// Autenticación del agente de inventario.
//   - Token por equipo (x-agent-token): lo entrega POST /equipos/agent/registro
//     a cambio de un código de instalación del CRM (o, una sola vez, de la key
//     global en equipos que ya existen: migración de agentes instalados).
//     En la base solo se guarda el hash SHA-256 del token y del código.
//   - Key global (x-agent-api-key, WINDOWS_AGENT_API_KEY): agentes antiguos,
//     se acepta hasta que se decida el corte.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

import { prisma, prismaBase } from "../../lib/prisma.js";

export type AutenticacionAgente =
    | { tipo: "TOKEN"; tokenId: number; equipoId: number | null }
    | { tipo: "KEY_GLOBAL" };

/* Sin caracteres ambiguos (0/O, 1/I/L) para dictar el código por teléfono */
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const VIGENCIA_CODIGO_HORAS = 24;

export function hashSecreto(valor: string): string {
    return createHash("sha256").update(valor, "utf8").digest("hex");
}

/** Código de 8 caracteres, presentado como XXXX-XXXX. */
export function generarCodigoInstalacion(): string {
    let codigo = "";

    for (let i = 0; i < 8; i++) {
        codigo += ALFABETO_CODIGO.charAt(randomInt(ALFABETO_CODIGO.length));
    }

    return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/** Mayúsculas y solo letras/números: «abcd-efgh» y «ABCDEFGH» son el mismo código. */
export function normalizarCodigoInstalacion(valor: unknown): string {
    return String(valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generarTokenAgente(): string {
    return randomBytes(32).toString("base64url");
}

function keyGlobalValida(recibida: string | undefined): boolean {
    const esperada = process.env.WINDOWS_AGENT_API_KEY?.trim();
    const valor = recibida?.trim();

    if (!esperada || !valor) return false;

    const a = Buffer.from(esperada);
    const b = Buffer.from(valor);

    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Token del equipo (si viene) o key global. null = no autorizado.
 * Si viene un token, la key global NO se usa como respaldo: un token revocado
 * debe dejar de funcionar aunque el equipo tenga la key antigua.
 */
export async function autenticarAgente(req: Request): Promise<AutenticacionAgente | null> {
    const token = req.header("x-agent-token")?.trim();

    if (token) {
        const registro = await prisma.agenteToken.findUnique({
            where: { tokenHash: hashSecreto(token) },
            select: { id: true, equipoId: true, revocadoAt: true },
        });

        if (!registro || registro.revocadoAt) return null;

        /* Sin auditoría: es solo la marca de último uso */
        await prismaBase.agenteToken.update({
            where: { id: registro.id },
            data: { lastUsedAt: new Date() },
        });

        return { tipo: "TOKEN", tokenId: registro.id, equipoId: registro.equipoId };
    }

    if (keyGlobalValida(req.header("x-agent-api-key"))) {
        return { tipo: "KEY_GLOBAL" };
    }

    return null;
}

/**
 * Asocia el token al equipo y revoca los otros tokens activos de ese equipo
 * (reinstalación: queda válido solo el último).
 */
export async function vincularTokenAEquipo(tokenId: number, equipoId: number): Promise<void> {
    await prismaBase.agenteToken.updateMany({
        where: { equipoId, revocadoAt: null, id: { not: tokenId } },
        data: { revocadoAt: new Date(), motivoRevocacion: "REEMPLAZADO" },
    });

    await prismaBase.agenteToken.update({
        where: { id: tokenId },
        data: { equipoId },
    });
}

/**
 * El equipo ya tuvo token (activo, revocado o reemplazado). Desde ese momento la
 * key global no sirve para ese equipo: si no, una revocación desde el CRM se
 * podría saltar enviando con la key antigua.
 */
export async function equipoTuvoToken(equipoId: number): Promise<boolean> {
    const total = await prisma.agenteToken.count({ where: { equipoId } });
    return total > 0;
}

export const MENSAJE_KEY_GLOBAL_RECHAZADA =
    "Este equipo usa token propio: la key global ya no es válida. Reinstale el agente con Inventario.bat y un código de instalación del CRM.";

/** Revoca todos los tokens activos del equipo. Devuelve cuántos revocó. */
export async function revocarTokensEquipo(equipoId: number, motivo: string): Promise<number> {
    const r = await prismaBase.agenteToken.updateMany({
        where: { equipoId, revocadoAt: null },
        data: { revocadoAt: new Date(), motivoRevocacion: motivo },
    });

    return r.count;
}