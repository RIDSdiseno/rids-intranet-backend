import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    prismaBase as prisma,
} from "../lib/prisma.js";

export async function mobileBitacoraUser(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const tecnicoId =
            Number(
                req.headers[
                "x-mobile-tecnico-id"
                ]
            );

        if (
            !Number.isInteger(
                tecnicoId
            ) ||
            tecnicoId <= 0
        ) {
            return res
                .status(401)
                .json({
                    error:
                        "Técnico móvil no identificado",
                });
        }

        const tecnico =
            await prisma.tecnico.findFirst({
                where: {
                    id_tecnico:
                        tecnicoId,

                    status:
                        true,
                },

                select: {
                    id_tecnico:
                        true,

                    nombre:
                        true,

                    email:
                        true,

                    rol:
                        true,
                },
            });

        if (!tecnico) {
            return res
                .status(401)
                .json({
                    error:
                        "El técnico móvil no existe o está inactivo",
                });
        }

        (
            req as Request & {
                user?: {
                    id: number;
                    id_tecnico: number;
                    tecnicoId: number;
                    nombre: string;
                    email: string;
                    rol: string;
                };
            }
        ).user = {
            id:
                tecnico.id_tecnico,

            id_tecnico:
                tecnico.id_tecnico,

            tecnicoId:
                tecnico.id_tecnico,

            nombre:
                tecnico.nombre,

            email:
                tecnico.email,

            rol:
                tecnico.rol,
        };

        next();
    } catch (error) {
        console.error(
            "[MOBILE BITACORA] Error identificando técnico:",
            error
        );

        return res
            .status(500)
            .json({
                error:
                    "No fue posible identificar al técnico",
            });
    }
}