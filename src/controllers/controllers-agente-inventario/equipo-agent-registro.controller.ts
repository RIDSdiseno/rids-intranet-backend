// src/controllers/controllers-agente-inventario/equipo-agent-registro.controller.ts
//
// Registro del agente y códigos de instalación.
//
//   POST /equipos/agent/registro                     (público, con límite de intentos)
//     - { codigo, serial, hardwareId, hostname }     -> token nuevo (instalación con código del CRM)
//     - x-agent-api-key + { serial, hardwareId }     -> token nuevo (MIGRACIÓN de un agente ya
//       instalado; solo si el equipo existe y NUNCA tuvo token)
//   POST /equipos/agent/codigos                      (ADMIN, TECNICO) genera un código de 24 h
//   GET  /equipos/agent/codigos                      (ADMIN, TECNICO) códigos vigentes
//   POST /equipos/agent/codigos/:id/revocar          (ADMIN, TECNICO)
//   POST /equipos/agent/tokens/equipo/:id/revocar    (ADMIN) revoca el token de un equipo

import type { Request, Response } from "express";
import { z } from "zod";

import { prisma, prismaBase } from "../../lib/prisma.js";
import {
    VIGENCIA_CODIGO_HORAS,
    generarCodigoInstalacion,
    generarTokenAgente,
    hashSecreto,
    normalizarCodigoInstalacion,
    revocarTokensEquipo,
    vincularTokenAEquipo,
} from "../../service/agente/agente-auth.service.js";
import {
    cleanString,
    esIdentificadorGenerico,
    validateAgentApiKey,
} from "./equipo-agent.controller.js";

const registroSchema = z.object({
    codigo: z.unknown().optional(),
    serial: z.unknown().optional(),
    hardwareId: z.unknown().optional(),
    hostname: z.unknown().optional(),
});

/* Mismo criterio que el receptor (sin hostname: hay hostnames clonados) */
async function buscarEquipoPorIdentidad(serialBruto: unknown, hardwareIdBruto: unknown) {
    const serialRecibido = cleanString(serialBruto)?.toUpperCase() ?? null;
    const serial = serialRecibido && !esIdentificadorGenerico(serialRecibido) ? serialRecibido : null;

    const hardwareIdRecibido = cleanString(hardwareIdBruto)?.toUpperCase() ?? null;
    const hardwareId =
        hardwareIdRecibido && !esIdentificadorGenerico(hardwareIdRecibido) ? hardwareIdRecibido : null;

    if (serial) {
        const porSerial = await prisma.equipo.findFirst({
            where: { serial: { equals: serial, mode: "insensitive" } },
            select: { id_equipo: true },
        });

        if (porSerial) return porSerial;
    }

    if (hardwareId) {
        return prisma.equipo.findFirst({
            where: { hardwareId },
            orderBy: { id_equipo: "asc" },
            select: { id_equipo: true },
        });
    }

    return null;
}

export async function registrarAgente(req: Request, res: Response) {
    try {
        const body = registroSchema.parse(req.body ?? {});
        const codigo = normalizarCodigoInstalacion(body.codigo);

        /* ---------- Instalación con código del CRM ---------- */
        if (codigo) {
            const registroCodigo = await prismaBase.agenteCodigoInstalacion.findUnique({
                where: { codigoHash: hashSecreto(codigo) },
                select: { id: true, expiraAt: true, revocadoAt: true },
            });

            if (
                !registroCodigo ||
                registroCodigo.revocadoAt ||
                registroCodigo.expiraAt.getTime() <= Date.now()
            ) {
                res.status(401).json({
                    ok: false,
                    error: "Código de instalación inválido, vencido o revocado. Genere uno nuevo en el CRM (dashboard de agentes).",
                });
                return;
            }

            const equipo = await buscarEquipoPorIdentidad(body.serial, body.hardwareId);
            const token = generarTokenAgente();

            const creado = await prismaBase.agenteToken.create({
                data: {
                    tokenHash: hashSecreto(token),
                    origen: "CODIGO",
                    codigoId: registroCodigo.id,
                },
                select: { id: true },
            });

            /* Equipo ya conocido (reinstalación): queda asociado y se revocan sus tokens anteriores.
               Equipo nuevo: se asocia en su primer inventario. */
            if (equipo) {
                await vincularTokenAEquipo(creado.id, equipo.id_equipo);
            }

            await prismaBase.agenteCodigoInstalacion.update({
                where: { id: registroCodigo.id },
                data: { usos: { increment: 1 } },
            });

            res.json({ ok: true, token, equipoId: equipo?.id_equipo ?? null });
            return;
        }

        /* ---------- Migración de un agente ya instalado (key global) ---------- */
        if (!validateAgentApiKey(req)) {
            res.status(401).json({ ok: false, error: "No autorizado" });
            return;
        }

        const equipo = await buscarEquipoPorIdentidad(body.serial, body.hardwareId);

        if (!equipo) {
            res.status(409).json({
                ok: false,
                error: "El equipo no está registrado en el CRM. Instálelo con un código de instalación.",
            });
            return;
        }

        /* Solo una vez por equipo: si ya tuvo token (aunque esté revocado), necesita código */
        const tuvoToken = await prismaBase.agenteToken.count({
            where: { equipoId: equipo.id_equipo },
        });

        if (tuvoToken > 0) {
            res.status(403).json({
                ok: false,
                error: "Este equipo ya tuvo un token. Reinstale el agente con un código de instalación.",
            });
            return;
        }

        const token = generarTokenAgente();

        await prismaBase.agenteToken.create({
            data: {
                tokenHash: hashSecreto(token),
                origen: "MIGRACION",
                equipoId: equipo.id_equipo,
            },
        });

        res.json({ ok: true, token, equipoId: equipo.id_equipo });
    } catch (error) {
        console.error("registrarAgente error:", error);
        res.status(500).json({ ok: false, error: "Error al registrar el agente" });
    }
}

