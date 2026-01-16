import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

export async function obtenerRedSucursal(req: Request, res: Response) {
    const { sucursalId } = req.params;

    const red = await prisma.redSucursal.findUnique({
        where: { sucursalId: Number(sucursalId) }
    });

    res.json(red);
}

export async function upsertRedSucursal(req: Request, res: Response) {
    const { sucursalId } = req.params;
    const { wifiNombre, claveWifi, ipRed, gateway, observaciones } = req.body;

    const red = await prisma.redSucursal.upsert({
        where: { sucursalId: Number(sucursalId) },
        update: {
            wifiNombre,
            claveWifi,
            ipRed,
            gateway,
            observaciones
        },
        create: {
            sucursalId: Number(sucursalId),
            wifiNombre,
            claveWifi,
            ipRed,
            gateway,
            observaciones
        }
    });

    res.json(red);
}
