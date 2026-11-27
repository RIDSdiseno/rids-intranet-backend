// src/controllers/controllers-agente-inventario/equipo-agent-uninstall.controller.ts
//
// Aviso de desinstalación del agente de inventario Windows.
// Lo llama el desinstalador (uninstall-rids-agent.ps1) antes de borrar
// C:\RIDS-Agent. Se protege con la misma x-agent-api-key del inventario.
//
// No cambia el esquema: deja un evento AGENTE_DESINSTALADO en
// EquipoAgenteEvento. El dashboard de agentes muestra el equipo como
// «Desinstalado» mientras ese evento sea posterior al último envío
// (lastSeenAt). Si el agente se reinstala y vuelve a enviar, el equipo
// queda activo otra vez sin hacer nada más.

import type { Request, Response } from "express";
import { z } from "zod";

import { prisma, prismaBase } from "../../lib/prisma.js";
import {
    cleanString,
    esIdentificadorGenerico,
} from "./equipo-agent.controller.js";

import {
    autenticarAgente,
    equipoTuvoToken,
    MENSAJE_KEY_GLOBAL_RECHAZADA,
    revocarTokensEquipo,
} from "../../service/agente/agente-auth.service.js";

export const TIPO_EVENTO_AGENTE_DESINSTALADO = "AGENTE_DESINSTALADO";

const uninstallBodySchema = z.object({
    serial: z.unknown().optional(),
    hardwareId: z.unknown().optional(),
    hostname: z.unknown().optional(),
    tecnicoEmail: z.unknown().optional(),
    usuarioWindows: z.unknown().optional(),
    agenteVersion: z.unknown().optional(),
});

export async function receiveEquipoAgentUninstall(req: Request, res: Response) {
    try {
        const autenticacion = await autenticarAgente(req);

        if (!autenticacion) {
            res.status(401).json({ ok: false, error: "No autorizado" });
            return;
        }

        const body = uninstallBodySchema.parse(req.body ?? {});

        const serialRecibido = cleanString(body.serial)?.toUpperCase() ?? null;
        const serial =
            serialRecibido && !esIdentificadorGenerico(serialRecibido)
                ? serialRecibido
                : null;

        const hardwareIdRecibido = cleanString(body.hardwareId)?.toUpperCase() ?? null;
        const hardwareId =
            hardwareIdRecibido && !esIdentificadorGenerico(hardwareIdRecibido)
                ? hardwareIdRecibido
                : null;

        const hostname = cleanString(body.hostname);
        const tecnicoEmail = cleanString(body.tecnicoEmail)?.toLowerCase() ?? null;
        const usuarioWindows = cleanString(body.usuarioWindows);
        const agenteVersion = cleanString(body.agenteVersion);

        /* Misma búsqueda que el receptor: serial → hardwareId → hostname. */
        let equipo: { id_equipo: number; hostname: string | null } | null = null;

        /* Con token asociado, el equipo es el del token */
        if (autenticacion.tipo === "TOKEN" && autenticacion.equipoId) {
            equipo = await prisma.equipo.findFirst({
                where: { id_equipo: autenticacion.equipoId },
                select: { id_equipo: true, hostname: true },
            });
        }

        if (!equipo && serial) {
            equipo = await prisma.equipo.findFirst({
                where: { serial: { equals: serial, mode: "insensitive" } },
                select: { id_equipo: true, hostname: true },
            });
        }

        if (!equipo && hardwareId) {
            equipo = await prisma.equipo.findFirst({
                where: { hardwareId },
                orderBy: { id_equipo: "asc" },
                select: { id_equipo: true, hostname: true },
            });
        }

        /*
         * Por hostname solo si hay un único equipo con agente con ese nombre:
         * hay hostnames repetidos entre equipos (imágenes clonadas).
         */
        if (!equipo && hostname) {
            const coincidencias = await prisma.equipo.findMany({
                where: {
                    hostname: { equals: hostname, mode: "insensitive" },
                    deletedAt: null,
                    lastSeenAt: { not: null },
                },
                select: { id_equipo: true, hostname: true },
                take: 2,
            });

            if (coincidencias.length === 1) {
                equipo = coincidencias[0] ?? null;
            }
        }

        if (!equipo) {
            res.status(404).json({
                ok: false,
                error: "No se encontró el equipo en el CRM (serial, hardwareId u hostname).",
            });
            return;
        }

        /* Con la key global no se puede marcar como desinstalado un equipo con token */
        if (autenticacion.tipo === "KEY_GLOBAL" && (await equipoTuvoToken(equipo.id_equipo))) {
            res.status(403).json({ ok: false, error: MENSAJE_KEY_GLOBAL_RECHAZADA });
            return;
        }

        const desinstaladoPor = usuarioWindows ?? tecnicoEmail ?? "técnico";

        await prisma.equipoAgenteEvento.create({
            data: {
                equipoId: equipo.id_equipo,
                tipo: TIPO_EVENTO_AGENTE_DESINSTALADO,
                mensaje: `Agente de inventario desinstalado por ${desinstaladoPor}`,
                metadata: {
                    Agente: { before: "Instalado", after: "Desinstalado" },
                    "Desinstalado por": { before: null, after: desinstaladoPor },
                    ...(tecnicoEmail
                        ? { "Técnico instalador": { before: null, after: tecnicoEmail } }
                        : {}),
                    ...(agenteVersion
                        ? { "Versión del agente": { before: agenteVersion, after: null } }
                        : {}),
                },
            },
        });

        /*
 * Sin auditoría: el cambio ya queda en el evento del historial.
 * El receptor vuelve a poner agenteActivo = true y estadoAgente = ACTIVO
 * en el próximo envío (agente reinstalado).
 */
        await prismaBase.equipo.update({
            where: { id_equipo: equipo.id_equipo },
            data: {
                agenteActivo: false,
                estadoAgente: "DESINSTALADO",
            },
        });

        /* El token del equipo deja de servir (al reinstalar se pide un código nuevo) */
        const tokensRevocados = await revocarTokensEquipo(equipo.id_equipo, "DESINSTALADO");

        res.json({
            ok: true,
            equipoId: equipo.id_equipo,
            hostname: equipo.hostname,
            tokensRevocados,
        });
    } catch (error) {
        console.error("receiveEquipoAgentUninstall error:", error);

        res.status(500).json({
            ok: false,
            error: "Error al registrar la desinstalación del agente",
        });
    }
}