/* ===================== Códigos de instalación (CRM) ===================== */

export async function crearCodigoInstalacion(req: Request, res: Response) {
    try {
        const user = (req as any).user as { id?: number; email?: string | null } | undefined;

        const codigo = generarCodigoInstalacion();
        const expiraAt = new Date(Date.now() + VIGENCIA_CODIGO_HORAS * 60 * 60 * 1000);

        const creado = await prismaBase.agenteCodigoInstalacion.create({
            data: {
                codigoHash: hashSecreto(normalizarCodigoInstalacion(codigo)),
                codigoFin: codigo.slice(-4),
                creadoPorId: typeof user?.id === "number" ? user.id : null,
                creadoPorEmail: user?.email ?? null,
                expiraAt,
            },
            select: { id: true },
        });

        /* El código en claro solo se entrega aquí (en la base queda el hash) */
        res.status(201).json({ ok: true, id: creado.id, codigo, expiraAt });
    } catch (error) {
        console.error("crearCodigoInstalacion error:", error);
        res.status(500).json({ ok: false, error: "Error al generar el código" });
    }
}

export async function listarCodigosInstalacion(_req: Request, res: Response) {
    try {
        const codigos = await prismaBase.agenteCodigoInstalacion.findMany({
            where: { revocadoAt: null, expiraAt: { gt: new Date() } },
            select: {
                id: true,
                codigoFin: true,
                creadoPorEmail: true,
                expiraAt: true,
                usos: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        res.json({ ok: true, items: codigos });
    } catch (error) {
        console.error("listarCodigosInstalacion error:", error);
        res.status(500).json({ ok: false, error: "Error al listar los códigos" });
    }
}

export async function revocarCodigoInstalacion(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ ok: false, error: "ID inválido" });
            return;
        }

        const r = await prismaBase.agenteCodigoInstalacion.updateMany({
            where: { id, revocadoAt: null },
            data: { revocadoAt: new Date() },
        });

        res.json({ ok: true, revocado: r.count > 0 });
    } catch (error) {
        console.error("revocarCodigoInstalacion error:", error);
        res.status(500).json({ ok: false, error: "Error al revocar el código" });
    }
}

/* ===================== Revocar token de un equipo (CRM) ===================== */

export async function revocarTokenEquipo(req: Request, res: Response) {
    try {
        const equipoId = Number(req.params.id);

        if (!Number.isInteger(equipoId) || equipoId <= 0) {
            res.status(400).json({ ok: false, error: "ID inválido" });
            return;
        }

        const user = (req as any).user as { email?: string | null } | undefined;
        const revocados = await revocarTokensEquipo(equipoId, "REVOCADO_CRM");

        if (revocados > 0) {
            const por = user?.email ?? "CRM";

            await prisma.equipoAgenteEvento.create({
                data: {
                    equipoId,
                    tipo: "AGENTE_TOKEN_REVOCADO",
                    mensaje: `Token del agente revocado por ${por}`,
                    metadata: {
                        "Token del agente": { before: "Activo", after: "Revocado" },
                        "Revocado por": { before: null, after: por },
                    },
                },
            });
        }

        res.json({ ok: true, revocados });
    } catch (error) {
        console.error("revocarTokenEquipo error:", error);
        res.status(500).json({ ok: false, error: "Error al revocar el token" });
    }
}