// src/controllers/bitacora-tecnico.controller.ts
import type { Request, Response } from "express";
import {
    Prisma,
    TipoBitacoraTecnico,
    EstadoBitacoraTecnico,
} from "@prisma/client";
import { prismaBase as prisma } from "../lib/prisma.js";

function parsePositiveInt(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

function normalizeText(value?: string | null): string {
    return (value ?? "").trim().replace(/\s+/g, " ");
}

function parseFecha(value: unknown): Date | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;

    const clean = value.trim();

    // Si viene solo YYYY-MM-DD, guardar al mediodía UTC para evitar desfase visual en Chile.
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const date = new Date(`${clean}T12:00:00.000Z`);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    const date = new Date(clean);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildDateRange(fecha?: string): Prisma.DateTimeFilter<"BitacoraTecnico"> | null {
    if (!fecha) return null;

    // Forzar UTC explícito para que coincida con cómo Prisma guarda las fechas
    const desde = new Date(`${fecha}T00:00:00.000Z`);
    const hasta = new Date(`${fecha}T23:59:59.999Z`);

    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        return null;
    }

    return {
        gte: desde,
        lte: hasta,
    };
}

function normalizeTipoActividad(value: unknown): TipoBitacoraTecnico {
    if (
        typeof value === "string" &&
        Object.values(TipoBitacoraTecnico).includes(value as TipoBitacoraTecnico)
    ) {
        return value as TipoBitacoraTecnico;
    }

    return TipoBitacoraTecnico.OTRO;
}

function normalizeEstado(value: unknown): EstadoBitacoraTecnico {
    if (
        typeof value === "string" &&
        Object.values(EstadoBitacoraTecnico).includes(value as EstadoBitacoraTecnico)
    ) {
        return value as EstadoBitacoraTecnico;
    }

    return EstadoBitacoraTecnico.REGISTRADA;
}

export async function crearBitacoraTecnico(req: Request, res: Response) {
    try {
        const {
            fecha,
            titulo,
            descripcion,
            tipoActividad,
            tecnicoId,
            empresaId,
            solicitanteId,
            ticketId,
            trabajoId,
            visitaId,
            mantencionId,
            equipoId,
            cotizacionId,
        } = req.body;

        const descripcionNormalizada = normalizeText(descripcion);

        if (!descripcionNormalizada) {
            return res.status(400).json({
                error: "La descripción es obligatoria",
            });
        }

        const tecnicoIdFinal = parsePositiveInt(tecnicoId);

        if (!tecnicoIdFinal) {
            return res.status(400).json({
                error: "El técnico es obligatorio",
            });
        }

        const createData: Prisma.BitacoraTecnicoUncheckedCreateInput = {
            fecha: parseFecha(fecha) ?? new Date(),
            titulo: normalizeText(titulo) || null,
            descripcion: descripcionNormalizada,
            tipoActividad: normalizeTipoActividad(tipoActividad),
            estado: EstadoBitacoraTecnico.REGISTRADA,

            tecnicoId: tecnicoIdFinal,
            empresaId: parsePositiveInt(empresaId) ?? null,
            solicitanteId: parsePositiveInt(solicitanteId) ?? null,
            ticketId: parsePositiveInt(ticketId) ?? null,
            trabajoId: parsePositiveInt(trabajoId) ?? null,
            visitaId: parsePositiveInt(visitaId) ?? null,
            mantencionId: parsePositiveInt(mantencionId) ?? null,
            equipoId: parsePositiveInt(equipoId) ?? null,
            cotizacionId: parsePositiveInt(cotizacionId) ?? null,
        };

        const bitacora = await prisma.bitacoraTecnico.create({
            data: createData,
            include: {
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                        rol: true,
                    },
                },
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                    },
                },
                ticket: {
                    select: {
                        id: true,
                        publicId: true,
                        subject: true,
                        status: true,
                    },
                },
                trabajo: {
                    select: {
                        id: true,
                        numeroOrden: true,
                        tipoTrabajo: true,
                        estado: true,
                        area: true,
                        destinoEquipo: true,
                    },
                },
                visita: {
                    select: {
                        id_visita: true,
                        inicio: true,
                        fin: true,
                        status: true,
                    },
                },
                mantencion: {
                    select: {
                        id_mantencion: true,
                        inicio: true,
                        fin: true,
                        status: true,
                    },
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                        tipo: true,
                    },
                },
                cotizacion: {
                    select: {
                        id: true,
                        fecha: true,
                        estado: true,
                        total: true,
                    },
                },
            },
        });

        return res.status(201).json({ data: bitacora });
    } catch (error) {
        console.error("❌ Error al crear bitácora técnica:", error);
        return res.status(500).json({
            error: "Error al crear bitácora técnica",
        });
    }
}

