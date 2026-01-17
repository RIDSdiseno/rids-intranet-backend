import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

/* =====================================================
   CREAR SUCURSAL
===================================================== */
export async function crearSucursal(req: Request, res: Response) {
    const empresaId = Number(req.params.empresaId);

    const {
        nombre,
        direccion,
        telefono,
        responsableSucursals,
    } = req.body;

    if (!empresaId || !nombre) {
        return res.status(400).json({
            message: "empresaId y nombre son obligatorios",
        });
    }

    const sucursal = await prisma.sucursal.create({
        data: {
            nombre,
            direccion,
            telefono,
            empresaId,

            responsableSucursals: {
                create: Array.isArray(responsableSucursals)
                    ? responsableSucursals.map((r: any) => ({
                        nombre: r.nombre,
                        cargo: r.cargo,
                        email: r.email,
                        telefono: r.telefono,
                    }))
                    : [],
            },
        },
        include: {
            responsableSucursals: true,
            redSucursal: true,
        },
    });

    res.json(sucursal);
}

/* =====================================================
   OBTENER UNA SUCURSAL (PARA EDITAR)
===================================================== */
export async function obtenerFichaSucursal(req: Request, res: Response) {
    const sucursalId = Number(req.params.sucursalId);

    const sucursal = await prisma.sucursal.findUnique({
        where: { id_sucursal: sucursalId },
        include: {
            responsableSucursals: true,
            redSucursal: true,
        },
    });

    if (!sucursal) {
        return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    res.json(sucursal);
}

/* =====================================================
   ACTUALIZAR SUCURSAL + RESPONSABLES
===================================================== */
export async function actualizarFichaSucursal(
    req: Request,
    res: Response
): Promise<Response> {
    try {
        const sucursalId = Number(req.params.sucursalId);

        if (!sucursalId || Number.isNaN(sucursalId)) {
            return res.status(400).json({
                message: "sucursalId inválido",
            });
        }

        const {
            nombre,
            direccion,
            telefono,
            responsableSucursals,
        } = req.body;

        const sucursal = await prisma.sucursal.update({
            where: { id_sucursal: sucursalId },
            data: {
                nombre,
                direccion,
                telefono,
                responsableSucursals: {
                    deleteMany: {},
                    create: Array.isArray(responsableSucursals)
                        ? responsableSucursals.map((r: any) => ({
                            nombre: r.nombre,
                            cargo: r.cargo,
                            email: r.email,
                            telefono: r.telefono,
                        }))
                        : [],
                },
            },
            include: {
                responsableSucursals: true,
            },
        });

        return res.json({ ok: true, sucursal });

    } catch (error) {
        console.error("Error actualizando sucursal:", error);
        return res.status(500).json({
            message: "Error interno al actualizar sucursal",
        });
    }
}

/* =====================================================
   LISTAR SUCURSALES DE UNA EMPRESA (🔥 CLAVE PARA WIFI)
===================================================== */
export async function listarSucursalesEmpresa(req: Request, res: Response) {
    const empresaId = Number(req.params.empresaId);

    const sucursales = await prisma.sucursal.findMany({
        where: { empresaId },
        include: {
            responsableSucursals: true,
            redSucursal: true, // 🔥 SIN ESTO NUNCA SE VE EL WIFI
        },
        orderBy: { nombre: "asc" },
    });

    res.json(sucursales);
}

/* =====================================================
   GUARDAR / ACTUALIZAR WIFI DE UNA SUCURSAL
===================================================== */
export async function upsertRedSucursal(req: Request, res: Response) {
    const sucursalId = Number(req.params.sucursalId);

    const {
        wifiNombre,
        claveWifi,
        ipRed,
        gateway,
        observaciones,
    } = req.body;

    const red = await prisma.redSucursal.upsert({
        where: { sucursalId },
        update: {
            wifiNombre,
            claveWifi,
            ipRed,
            gateway,
            observaciones,
        },
        create: {
            sucursalId,
            wifiNombre,
            claveWifi,
            ipRed,
            gateway,
            observaciones,
        },
    });

    res.json({ ok: true, red });
}

/* =====================================================
   OBTENER WIFI DE UNA SUCURSAL
===================================================== */
export async function obtenerRedSucursal(req: Request, res: Response) {
    const sucursalId = Number(req.params.sucursalId);

    const red = await prisma.redSucursal.findUnique({
        where: { sucursalId },
    });

    res.json(red);
}
