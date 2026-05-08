// src/controllers/permisos-controller/role-permissions.controller.ts
import { prisma } from "../../lib/prisma.js";
import { PERMISSION_LABELS } from "../../constant/permissions.js";
const VALID_ROLES = ["ADMIN", "TECNICO", "CLIENTE", "VENTAS"];
export async function listRolePermissions(req, res) {
    try {
        const rol = req.query.rol
            ? String(req.query.rol).trim().toUpperCase()
            : undefined;
        const permisosDb = await prisma.rolePermission.findMany({
            ...(rol ? { where: { rol } } : {}),
            orderBy: [
                { rol: "asc" },
                { permiso: "asc" },
            ],
        });
        return res.json({
            ok: true,
            data: permisosDb,
            roles: VALID_ROLES,
            availablePermissions: Object.entries(PERMISSION_LABELS).map(([permiso, label]) => ({
                permiso,
                label,
            })),
        });
    }
    catch (error) {
        console.error("[rolePermissions] list error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error listando permisos",
        });
    }
}
export async function setRolePermissions(req, res) {
    try {
        const { rol, permisos } = req.body;
        const normalizedRol = String(rol ?? "").trim().toUpperCase();
        if (!VALID_ROLES.includes(normalizedRol)) {
            return res.status(400).json({
                ok: false,
                error: "Rol inválido",
            });
        }
        if (!Array.isArray(permisos)) {
            return res.status(400).json({
                ok: false,
                error: "permisos debe ser un arreglo",
            });
        }
        const validPermissionKeys = Object.keys(PERMISSION_LABELS);
        const cleanPermisos = permisos
            .map((p) => ({
            permiso: String(p.permiso ?? "").trim().toUpperCase(),
            permitido: Boolean(p.permitido),
        }))
            .filter((p) => validPermissionKeys.includes(p.permiso));
        await prisma.$transaction(async (tx) => {
            for (const p of cleanPermisos) {
                await tx.rolePermission.upsert({
                    where: {
                        rol_permiso: {
                            rol: normalizedRol,
                            permiso: p.permiso,
                        },
                    },
                    update: {
                        permitido: p.permitido,
                    },
                    create: {
                        rol: normalizedRol,
                        permiso: p.permiso,
                        permitido: p.permitido,
                    },
                });
            }
        });
        const updated = await prisma.rolePermission.findMany({
            where: { rol: normalizedRol },
            orderBy: { permiso: "asc" },
        });
        return res.json({
            ok: true,
            data: updated,
        });
    }
    catch (error) {
        console.error("[rolePermissions] set error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error guardando permisos",
        });
    }
}
//# sourceMappingURL=role-permissions.controller.js.map