export async function obtenerBitacorasTecnico(req: Request, res: Response) {
    try {
        const {
            fecha,
            desde,
            hasta,
            tecnicoId,
            empresaId,
            solicitanteId,
            ticketId,
            trabajoId,
            visitaId,
            mantencionId,
            equipoId,
            cotizacionId,
            tipoActividad,
            estado,
            search,
        } = req.query;

        const where: Prisma.BitacoraTecnicoWhereInput = {};

        const tecnicoIdNum = parsePositiveInt(tecnicoId);
        const empresaIdNum = parsePositiveInt(empresaId);
        const solicitanteIdNum = parsePositiveInt(solicitanteId);
        const ticketIdNum = parsePositiveInt(ticketId);
        const trabajoIdNum = parsePositiveInt(trabajoId);
        const visitaIdNum = parsePositiveInt(visitaId);
        const mantencionIdNum = parsePositiveInt(mantencionId);
        const equipoIdNum = parsePositiveInt(equipoId);
        const cotizacionIdNum = parsePositiveInt(cotizacionId);

        if (tecnicoIdNum) where.tecnicoId = tecnicoIdNum;
        if (empresaIdNum) where.empresaId = empresaIdNum;
        if (solicitanteIdNum) where.solicitanteId = solicitanteIdNum;
        if (ticketIdNum) where.ticketId = ticketIdNum;
        if (trabajoIdNum) where.trabajoId = trabajoIdNum;
        if (visitaIdNum) where.visitaId = visitaIdNum;
        if (mantencionIdNum) where.mantencionId = mantencionIdNum;
        if (equipoIdNum) where.equipoId = equipoIdNum;
        if (cotizacionIdNum) where.cotizacionId = cotizacionIdNum;

        if (
            typeof tipoActividad === "string" &&
            Object.values(TipoBitacoraTecnico).includes(tipoActividad as TipoBitacoraTecnico)
        ) {
            where.tipoActividad = tipoActividad as TipoBitacoraTecnico;
        }

        if (
            typeof estado === "string" &&
            Object.values(EstadoBitacoraTecnico).includes(estado as EstadoBitacoraTecnico)
        ) {
            where.estado = estado as EstadoBitacoraTecnico;
        }

        if (typeof fecha === "string" && fecha.trim()) {
            const rangoFecha = buildDateRange(fecha);

            if (rangoFecha) {
                where.fecha = rangoFecha;
            }
        } else {
            const fechaFiltro: Prisma.DateTimeFilter<"BitacoraTecnico"> = {};

            if (typeof desde === "string" && desde.trim()) {
                const desdeDate = new Date(`${desde}T00:00:00.000Z`);

                if (!Number.isNaN(desdeDate.getTime())) {
                    fechaFiltro.gte = desdeDate;
                }
            }

            if (typeof hasta === "string" && hasta.trim()) {
                const hastaDate = new Date(`${hasta}T23:59:59.999Z`);

                if (!Number.isNaN(hastaDate.getTime())) {
                    fechaFiltro.lte = hastaDate;
                }
            }

            if (Object.keys(fechaFiltro).length > 0) {
                where.fecha = fechaFiltro;
            }
        }

        if (typeof search === "string" && search.trim()) {
            const q = search.trim();

            where.OR = [
                {
                    titulo: {
                        contains: q,
                        mode: "insensitive",
                    },
                },
                {
                    descripcion: {
                        contains: q,
                        mode: "insensitive",
                    },
                },
                {
                    tecnico: {
                        nombre: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    empresa: {
                        nombre: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    solicitante: {
                        nombre: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    ticket: {
                        subject: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    trabajo: {
                        numeroOrden: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    equipo: {
                        serial: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    equipo: {
                        marca: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    equipo: {
                        modelo: {
                            contains: q,
                            mode: "insensitive",
                        },
                    },
                },
            ];
        }

        const bitacoras = await prisma.bitacoraTecnico.findMany({
            where,
            orderBy: [
                { fecha: "desc" },
                { createdAt: "desc" },
            ],
            include: {
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                        rol: true,
                    },
                },
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                    },
                },
                ticket: {
                    select: {
                        id: true,
                        publicId: true,
                        subject: true,
                        status: true,
                    },
                },
                trabajo: {
                    select: {
                        id: true,
                        numeroOrden: true,
                        tipoTrabajo: true,
                        estado: true,
                    },
                },
                visita: {
                    select: {
                        id_visita: true,
                        inicio: true,
                        fin: true,
                        status: true,
                    },
                },
                mantencion: {
                    select: {
                        id_mantencion: true,
                        inicio: true,
                        fin: true,
                        status: true,
                    },
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                        tipo: true,
                    },
                },
                cotizacion: {
                    select: {
                        id: true,
                        fecha: true,
                        estado: true,
                        total: true,
                    },
                },
            },
        });

        return res.json({ data: bitacoras });
    } catch (error) {
        console.error("❌ Error al obtener bitácoras técnicas:", error);
        return res.status(500).json({
            error: "Error al obtener bitácoras técnicas",
        });
    }
}

export async function obtenerBitacoraTecnicoPorId(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        const bitacora = await prisma.bitacoraTecnico.findUnique({
            where: { id },
            include: {
                tecnico: true,
                empresa: true,
                solicitante: true,
                ticket: true,
                trabajo: true,
                visita: true,
                mantencion: true,
                equipo: true,
                cotizacion: true,
            },
        });

        if (!bitacora) {
            return res.status(404).json({
                error: "Bitácora no encontrada",
            });
        }

        return res.json({ data: bitacora });
    } catch (error) {
        console.error("❌ Error al obtener bitácora técnica:", error);
        return res.status(500).json({
            error: "Error al obtener bitácora técnica",
        });
    }
}

export async function actualizarBitacoraTecnico(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        const {
            fecha,
            titulo,
            descripcion,
            tipoActividad,
            estado,
            tecnicoId,
            empresaId,
            solicitanteId,
            ticketId,
            trabajoId,
            visitaId,
            mantencionId,
            equipoId,
            cotizacionId,
        } = req.body;

        const descripcionNormalizada = normalizeText(descripcion);

        if (!descripcionNormalizada) {
            return res.status(400).json({
                error: "La descripción es obligatoria",
            });
        }

        const tecnicoIdFinal = parsePositiveInt(tecnicoId);

        if (!tecnicoIdFinal) {
            return res.status(400).json({
                error: "El técnico es obligatorio",
            });
        }

        const updateData: Prisma.BitacoraTecnicoUncheckedUpdateInput = {
            titulo: normalizeText(titulo) || null,
            descripcion: descripcionNormalizada,
            tipoActividad: normalizeTipoActividad(tipoActividad),
            estado: normalizeEstado(estado),

            tecnicoId: tecnicoIdFinal,
            empresaId: parsePositiveInt(empresaId) ?? null,
            solicitanteId: parsePositiveInt(solicitanteId) ?? null,
            ticketId: parsePositiveInt(ticketId) ?? null,
            trabajoId: parsePositiveInt(trabajoId) ?? null,
            visitaId: parsePositiveInt(visitaId) ?? null,
            mantencionId: parsePositiveInt(mantencionId) ?? null,
            equipoId: parsePositiveInt(equipoId) ?? null,
            cotizacionId: parsePositiveInt(cotizacionId) ?? null,
        };

        const fechaParsed = parseFecha(fecha);

        if (fechaParsed) {
            updateData.fecha = fechaParsed;
        }

        const bitacora = await prisma.bitacoraTecnico.update({
            where: { id },
            data: updateData,
            include: {
                tecnico: true,
                empresa: true,
                solicitante: true,
                ticket: true,
                trabajo: true,
                visita: true,
                mantencion: true,
                equipo: true,
                cotizacion: true,
            },
        });

        return res.json({ data: bitacora });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({
                error: "Bitácora no encontrada",
            });
        }

        console.error("❌ Error al actualizar bitácora técnica:", error);
        return res.status(500).json({
            error: "Error al actualizar bitácora técnica",
        });
    }
}

