import { prisma } from "../../lib/prisma.js";
function limpiarTexto(value) {
    if (value === null || value === undefined)
        return null;
    const text = String(value).trim();
    if (!text)
        return null;
    if (text.toUpperCase() === "NO_DETECTADO")
        return null;
    if (text.toUpperCase() === "TO BE FILLED BY O.E.M.")
        return null;
    return text;
}
function normalizarMac(value) {
    const text = limpiarTexto(value);
    if (!text)
        return null;
    const limpio = text.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    if (limpio.length < 12)
        return null;
    return limpio.match(/.{1,2}/g)?.join("-") ?? null;
}
function fechaValida(value) {
    if (!value)
        return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return null;
    return date;
}
export async function registrarMantencionEquipo(req, res) {
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
        const agenteVersion = limpiarTexto(equipo.agenteVersion) ?? "Mant.General-RIDS";
        const fechaInicio = fechaValida(mantencion.fechaInicio);
        const fechaFin = fechaValida(mantencion.fechaFin);
        const tecnicoIdRaw = mantencion.tecnicoId;
        const tecnicoId = tecnicoIdRaw ? Number(tecnicoIdRaw) : null;
        let tecnicoResponsable = null;
        if (tecnicoId && Number.isFinite(tecnicoId)) {
            tecnicoResponsable = await prisma.tecnico.findFirst({
                where: {
                    id_tecnico: tecnicoId,
                    status: true,
                    rol: {
                        in: ["ADMIN", "ADMINISTRACION", "TECNICO"],
                    },
                },
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                    rol: true,
                    status: true,
                },
            });
            if (!tecnicoResponsable) {
                return res.status(400).json({
                    ok: false,
                    error: "El técnico responsable no existe, está inactivo o no tiene un rol permitido.",
                });
            }
        }
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
        let equipoEncontrado = null;
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
                message: "La mantención fue realizada, pero no se registró en la intranet porque no se encontró un equipo asociado.",
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
                tecnicoId: tecnicoResponsable?.id_tecnico ?? null,
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
    }
    catch (error) {
        console.error("registrarMantencionEquipo error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error al registrar mantención.",
        });
    }
}
export async function listarMantencionesPorEquipo(req, res) {
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
                tecnicoId: true,
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                        rol: true,
                        status: true,
                    },
                },
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
    }
    catch (error) {
        console.error("listarMantencionesPorEquipo error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error al listar mantenciones del equipo.",
        });
    }
}
export async function listarTecnicosParaMantencion(req, res) {
    try {
        /**
         * Este endpoint es consumido por RIDS-Mant.General.exe.
         *
         * No usa auth() de usuarios de la intranet porque el .exe no tiene sesión web.
         * En su lugar, valida el token técnico/agente enviado en Authorization.
         */
        const authHeader = req.headers.authorization || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const expectedToken = process.env.AGENT_TOKEN || process.env.RIDS_AGENT_TOKEN || "test123";
        if (!token || token !== expectedToken) {
            return res.status(401).json({
                ok: false,
                error: "Token no autorizado.",
            });
        }
        const tecnicos = await prisma.tecnico.findMany({
            where: {
                rol: {
                    in: ["ADMIN", "ADMINISTRACION", "TECNICO"],
                },
                status: true,
            },
            orderBy: {
                nombre: "asc",
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
            },
        });
        return res.json({
            ok: true,
            data: tecnicos,
        });
    }
    catch (error) {
        console.error("listarTecnicosParaMantencion error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error al listar técnicos para mantención.",
        });
    }
}
//# sourceMappingURL=equipo-mantencion.controller.js.map