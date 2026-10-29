import { prisma } from "../../lib/prisma.js";
import { clasificarCoordenadas, MENSAJE_COORDENADAS_INVALIDAS } from "../../utils/coordenadas.js";
function limpiarTextoRed(value) {
    if (value === null ||
        value === undefined) {
        return null;
    }
    const text = String(value)
        .trim();
    return text !== ""
        ? text
        : null;
}
/* =====================================================
   CREAR SUCURSAL
===================================================== */
export async function crearSucursal(req, res) {
    const empresaId = Number(req.params.empresaId);
    const { nombre, direccion, latitud, longitud, telefono, responsableSucursals, } = req.body;
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
                    ? responsableSucursals.map((r) => ({
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
            redSucursales: {
                orderBy: {
                    id: "asc",
                },
            },
        },
    });
    return res.json(sucursal);
}
/* =====================================================
   OBTENER UNA SUCURSAL (PARA EDITAR)
===================================================== */
export async function obtenerFichaSucursal(req, res) {
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
            redSucursales: {
                orderBy: {
                    id: "asc",
                },
            },
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
export async function actualizarFichaSucursal(req, res) {
    try {
        const sucursalId = Number(req.params.sucursalId);
        if (!sucursalId || Number.isNaN(sucursalId)) {
            return res.status(400).json({
                message: "sucursalId inválido",
            });
        }
        const { nombre, direccion, latitud, longitud, telefono, responsableSucursals, } = req.body;
        const clasificacion = clasificarCoordenadas(latitud, longitud);
        if (clasificacion === "INVALIDAS") {
            return res.status(400).json({ message: MENSAJE_COORDENADAS_INVALIDAS });
        }
        const data = {
            nombre,
            direccion,
            telefono,
            responsableSucursals: {
                deleteMany: {},
                create: Array.isArray(responsableSucursals)
                    ? responsableSucursals.map((r) => ({
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
        }
        else if (clasificacion === "VALIDAS") {
            data.latitud = latitud;
            data.longitud = longitud;
        }
        const sucursal = await prisma.sucursal.update({
            where: { id_sucursal: sucursalId },
            data,
            include: {
                responsableSucursals: true,
                redSucursales: {
                    orderBy: {
                        id: "asc",
                    },
                },
            },
        });
        return res.json({ ok: true, sucursal });
    }
    catch (error) {
        console.error("Error actualizando sucursal:", error);
        return res.status(500).json({
            message: "Error interno al actualizar sucursal",
        });
    }
}
/* =====================================================
   LISTAR SUCURSALES DE UNA EMPRESA
===================================================== */
export async function listarSucursalesEmpresa(req, res) {
    const empresaId = Number(req.params.empresaId);
    const sucursales = await prisma.sucursal.findMany({
        where: { empresaId },
        include: {
            responsableSucursals: true,
            redSucursales: {
                orderBy: {
                    id: "asc",
                },
            },
        },
        orderBy: { nombre: "asc" },
    });
    return res.json(sucursales);
}
/* =====================================================
   LISTAR REDES WIFI DE UNA SUCURSAL
===================================================== */
export async function obtenerRedesSucursal(req, res) {
    const sucursalId = Number(req.params.sucursalId);
    if (!Number.isInteger(sucursalId) ||
        sucursalId <= 0) {
        return res
            .status(400)
            .json({
            message: "sucursalId inválido",
        });
    }
    const sucursal = await prisma.sucursal.findUnique({
        where: {
            id_sucursal: sucursalId,
        },
        select: {
            id_sucursal: true,
        },
    });
    if (!sucursal) {
        return res
            .status(404)
            .json({
            message: "Sucursal no encontrada",
        });
    }
    const redes = await prisma.redSucursal.findMany({
        where: {
            sucursalId,
        },
        orderBy: {
            id: "asc",
        },
    });
    return res.json({
        ok: true,
        redes,
    });
}
/* =====================================================
   CREAR RED WIFI DE SUCURSAL
===================================================== */
export async function crearRedSucursal(req, res) {
    try {
        const sucursalId = Number(req.params.sucursalId);
        if (!Number.isInteger(sucursalId) ||
            sucursalId <= 0) {
            return res
                .status(400)
                .json({
                message: "sucursalId inválido",
            });
        }
        const sucursal = await prisma.sucursal.findUnique({
            where: {
                id_sucursal: sucursalId,
            },
            select: {
                id_sucursal: true,
            },
        });
        if (!sucursal) {
            return res
                .status(404)
                .json({
                message: "Sucursal no encontrada",
            });
        }
        const { wifiNombre, claveWifi, ipRed, gateway, observaciones, } = req.body;
        const red = await prisma.redSucursal.create({
            data: {
                sucursalId,
                wifiNombre: limpiarTextoRed(wifiNombre),
                claveWifi: limpiarTextoRed(claveWifi),
                ipRed: limpiarTextoRed(ipRed),
                gateway: limpiarTextoRed(gateway),
                observaciones: limpiarTextoRed(observaciones),
            },
        });
        return res
            .status(201)
            .json({
            ok: true,
            red,
        });
    }
    catch (error) {
        console.error("Error creando red de sucursal:", error);
        return res
            .status(500)
            .json({
            message: "No se pudo crear la red",
        });
    }
}
/* =====================================================
   ACTUALIZAR RED WIFI DE SUCURSAL
===================================================== */
export async function actualizarRedSucursal(req, res) {
    try {
        const sucursalId = Number(req.params.sucursalId);
        const redId = Number(req.params.redId);
        if (!Number.isInteger(sucursalId) ||
            sucursalId <= 0 ||
            !Number.isInteger(redId) ||
            redId <= 0) {
            return res
                .status(400)
                .json({
                message: "IDs inválidos",
            });
        }
        const existente = await prisma.redSucursal.findFirst({
            where: {
                id: redId,
                sucursalId,
            },
        });
        if (!existente) {
            return res
                .status(404)
                .json({
                message: "Red no encontrada",
            });
        }
        const { wifiNombre, claveWifi, ipRed, gateway, observaciones, } = req.body;
        const red = await prisma.redSucursal.update({
            where: {
                id: redId,
            },
            data: {
                wifiNombre: limpiarTextoRed(wifiNombre),
                claveWifi: limpiarTextoRed(claveWifi),
                ipRed: limpiarTextoRed(ipRed),
                gateway: limpiarTextoRed(gateway),
                observaciones: limpiarTextoRed(observaciones),
            },
        });
        return res.json({
            ok: true,
            red,
        });
    }
    catch (error) {
        console.error("Error actualizando red de sucursal:", error);
        return res
            .status(500)
            .json({
            message: "No se pudo actualizar la red",
        });
    }
}
/* =====================================================
   ELIMINAR RED WIFI DE SUCURSAL
===================================================== */
export async function eliminarRedSucursal(req, res) {
    try {
        const sucursalId = Number(req.params.sucursalId);
        const redId = Number(req.params.redId);
        if (!Number.isInteger(sucursalId) ||
            sucursalId <= 0 ||
            !Number.isInteger(redId) ||
            redId <= 0) {
            return res
                .status(400)
                .json({
                message: "IDs inválidos",
            });
        }
        const existente = await prisma.redSucursal.findFirst({
            where: {
                id: redId,
                sucursalId,
            },
            select: {
                id: true,
            },
        });
        if (!existente) {
            return res
                .status(404)
                .json({
                message: "Red no encontrada",
            });
        }
        await prisma.redSucursal.delete({
            where: {
                id: redId,
            },
        });
        return res.json({
            ok: true,
        });
    }
    catch (error) {
        console.error("Error eliminando red:", error);
        return res
            .status(500)
            .json({
            message: "No se pudo eliminar la red",
        });
    }
}
/* =====================================================
   ELIMINAR SUCURSAL
===================================================== */
export async function eliminarSucursal(req, res) {
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
    }
    catch (error) {
        console.error("Error eliminando sucursal:", error);
        return res.status(500).json({
            message: "No se pudo eliminar la sucursal",
        });
    }
}
//# sourceMappingURL=sucursal.controller.js.map