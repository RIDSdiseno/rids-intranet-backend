// src/service/permisos/permissions.service.ts

import { prisma } from "../../lib/prisma.js";

export async function hasPermission(
    rol: string | null | undefined,
    permiso: string
): Promise<boolean> {
    if (!rol) return false;

    const normalizedRol = String(rol).trim().toUpperCase();

    if (normalizedRol === "ADMIN") {
        return true;
    }

    const permission = await prisma.rolePermission.findUnique({
        where: {
            rol_permiso: {
                rol: normalizedRol,
                permiso,
            },
        },
    });

    return permission?.permitido === true;
}