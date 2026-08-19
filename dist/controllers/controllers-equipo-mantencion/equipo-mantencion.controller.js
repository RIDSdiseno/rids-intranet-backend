import { prisma } from "../../lib/prisma.js";
import { Prisma, } from "@prisma/client";
import XLSX from "xlsx-js-style";
function limpiarTexto(value) {
    if (value === null || value === undefined)
        return null;
    const text = String(value)
        // PostgreSQL no permite caracteres NUL en campos TEXT.
        .replace(/\u0000/g, "")
        .replace(/\x00/g, "")
        // Limpia caracteres de control raros, manteniendo saltos de línea y tabs.
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim();
    if (!text)
        return null;
    if (text.toUpperCase() === "NO_DETECTADO")
        return null;
    if (text.toUpperCase() === "TO BE FILLED BY O.E.M.")
        return null;
    return text;
}
function limpiarTextoLargo(value, maxCaracteres = 30000) {
    const text = limpiarTexto(value);
    if (!text)
        return null;
    if (text.length <= maxCaracteres)
        return text;
    return ("[TEXTO RECORTADO POR TAMAÑO]\n" +
        `Longitud original: ${text.length} caracteres\n\n` +
        text.slice(-maxCaracteres));
}
function limpiarArrayTexto(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => limpiarTexto(item))
        .filter((item) => Boolean(item));
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
function normalizarMacCompacta(value) {
    const text = limpiarTexto(value);
    if (!text)
        return null;
    const limpio = text.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    return limpio.length >= 12 ? limpio.slice(0, 12) : null;
}
async function buscarEquipoMantGeneral(params) {
    const serial = params.serial;
    const hostname = params.hostname;
    const macsCompactas = [
        normalizarMacCompacta(params.macAddress),
        normalizarMacCompacta(params.macEthernet),
        normalizarMacCompacta(params.macWifi),
    ].filter((mac) => Boolean(mac));
    const macsUnicas = Array.from(new Set(macsCompactas));
    const select = {
        id_equipo: true,
        empresaId: true,
        idSolicitante: true,
        serial: true,
        hostname: true,
        macAddress: true,
        mantGeneralInstalledAt: true,
    };
    if (serial) {
        const equipo = await prisma.equipo.findFirst({
            where: {
                deletedAt: null,
                serial: {
                    equals: serial,
                    mode: "insensitive",
                },
            },
            select,
        });
        if (equipo)
            return equipo;
    }
    if (hostname) {
        const equipo = await prisma.equipo.findFirst({
            where: {
                deletedAt: null,
                hostname: {
                    equals: hostname,
                    mode: "insensitive",
                },
            },
            select,
        });
        if (equipo)
            return equipo;
    }
    for (const macCompacta of macsUnicas) {
        const rows = await prisma.$queryRaw `
        SELECT
            "id_equipo",
            "empresaId",
            "idSolicitante",
            "serial",
            "hostname",
            "macAddress",
            "mantGeneralInstalledAt"
        FROM "Equipo"
        WHERE "deletedAt" IS NULL
          AND (
            (
              "macAddress" IS NOT NULL
              AND REGEXP_REPLACE(UPPER("macAddress"), '[^A-F0-9]', '', 'g') = ${macCompacta}
            )
            OR EXISTS (
              SELECT 1
              FROM "DetalleEquipo" d
              WHERE d."idEquipo" = "Equipo"."id_equipo"
                AND (
                  (
                    d."macWifi" IS NOT NULL
                    AND REGEXP_REPLACE(UPPER(d."macWifi"), '[^A-F0-9]', '', 'g') = ${macCompacta}
                  )
                  OR (
                    d."redEthernet" IS NOT NULL
                    AND REGEXP_REPLACE(UPPER(d."redEthernet"), '[^A-F0-9]', '', 'g') = ${macCompacta}
                  )
                )
            )
          )
        LIMIT 1
    `;
        if (rows[0])
            return rows[0];
    }
    return null;
}
function fechaValida(value) {
    if (!value)
        return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return null;
    return date;
}
function obtenerTokenMantGeneral(req) {
    const authHeader = req.headers.authorization || "";
    return authHeader.replace(/^Bearer\s+/i, "").trim();
}
function obtenerExpectedTokenMantGeneral() {
    return (process.env.AGENT_TOKEN ||
        process.env.RIDS_AGENT_TOKEN ||
        process.env.MANT_GENERAL_TOKEN ||
        "test123");
}
function validarTokenMantGeneral(req) {
    const token = obtenerTokenMantGeneral(req);
    const expectedToken = obtenerExpectedTokenMantGeneral();
    return Boolean(token && token === expectedToken);
}
export async function registrarMantencionEquipo(req, res) {
    try {
        if (!validarTokenMantGeneral(req)) {
            return res.status(401).json({
                ok: false,
                error: "Token no autorizado.",
            });
        }
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
        const macWifi = normalizarMac(equipo.macWifi);
        const macEthernet = normalizarMac(equipo.macEthernet);
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
        if (!serial && !hostname && !macAddress && !macEthernet && !macWifi) {
            return res.status(400).json({
                ok: false,
                error: "No se pudo identificar el equipo. Se requiere serial, hostname, macAddress, macEthernet o macWifi.",
            });
        }
        const equipoEncontrado = await buscarEquipoMantGeneral({
            serial,
            hostname,
            macAddress,
            macEthernet,
            macWifi,
        });
        if (!equipoEncontrado) {
            return res.status(202).json({
                ok: true,
                registrado: false,
                equipoEncontrado: false,
                vinculado: false,
                message: "La mantención fue realizada, pero no se registró en la intranet porque no se encontró un equipo asociado.",
                detalle: {
                    serial,
                    hostname,
                    macAddress,
                },
            });
        }
        const equipoVinculado = equipoEncontrado;
        const tareasRealizadas = limpiarArrayTexto(mantencion.tareasRealizadas);
        const tareasConError = limpiarArrayTexto(mantencion.tareasConError);
        const tipoMantencion = limpiarTexto(mantencion.tipo) ?? "Mantención general";
        const estadoMantencion = limpiarTexto(mantencion.estado) ?? "COMPLETADA";
        const duracionTexto = limpiarTexto(mantencion.duracionTexto);
        const resumen = limpiarTexto(mantencion.resumen);
        const reporteTexto = limpiarTextoLargo(mantencion.reporteTexto, 30000);
        const duracionSegundosRaw = Number(mantencion.duracionSegundos);
        const duracionSegundos = Number.isFinite(duracionSegundosRaw)
            ? Math.max(0, Math.round(duracionSegundosRaw))
            : null;
        const registro = await prisma.equipoMantencion.create({
            data: {
                equipoId: equipoVinculado.id_equipo,
                empresaId: equipoVinculado.empresaId ?? null,
                solicitanteId: equipoVinculado.idSolicitante ?? null,
                tecnicoId: tecnicoResponsable?.id_tecnico ?? null,
                tipo: tipoMantencion,
                estado: estadoMantencion,
                origen: "MANT_GENERAL_RIDS",
                fechaInicio,
                fechaFin,
                duracionSegundos,
                duracionTexto,
                tareasRealizadas,
                tareasConError,
                resumen,
                reporteTexto,
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
        await prisma.equipo.update({
            where: {
                id_equipo: equipoVinculado.id_equipo,
            },
            data: {
                mantGeneralInstalado: true,
                mantGeneralVersion: agenteVersion,
                mantGeneralLastSeenAt: new Date(),
                mantGeneralTecnicoId: tecnicoResponsable?.id_tecnico ?? null,
            },
        });
        return res.status(201).json({
            ok: true,
            registrado: true,
            equipoEncontrado: true,
            vinculado: true,
            message: "Mantención registrada correctamente.",
            equipoId: equipoVinculado.id_equipo,
            mantencionId: registro.id,
            detalle: {
                serial,
                hostname,
                macAddress,
            },
        });
    }
    catch (error) {
        console.error("❌ registrarMantencionEquipo error:", {
            message: error?.message,
            code: error?.code,
            meta: error?.meta,
            name: error?.name,
            clientVersion: error?.clientVersion,
            stack: error?.stack,
        });
        return res.status(500).json({
            ok: false,
            error: "Error al registrar mantención.",
            detail: process.env.NODE_ENV === "production"
                ? undefined
                : error?.message,
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
        if (!validarTokenMantGeneral(req)) {
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
export async function registrarInstalacionMantGeneral(req, res) {
    try {
        /**
         * Endpoint consumido por RIDS-Mant.General.exe.
         *
         * Registra que el equipo tiene Mant.General disponible/configurado.
         * No crea equipos nuevos: solo vincula si encuentra un equipo existente.
         */
        if (!validarTokenMantGeneral(req)) {
            return res.status(401).json({
                ok: false,
                error: "Token no autorizado.",
            });
        }
        const { equipo, instalacion } = req.body;
        if (!equipo) {
            return res.status(400).json({
                ok: false,
                error: "Payload inválido. Se requiere equipo.",
            });
        }
        const serial = limpiarTexto(equipo.serial);
        const hostname = limpiarTexto(equipo.hostname);
        const macAddress = normalizarMac(equipo.macAddress ?? equipo.mac);
        const macWifi = normalizarMac(equipo.macWifi);
        const macEthernet = normalizarMac(equipo.macEthernet);
        if (!serial && !hostname && !macAddress && !macEthernet && !macWifi) {
            return res.status(400).json({
                ok: false,
                error: "No se pudo identificar el equipo. Se requiere serial, hostname, macAddress, macEthernet o macWifi.",
            });
        }
        const equipoEncontrado = await buscarEquipoMantGeneral({
            serial,
            hostname,
            macAddress,
            macEthernet,
            macWifi,
        });
        if (!equipoEncontrado) {
            return res.status(202).json({
                ok: true,
                registrado: false,
                equipoEncontrado: false,
                message: "Mant.General fue abierto, pero no se registró en la intranet porque no se encontró un equipo asociado.",
                detalle: {
                    serial,
                    hostname,
                    macAddress,
                },
            });
        }
        const tecnicoIdRaw = instalacion?.tecnicoId;
        const tecnicoId = tecnicoIdRaw ? Number(tecnicoIdRaw) : null;
        const version = limpiarTexto(instalacion?.version);
        const configPath = limpiarTexto(instalacion?.configPath);
        const exePath = limpiarTexto(instalacion?.exePath);
        const installedAt = fechaValida(instalacion?.installedAt) ?? new Date();
        const equipoActualizado = await prisma.equipo.update({
            where: {
                id_equipo: equipoEncontrado.id_equipo,
            },
            data: {
                mantGeneralInstalado: true,
                mantGeneralVersion: version,
                mantGeneralLastSeenAt: new Date(),
                mantGeneralInstalledAt: equipoEncontrado.mantGeneralInstalledAt ?? installedAt,
                mantGeneralConfigPath: configPath,
                mantGeneralExePath: exePath,
                mantGeneralTecnicoId: tecnicoId && Number.isFinite(tecnicoId) ? tecnicoId : null,
            },
            select: {
                id_equipo: true,
                serial: true,
                hostname: true,
                mantGeneralInstalado: true,
                mantGeneralVersion: true,
                mantGeneralLastSeenAt: true,
                mantGeneralInstalledAt: true,
                mantGeneralTecnicoId: true,
            },
        });
        return res.json({
            ok: true,
            registrado: true,
            equipoEncontrado: true,
            message: "Instalación de Mant.General registrada correctamente.",
            equipo: equipoActualizado,
        });
    }
    catch (error) {
        console.error("registrarInstalacionMantGeneral error:", error);
        return res.status(500).json({
            ok: false,
            error: "Error al registrar instalación de Mant.General.",
        });
    }
}
/* =====================================================
   EXPORTAR MANTENCIONES GENERALES A EXCEL
===================================================== */
export async function exportarMantencionesGenerales(req, res) {
    try {
        const user = req.user;
        /* =====================================================
           FILTROS
        ===================================================== */
        const search = typeof req.query.search === "string"
            ? req.query.search.trim()
            : "";
        let empresaId;
        /*
         * CLIENTE:
         * siempre restringido a su propia empresa.
         */
        if (String(user?.rol ?? "")
            .toUpperCase()
            .trim() === "CLIENTE") {
            const empresaIdUsuario = Number(user?.empresaId);
            if (Number.isInteger(empresaIdUsuario) &&
                empresaIdUsuario > 0) {
                empresaId =
                    empresaIdUsuario;
            }
        }
        else if (req.query.empresaId) {
            const parsed = Number(req.query.empresaId);
            if (Number.isInteger(parsed) &&
                parsed > 0) {
                empresaId =
                    parsed;
            }
        }
        const mantencionDesde = typeof req.query.mantencionDesde ===
            "string" &&
            req.query.mantencionDesde
            ? new Date(`${req.query.mantencionDesde}T00:00:00`)
            : undefined;
        const mantencionHasta = typeof req.query.mantencionHasta ===
            "string" &&
            req.query.mantencionHasta
            ? new Date(`${req.query.mantencionHasta}T23:59:59.999`)
            : undefined;
        const mantGeneral = typeof req.query.mantGeneral ===
            "string"
            ? req.query.mantGeneral
                .toUpperCase()
                .trim()
            : "TODOS";
        const mantGeneralDesde = typeof req.query.mantGeneralDesde ===
            "string" &&
            req.query.mantGeneralDesde
            ? new Date(`${req.query.mantGeneralDesde}T00:00:00`)
            : undefined;
        const mantGeneralHasta = typeof req.query.mantGeneralHasta ===
            "string" &&
            req.query.mantGeneralHasta
            ? new Date(`${req.query.mantGeneralHasta}T23:59:59.999`)
            : undefined;
        /* =====================================================
           WHERE
        ===================================================== */
        const andConditions = [];
        /*
         * Solo equipos no eliminados.
         */
        andConditions.push({
            deletedAt: null,
        });
        /*
         * Empresa.
         */
        if (empresaId) {
            andConditions.push({
                empresaId,
            });
        }
        /*
         * Búsqueda general.
         */
        if (search) {
            andConditions.push({
                OR: [
                    {
                        serial: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        marca: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        modelo: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        hostname: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        empresa: {
                            nombre: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    },
                    {
                        solicitante: {
                            nombre: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    },
                ],
            });
        }
        /*
         * Estado Mant.General.
         *
         * En tu schema este campo es Boolean,
         * no Boolean?, por lo tanto no se consulta null.
         */
        if (mantGeneral ===
            "INSTALADO") {
            andConditions.push({
                mantGeneralInstalado: true,
            });
        }
        if (mantGeneral ===
            "NO_INSTALADO") {
            andConditions.push({
                mantGeneralInstalado: false,
            });
        }
        /*
         * Última apertura de Mant.General.
         */
        if (mantGeneralDesde ||
            mantGeneralHasta) {
            const filtroFecha = {};
            if (mantGeneralDesde) {
                filtroFecha.gte =
                    mantGeneralDesde;
            }
            if (mantGeneralHasta) {
                filtroFecha.lte =
                    mantGeneralHasta;
            }
            andConditions.push({
                mantGeneralLastSeenAt: filtroFecha,
            });
        }
        /*
         * Equipos con alguna mantención
         * dentro del rango seleccionado.
         *
         * IMPORTANTE:
         * la relación real se llama
         * equipoMantenciones.
         */
        if (mantencionDesde ||
            mantencionHasta) {
            const filtroFechaMantencion = {};
            if (mantencionDesde) {
                filtroFechaMantencion.gte =
                    mantencionDesde;
            }
            if (mantencionHasta) {
                filtroFechaMantencion.lte =
                    mantencionHasta;
            }
            andConditions.push({
                equipoMantenciones: {
                    some: {
                        fechaInicio: filtroFechaMantencion,
                    },
                },
            });
        }
        const where = {
            AND: andConditions,
        };
        /* =====================================================
           CONSULTA
        ===================================================== */
        const equipos = await prisma.equipo.findMany({
            where,
            orderBy: [
                {
                    empresa: {
                        nombre: "asc",
                    },
                },
                {
                    solicitante: {
                        nombre: "asc",
                    },
                },
                {
                    id_equipo: "asc",
                },
            ],
            select: {
                id_equipo: true,
                serial: true,
                marca: true,
                modelo: true,
                hostname: true,
                estado: true,
                mantGeneralInstalado: true,
                mantGeneralVersion: true,
                mantGeneralInstalledAt: true,
                mantGeneralLastSeenAt: true,
                empresa: {
                    select: {
                        nombre: true,
                    },
                },
                solicitante: {
                    select: {
                        nombre: true,
                        email: true,
                        rut: true,
                    },
                },
                /*
                 * Nombre real de la relación
                 * definido en schema.prisma.
                 */
                equipoMantenciones: {
                    where: mantencionDesde ||
                        mantencionHasta
                        ? {
                            fechaInicio: {
                                ...(mantencionDesde
                                    ? {
                                        gte: mantencionDesde,
                                    }
                                    : {}),
                                ...(mantencionHasta
                                    ? {
                                        lte: mantencionHasta,
                                    }
                                    : {}),
                            },
                        }
                        : {},
                    orderBy: {
                        fechaInicio: "desc",
                    },
                    select: {
                        id: true,
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
                        serial: true,
                        hostname: true,
                        agenteVersion: true,
                        tecnico: {
                            select: {
                                id_tecnico: true,
                                nombre: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        if (equipos.length ===
            0) {
            return res
                .status(404)
                .json({
                error: "No existen equipos o mantenciones para los filtros seleccionados.",
            });
        }
        /* =====================================================
           FILAS EXCEL
        ===================================================== */
        const rows = equipos.map((equipo) => {
            const ultimaMantencion = equipo
                .equipoMantenciones[0] ??
                null;
            return {
                "ID Equipo": equipo.id_equipo,
                Empresa: equipo.empresa
                    ?.nombre ??
                    "",
                Solicitante: equipo.solicitante
                    ?.nombre ??
                    "",
                Correo: equipo.solicitante
                    ?.email ??
                    "",
                RUT: equipo.solicitante
                    ?.rut ??
                    "",
                Serial: equipo.serial ??
                    "",
                Marca: equipo.marca ??
                    "",
                Modelo: equipo.modelo ??
                    "",
                Hostname: equipo.hostname ??
                    "",
                "Estado equipo": equipo.estado,
                "Mant.General": equipo.mantGeneralInstalado
                    ? "Instalado"
                    : "No instalado",
                "Versión Mant.General": equipo.mantGeneralVersion ??
                    "",
                "Instalado Mant.General": equipo.mantGeneralInstalledAt
                    ? equipo.mantGeneralInstalledAt.toLocaleString("es-CL", {
                        timeZone: "America/Santiago",
                    })
                    : "",
                "Última apertura Mant.General": equipo.mantGeneralLastSeenAt
                    ? equipo.mantGeneralLastSeenAt.toLocaleString("es-CL", {
                        timeZone: "America/Santiago",
                    })
                    : "",
                "Última mantención": ultimaMantencion
                    ?.fechaInicio
                    ? ultimaMantencion.fechaInicio.toLocaleString("es-CL", {
                        timeZone: "America/Santiago",
                    })
                    : "",
                "Tipo mantención": ultimaMantencion
                    ?.tipo ??
                    "",
                "Estado mantención": ultimaMantencion
                    ?.estado ??
                    "",
                "Duración": ultimaMantencion
                    ?.duracionTexto ??
                    "",
                Técnico: ultimaMantencion
                    ?.tecnico
                    ?.nombre ??
                    "",
                "Total mantenciones": equipo
                    .equipoMantenciones
                    .length,
            };
        });
        /* =====================================================
           GENERAR EXCEL
        ===================================================== */
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        /*
         * Anchos de columnas.
         */
        ws["!cols"] = [
            { wch: 10 },
            { wch: 26 },
            { wch: 26 },
            { wch: 30 },
            { wch: 16 },
            { wch: 22 },
            { wch: 18 },
            { wch: 22 },
            { wch: 22 },
            { wch: 18 },
            { wch: 18 },
            { wch: 22 },
            { wch: 26 },
            { wch: 30 },
            { wch: 24 },
            { wch: 22 },
            { wch: 22 },
            { wch: 18 },
            { wch: 24 },
            { wch: 18 },
        ];
        if (ws["!ref"]) {
            ws["!autofilter"] = {
                ref: ws["!ref"],
            };
        }
        /*
         * Estilo del encabezado.
         */
        const range = XLSX.utils.decode_range(ws["!ref"] ??
            "A1:A1");
        for (let col = range.s.c; col <=
            range.e.c; col++) {
            const address = XLSX.utils.encode_cell({
                r: 0,
                c: col,
            });
            if (ws[address]) {
                ws[address].s = {
                    font: {
                        bold: true,
                        color: {
                            rgb: "FFFFFF",
                        },
                    },
                    fill: {
                        fgColor: {
                            rgb: "0891B2",
                        },
                    },
                    alignment: {
                        vertical: "center",
                        horizontal: "center",
                    },
                };
            }
        }
        ws["!freeze"] = {
            xSplit: 0,
            ySplit: 1,
        };
        XLSX.utils.book_append_sheet(wb, ws, "Mantenciones");
        const buffer = XLSX.write(wb, {
            type: "buffer",
            bookType: "xlsx",
        });
        /* =====================================================
           NOMBRE ARCHIVO
        ===================================================== */
        const fecha = new Date()
            .toISOString()
            .slice(0, 10);
        const empresaNombre = empresaId
            ? equipos[0]
                ?.empresa
                ?.nombre
                ?.trim()
                .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_") ??
                String(empresaId)
            : "TODAS";
        const fileName = `Mantenciones_Generales_${empresaNombre}_${fecha}.xlsx`;
        /* =====================================================
           RESPONSE
        ===================================================== */
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
        return res.send(buffer);
    }
    catch (error) {
        console.error("exportarMantencionesGenerales error:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: "Error exportando mantenciones generales.",
        });
    }
}
//# sourceMappingURL=equipo-mantencion.controller.js.map