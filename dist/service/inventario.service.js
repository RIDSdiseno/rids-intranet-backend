// src/service/inventario.service.ts
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
export async function getInventarioByEmpresa(params) {
    const { empresaId, empresaNombre, createdFrom, createdTo, updatedFrom, updatedTo, } = params;
    const AND = [
        {
            deletedAt: null,
        },
    ];
    if (empresaId) {
        AND.push({
            OR: [
                {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
                {
                    empresaId,
                },
            ],
        });
    }
    if (empresaNombre) {
        AND.push({
            OR: [
                {
                    solicitante: {
                        is: {
                            empresa: {
                                nombre: empresaNombre,
                            },
                        },
                    },
                },
                {
                    empresa: {
                        is: {
                            nombre: empresaNombre,
                        },
                    },
                },
            ],
        });
    }
    if (createdFrom || createdTo) {
        AND.push({
            createdAt: {
                ...(createdFrom ? { gte: createdFrom } : {}),
                ...(createdTo ? { lte: createdTo } : {}),
            },
        });
    }
    if (updatedFrom || updatedTo) {
        AND.push({
            updatedAt: {
                ...(updatedFrom ? { gte: updatedFrom } : {}),
                ...(updatedTo ? { lte: updatedTo } : {}),
            },
        });
    }
    return prisma.equipo.findMany({
        where: {
            AND,
        },
        include: {
            empresa: {
                select: {
                    id_empresa: true,
                    nombre: true,
                },
            },
            solicitante: {
                select: {
                    nombre: true,
                    email: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                },
            },
            detalle: {
                select: {
                    macWifi: true,
                    so: true,
                    office: true,
                    teamViewer: true,
                    revisado: true,
                    usuarioEmpresa: true,
                    claveTv: true,
                    estadoAlm: true,
                    redEthernet: true,
                    adminRidsUsuario: true,
                    adminRidsPassword: true,
                    passwordEmpresa: true,
                    passwordPersonal: true,
                    usuarioPersonal: true,
                },
            },
        },
        orderBy: {
            id_equipo: "asc",
        },
    });
}
//# sourceMappingURL=inventario.service.js.map