export async function eliminarBitacoraTecnico(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "ID inválido",
            });
        }

        await prisma.bitacoraTecnico.delete({
            where: { id },
        });

        return res.json({
            message: "Bitácora eliminada correctamente",
        });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({
                error: "Bitácora no encontrada",
            });
        }

        console.error("❌ Error al eliminar bitácora técnica:", error);
        return res.status(500).json({
            error: "Error al eliminar bitácora técnica",
        });
    }
}

export async function obtenerOpcionesRelacionBitacora(req: Request, res: Response) {
    try {
        const empresaId = Number(req.query.empresaId);
        const tipo = String(req.query.tipo ?? "");

        if (!Number.isInteger(empresaId) || empresaId <= 0) {
            return res.status(400).json({
                error: "empresaId inválido",
            });
        }

        if (!tipo) {
            return res.status(400).json({
                error: "El tipo de relación es obligatorio",
            });
        }

        switch (tipo) {
            case "solicitantes": {
                const solicitantes = await prisma.solicitante.findMany({
                    where: {
                        empresaId,
                        isActive: true,
                        deletedAt: null,
                    },
                    orderBy: {
                        nombre: "asc",
                    },
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                        telefono: true,
                    },
                });

                return res.json({ data: solicitantes });
            }

            case "tickets": {
                const tickets = await prisma.ticket.findMany({
                    where: {
                        empresaId,
                        deletedAt: null,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 100,
                    select: {
                        id: true,
                        publicId: true,
                        subject: true,
                        status: true,
                        priority: true,
                        createdAt: true,
                    },
                });

                return res.json({ data: tickets });
            }

            case "trabajos": {
                const trabajos = await prisma.detalleTrabajoGestioo.findMany({
                    where: {
                        OR: [
                            {
                                entidad: {
                                    empresaId,
                                },
                            },
                            {
                                equipo: {
                                    empresaId,
                                },
                            },
                        ],
                    },
                    orderBy: {
                        fecha: "desc",
                    },
                    take: 100,
                    select: {
                        id: true,
                        numeroOrden: true,
                        tipoTrabajo: true,
                        descripcion: true,
                        estado: true,
                        fecha: true,

                        area: true,
                        destinoEquipo: true,

                        equipo: {
                            select: {
                                id_equipo: true,
                                serial: true,
                                marca: true,
                                modelo: true,
                            },
                        },
                        entidad: {
                            select: {
                                id: true,
                                nombre: true,
                            },
                        },
                    },
                });

                return res.json({ data: trabajos });
            }

            case "visitas": {
                const visitas = await prisma.visita.findMany({
                    where: {
                        empresaId,
                    },
                    orderBy: {
                        inicio: "desc",
                    },
                    take: 100,
                    select: {
                        id_visita: true,
                        inicio: true,
                        fin: true,
                        status: true,
                        solicitante: true,
                        direccion_visita: true,
                        tecnico: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                            },
                        },
                    },
                });

                return res.json({ data: visitas });
            }

            case "mantenciones": {
                const mantenciones = await prisma.mantencionRemota.findMany({
                    where: {
                        empresaId,
                    },
                    orderBy: {
                        inicio: "desc",
                    },
                    take: 100,
                    select: {
                        id_mantencion: true,
                        inicio: true,
                        fin: true,
                        status: true,
                        solicitante: true,
                        deviceNombre: true,
                        tecnico: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                            },
                        },
                    },
                });

                return res.json({ data: mantenciones });
            }

            case "equipos": {
                const equipos = await prisma.equipo.findMany({
                    where: {
                        deletedAt: null,
                        OR: [
                            {
                                empresaId,
                            },
                            {
                                solicitante: {
                                    is: {
                                        empresaId,
                                    },
                                },
                            },
                        ],
                    },
                    orderBy: [
                        { marca: "asc" },
                        { modelo: "asc" },
                        { serial: "asc" },
                    ],
                    take: 200,
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                        tipo: true,
                        estado: true,
                        empresaId: true,
                        idSolicitante: true,
                        solicitante: {
                            select: {
                                id_solicitante: true,
                                nombre: true,
                                empresaId: true,
                            },
                        },
                        empresa: {
                            select: {
                                id_empresa: true,
                                nombre: true,
                            },
                        },
                    },
                });

                return res.json({ data: equipos });
            }

            case "cotizaciones": {
                const cotizaciones = await prisma.cotizacionGestioo.findMany({
                    where: {
                        entidad: {
                            empresaId,
                        },
                    },
                    orderBy: {
                        fecha: "desc",
                    },
                    take: 100,
                    select: {
                        id: true,
                        fecha: true,
                        estado: true,
                        total: true,
                        entidad: {
                            select: {
                                id: true,
                                nombre: true,
                            },
                        },
                    },
                });

                return res.json({ data: cotizaciones });
            }

            default:
                return res.status(400).json({
                    error: "Tipo de relación no soportado",
                });
        }
    } catch (error) {
        console.error("❌ Error al obtener opciones de relación:", error);

        return res.status(500).json({
            error: "Error al obtener opciones de relación",
        });
    }
}
