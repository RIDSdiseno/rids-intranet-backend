// src/controllers/controllers-empresas/red-sucursal.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

const MAX_IPS_PUBLICAS =
    5;

function normalizarIpsPublicas(
    value:
        unknown
): string[] {

    if (
        value ===
        null ||
        value ===
        undefined
    ) {
        return [];
    }

    const valores =
        Array.isArray(
            value
        )
            ? value
            : [
                value,
            ];

    const ips =
        Array.from(
            new Set(
                valores
                    .filter(
                        (
                            item
                        ): item is string =>
                            typeof item ===
                            "string"
                    )
                    .map(
                        item =>
                            item.trim()
                    )
                    .filter(
                        Boolean
                    )
            )
        );

    if (
        ips.length >
        MAX_IPS_PUBLICAS
    ) {
        throw new Error(
            `Solo se permiten hasta ${MAX_IPS_PUBLICAS} IP públicas`
        );
    }

    return ips;
}

export async function crearEmpresaISP(req: Request, res: Response) {
    const empresaId = Number(req.params.empresaId);
    const body = req.body;
    const ipsPublicas =
        normalizarIpsPublicas(
            body.ipRed
        );

    if (body.esPrincipal) {
        await prisma.empresaISP.updateMany({
            where: { empresaId },
            data: { esPrincipal: false },
        });
    }

    const nueva = await prisma.empresaISP.create({
        data: {
            empresaId,
            sucursalId: body.sucursalId ?? null,
            esPrincipal: body.esPrincipal ?? false,
            operador: body.operador ?? null,
            telefono: body.telefono ?? null,
            servicio: body.servicio ?? null,
            numeroTicket: body.numeroTicket ?? null,
            wifiNombre: body.wifiNombre ?? null,
            wifiClaveRef: body.wifiClaveRef ?? null,
            ipRed:
                ipsPublicas,
        },
    });

    res.json({ ok: true, isp: nueva });
}

export async function obtenerEmpresaISPs(req: Request, res: Response) {
    const empresaId = Number(req.params.empresaId);

    const isps = await prisma.empresaISP.findMany({
        where: { empresaId },
        include: { sucursal: true },
        orderBy: [
            { esPrincipal: "desc" },
            { createdAt: "asc" }
        ],
    });

    res.json(isps);
}

export async function actualizarEmpresaISP(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        const body =
            req.body;

        if (
            !Number.isInteger(
                id
            ) ||
            id <=
            0
        ) {
            return res
                .status(
                    400
                )
                .json({
                    error:
                        "ID inválido",
                });
        }

        const existente =
            await prisma
                .empresaISP
                .findUnique({
                    where: {
                        id,
                    },
                });

        if (
            !existente
        ) {
            return res
                .status(
                    404
                )
                .json({
                    error:
                        "Red no encontrada",
                });
        }

        const ipsPublicas =
            normalizarIpsPublicas(
                body.ipRed
            );

        if (
            body.esPrincipal
        ) {
            await prisma
                .empresaISP
                .updateMany({
                    where: {
                        empresaId:
                            existente.empresaId,
                    },

                    data: {
                        esPrincipal:
                            false,
                    },
                });
        }

        const actualizada =
            await prisma
                .empresaISP
                .update({
                    where: {
                        id,
                    },

                    data: {
                        sucursalId:
                            body.sucursalId ??
                            null,

                        esPrincipal:
                            body.esPrincipal ??
                            existente.esPrincipal,

                        operador:
                            body.operador ??
                            null,

                        telefono:
                            body.telefono ??
                            null,

                        servicio:
                            body.servicio ??
                            null,

                        numeroTicket:
                            body.numeroTicket ??
                            null,

                        wifiNombre:
                            body.wifiNombre ??
                            null,

                        wifiClaveRef:
                            body.wifiClaveRef ??
                            null,

                        ipRed:
                            ipsPublicas,
                    },
                });

        return res.json({
            ok:
                true,

            isp:
                actualizada,
        });

    } catch (
    error
    ) {
        console.error(
            "Error actualizando ISP:",
            error
        );

        return res
            .status(
                400
            )
            .json({
                error:
                    error instanceof
                        Error
                        ? error.message
                        : "No se pudo actualizar la red",
            });
    }
}
export async function eliminarEmpresaISP(req: Request, res: Response) {
    const id = Number(req.params.id);

    await prisma.empresaISP.delete({
        where: { id },
    });

    res.json({ ok: true });
}
