// src/controllers/controllers-equipo-mantencion/equipo-mantencion.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

function limpiarTexto(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();

    if (!text) return null;
    if (text.toUpperCase() === "NO_DETECTADO") return null;
    if (text.toUpperCase() === "TO BE FILLED BY O.E.M.") return null;

    return text;
}

function normalizarMac(value: unknown): string | null {
    const text = limpiarTexto(value);

    if (!text) return null;

    const limpio = text.replace(/[^a-fA-F0-9]/g, "").toUpperCase();

    if (limpio.length < 12) return null;

    return limpio.match(/.{1,2}/g)?.join("-") ?? null;
}

function fechaValida(value: unknown): Date | null {
    if (!value) return null;

    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) return null;

    return date;
}

export async function registrarMantencionEquipo(req: Request, res: Response) {
    try {
        const { equipo, mantencion } = req.body;

        if (!equipo || !mantencion) {
            return res.status(400).json({
                ok: false,
                error: "Payload inválido. Se requiere equipo y mantencion.",
            });
        }

        const serial = limpiarTexto(equipo.serial);
        const hostname = limpiarTexto(equipo.hostname);
        const usuarioActual = limpiarTexto(equipo.usuarioActual);
        const localIp = limpiarTexto(equipo.localIp);
        const macAddress = normalizarMac(equipo.macAddress ?? equipo.mac);

        const marca = limpiarTexto(equipo.marca) ?? "No detectado";
        const modelo = limpiarTexto(equipo.modelo) ?? "No detectado";
        const agenteVersion =
            limpiarTexto(equipo.agenteVersion) ?? "Mant.General-RIDS";

        const fechaInicio = fechaValida(mantencion.fechaInicio);
        const fechaFin = fechaValida(mantencion.fechaFin);

        if (!fechaInicio) {
            return res.status(400).json({
                ok: false,
                error: "fechaInicio inválida.",
            });
        }

        if (!serial && !hostname && !macAddress) {
            return res.status(400).json({
                ok: false,
                error: "No se pudo identificar el equipo. Se requiere serial, hostname o macAddress.",
            });
        }

        type EquipoEncontrado = NonNullable<
            Awaited<ReturnType<typeof prisma.equipo.findFirst>>
        >;

        let equipoEncontrado: EquipoEncontrado | null = null;

        if (serial) {
            equipoEncontrado = await prisma.equipo.findFirst({
                where: {
                    deletedAt: null,
                    serial,
                },
            });
        }

        if (!equipoEncontrado && hostname) {
            equipoEncontrado = await prisma.equipo.findFirst({
                where: {
                    deletedAt: null,
                    hostname,
                },
            });
        }

        if (!equipoEncontrado && macAddress) {
            equipoEncontrado = await prisma.equipo.findFirst({
                where: {
                    deletedAt: null,
                    macAddress,
                },
            });
        }

        if (!equipoEncontrado) {
            return res.status(202).json({
                ok: true,
                registrado: false,
                equipoEncontrado: false,
                message:
                    "La mantención fue realizada, pero no se registró en la intranet porque no se encontró un equipo asociado.",
                detalle: {
                    serial,
                    hostname,
                    macAddress,
                },
            });
        }

        const tareasRealizadas = Array.isArray(mantencion.tareasRealizadas)
            ? mantencion.tareasRealizadas
            : [];

        const tareasConError = Array.isArray(mantencion.tareasConError)
            ? mantencion.tareasConError
            : [];

        const registro = await prisma.equipoMantencion.create({
            data: {
                equipoId: equipoEncontrado.id_equipo,
                empresaId: equipoEncontrado.empresaId ?? null,
                solicitanteId: equipoEncontrado.idSolicitante ?? null,

                tipo: String(mantencion.tipo || "Mantención general"),
                estado: String(mantencion.estado || "COMPLETADA"),
                origen: "MANT_GENERAL_RIDS",

                fechaInicio,
                fechaFin,
                duracionSegundos: mantencion.duracionSegundos ?? null,
                duracionTexto: mantencion.duracionTexto ?? null,

                tareasRealizadas,
                tareasConError,
                resumen: mantencion.resumen ?? null,
                reporteTexto: mantencion.reporteTexto ?? null,

                serial,
                hostname,
                usuarioActual,
                localIp,
                macAddress,
                marca,
                modelo,
                agenteVersion,
            },
        });

        return res.status(201).json({
            ok: true,
            registrado: true,
            equipoEncontrado: true,
            message: "Mantención registrada correctamente.",
            equipoId: equipoEncontrado.id_equipo,
            mantencionId: registro.id,
        });
    } catch (error) {
        console.error("registrarMantencionEquipo error:", error);

        return res.status(500).json({
            ok: false,
            error: "Error al registrar mantención.",
        });
    }
}

export async function listarMantencionesPorEquipo(req: Request, res: Response) {
    try {
        const equipoId = Number(req.params.id);

        if (!equipoId || Number.isNaN(equipoId)) {
            return res.status(400).json({
                ok: false,
                error: "ID de equipo inválido.",
            });
        }

        const mantenciones = await prisma.equipoMantencion.findMany({
            where: {
                equipoId,
            },
            orderBy: {
                fechaInicio: "desc",
            },
            take: 50,
            select: {
                id: true,
                equipoId: true,
                tipo: true,
                estado: true,
                origen: true,
                fechaInicio: true,
                fechaFin: true,
                duracionSegundos: true,
                duracionTexto: true,
                tareasRealizadas: true,
                tareasConError: true,
                resumen: true,
                reporteTexto: true,
                serial: true,
                hostname: true,
                usuarioActual: true,
                localIp: true,
                macAddress: true,
                marca: true,
                modelo: true,
                agenteVersion: true,
                createdAt: true,
            },
        });

        return res.json({
            ok: true,
            data: mantenciones,
        });
    } catch (error) {
        console.error("listarMantencionesPorEquipo error:", error);

        return res.status(500).json({
            ok: false,
            error: "Error al listar mantenciones del equipo.",
        });
    }
}