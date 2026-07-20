import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { clasificarCoordenadas, MENSAJE_COORDENADAS_INVALIDAS } from "../../utils/coordenadas.js";

/* =====================================================
   CREAR SUCURSAL
===================================================== */
export async function crearSucursal(
    req: Request,
    res: Response
): Promise<Response> {
    const empresaId = Number(req.params.empresaId);

    const {
        nombre,
        direccion,
        latitud,
        longitud,
        telefono,
        responsableSucursals,
    } = req.body;

    if (!empresaId || !nombre) {
        return res.status(400).json({
            message: "empresaId y nombre son obligatorios",
        });
    }

    if (clasificarCoordenadas(latitud, longitud) === "INVALIDAS") {
        return res.status(400).json({ message: MENSAJE_COORDENADAS_INVALIDAS });
    }

    const sucursal = await prisma.sucursal.create({
        data: {
            nombre,
            direccion,
            // Creación: sin valor previo que preservar, omitidas/nulas equivalen a null.
            latitud: latitud ?? null,
            longitud: longitud ?? null,
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

    return res.json(sucursal);
}


/* =====================================================
   OBTENER UNA SUCURSAL (PARA EDITAR)
===================================================== */
export async function obtenerFichaSucursal(
    req: Request,
    res: Response
): Promise<Response> {
    const sucursalId = Number(req.params.sucursalId);

    if (!sucursalId || Number.isNaN(sucursalId)) {
        return res.status(400).json({
            message: "sucursalId inválido",
        });
    }

    const sucursal = await prisma.sucursal.findUnique({
        where: { id_sucursal: sucursalId },
        include: {
            responsableSucursals: true,
            redSucursal: true,
        },
    });

    if (!sucursal) {
        return res.status(404).json({
            message: "Sucursal no encontrada",
        });
    }

    return res.json(sucursal);
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
            latitud,
            longitud,
            telefono,
            responsableSucursals,
        } = req.body;

        const clasificacion = clasificarCoordenadas(latitud, longitud);
        if (clasificacion === "INVALIDAS") {
            return res.status(400).json({ message: MENSAJE_COORDENADAS_INVALIDAS });
        }

        const data: any = {
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
        };

        // OMITIDAS -> no tocar latitud/longitud, se preservan las existentes.
        if (clasificacion === "NULAS") {
            data.latitud = null;
            data.longitud = null;
        } else if (clasificacion === "VALIDAS") {
            data.latitud = latitud;
            data.longitud = longitud;
        }

        const sucursal = await prisma.sucursal.update({
            where: { id_sucursal: sucursalId },
            data,
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
export async function listarSucursalesEmpresa(
    req: Request,
    res: Response
): Promise<Response> {
    const empresaId = Number(req.params.empresaId);

    const sucursales = await prisma.sucursal.findMany({
        where: { empresaId },
        include: {
            responsableSucursals: true,
            redSucursal: true,
        },
        orderBy: { nombre: "asc" },
    });

    return res.json(sucursales);
}

/* =====================================================
   GUARDAR / ACTUALIZAR WIFI DE UNA SUCURSAL
===================================================== */
export async function upsertRedSucursal(
    req: Request,
    res: Response
): Promise<Response> {
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

    return res.json({ ok: true, red });
}

/* =====================================================
   OBTENER WIFI DE UNA SUCURSAL
===================================================== */
export async function obtenerRedSucursal(
    req: Request,
    res: Response
): Promise<Response> {
    const sucursalId = Number(req.params.sucursalId);

    const red = await prisma.redSucursal.findUnique({
        where: { sucursalId },
    });

    return res.json(red);
}

/* =====================================================
   ELIMINAR SUCURSAL
===================================================== */
export async function eliminarSucursal(
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

        /* ===============================
           1️⃣ DESVINCULAR RELACIONES
        =============================== */

        await prisma.visita.updateMany({
            where: { sucursalId },
            data: { sucursalId: null },
        });

        await prisma.historial.updateMany({
            where: { sucursalId },
            data: { sucursalId: null },
        });

        await prisma.accesoRouterSucursal.deleteMany({
            where: { sucursalId },
        });

        await prisma.responsableSucursal.deleteMany({
            where: { sucursalId },
        });

        await prisma.redSucursal.deleteMany({
            where: { sucursalId },
        });

        /* ===============================
           2️⃣ ELIMINAR SUCURSAL
        =============================== */

        await prisma.sucursal.delete({
            where: { id_sucursal: sucursalId },
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error eliminando sucursal:", error);
        return res.status(500).json({
            message: "No se pudo eliminar la sucursal",
        });
    }
}
