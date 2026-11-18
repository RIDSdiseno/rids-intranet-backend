// src/middlewares/agenda-editores.ts
//
// Quién puede crear, editar y eliminar visitas de la agenda: los técnicos con
// Tecnico.puedeEditarAgenda = true y activos. Un CLIENTE nunca edita.
// Se consulta en cada request (no va en el token): un cambio por SQL rige al instante.
import type { Request, Response, NextFunction } from "express";

import { prismaBase } from "../lib/prisma.js";

type UsuarioRequest = Request["user"];

export async function usuarioPuedeEditarAgenda(user: UsuarioRequest): Promise<boolean> {
    if (!user || String(user.rol).toUpperCase() === "CLIENTE") {
        return false;
    }

    /* Solo lectura: cliente sin auditar */
    const tecnico = await prismaBase.tecnico.findUnique({
        where: { id_tecnico: user.id },
        select: { status: true, puedeEditarAgenda: true },
    });

    return Boolean(tecnico?.status && tecnico.puedeEditarAgenda);
}

export function requireAgendaEditor(req: Request, res: Response, next: NextFunction): void {
    usuarioPuedeEditarAgenda(req.user)
        .then((puede) => {
            if (!puede) {
                res.status(403).json({
                    error: "No tienes permisos para crear, editar o eliminar visitas de la agenda.",
                });
                return;
            }

            next();
        })
        .catch(next);
}

/** GET /agenda/permisos: el frontend muestra u oculta las acciones de edición. */
export async function getPermisosAgenda(req: Request, res: Response): Promise<void> {
    try {
        res.status(200).json({ puedeEditar: await usuarioPuedeEditarAgenda(req.user) });
    } catch (error) {
        console.error("Error al obtener permisos de agenda:", error);
        res.status(500).json({ error: "No se pudieron obtener los permisos de agenda" });
    }
}