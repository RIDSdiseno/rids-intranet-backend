import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
/* =========================================================
   CONSTANTES
========================================================= */
const INVENTORY_EVENT_TYPES = [
    "INVENTORY_SYNC",
    "INVENTORY_CREATED",
    "REVISION_SOLICITANTE",
];
const CHILE_TIMEZONE = "America/Santiago";
const dashboardQuerySchema = z.object({
    year: z.coerce
        .number()
        .int()
        .min(2020)
        .max(2100)
        .optional(),
    month: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .optional(),
    empresaId: z.coerce
        .number()
        .int()
        .positive()
        .optional(),
    search: z.string()
        .trim()
        .max(200)
        .optional(),
    estadoAgente: z.enum([
        "TODOS",
        "ACTIVO",
        "SIN_CONEXION",
        "SIN_AGENTE",
    ]).default("TODOS"),
    estadoOneDrive: z.enum([
        "TODOS",
        "OPERATIVO",
        "NO_INSTALADO",
        "NO_EJECUTANDO",
        "SIN_USUARIO",
        "CON_ADVERTENCIAS",
        "SIN_INFORMACION",
    ]).default("TODOS"),
    saludOneDrive: z.enum([
        "TODOS",
        "ESTABLE",
        "INTERMITENTE",
        "CON_FALLAS",
        "NO_INSTALADO",
        "SIN_DATOS",
    ]).default("TODOS"),
    analizadoMes: z.enum([
        "TODOS",
        "ANALIZADO",
        "NO_ANALIZADO",
    ]).default("TODOS"),
});
/* =========================================================
   HELPERS GENERALES
========================================================= */
function boolOrNull(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true")
            return true;
        if (normalized === "false")
            return false;
    }
    return null;
}
function parseEventMetadata(metadata) {
    if (!metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)) {
        return {};
    }
    return metadata;
}
function getCurrentChileYearMonth() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: CHILE_TIMEZONE,
        year: "numeric",
        month: "2-digit",
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    return {
        year,
        month,
    };
}
function getChileMonthRange(year, month) {
    const nextYear = month === 12
        ? year + 1
        : year;
    const nextMonth = month === 12
        ? 1
        : month + 1;
    const monthText = String(month).padStart(2, "0");
    const nextMonthText = String(nextMonth).padStart(2, "0");
    /*
     * fromZonedTime interpreta la fecha como horario de Chile
     * y la convierte al instante UTC correcto.
     */
    const desde = fromZonedTime(`${year}-${monthText}-01T00:00:00`, CHILE_TIMEZONE);
    const hasta = fromZonedTime(`${nextYear}-${nextMonthText}-01T00:00:00`, CHILE_TIMEZONE);
    return {
        desde,
        hasta,
    };
}
function formatChileDateKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: CHILE_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}
/* =========================================================
   EMPRESAS ACTIVAS
========================================================= */
function buildEquipoEmpresaActivaWhere() {
    return {
        OR: [
            /*
             * Empresa asignada directamente al equipo.
             */
            {
                empresaId: {
                    not: null,
                },
                empresa: {
                    is: {
                        isActive: true,
                    },
                },
            },
            /*
             * Si no tiene empresa directa, se usa
             * la empresa del solicitante.
             */
            {
                empresaId: null,
                solicitante: {
                    is: {
                        empresa: {
                            is: {
                                isActive: true,
                            },
                        },
                    },
                },
            },
            /*
             * Equipos aún sin clasificar.
             */
            {
                empresaId: null,
                idSolicitante: null,
            },
        ],
    };
}
/* =========================================================
   ESTADO DEL AGENTE
========================================================= */
function calcularEstadoAgente(lastSeenAt, horasSinConexion) {
    if (!lastSeenAt) {
        return "SIN_AGENTE";
    }
    const diferenciaMs = Date.now() - lastSeenAt.getTime();
    const limiteMs = horasSinConexion * 60 * 60 * 1000;
    return diferenciaMs <= limiteMs
        ? "ACTIVO"
        : "SIN_CONEXION";
}
/* =========================================================
   ESTADO ACTUAL DE ONEDRIVE
========================================================= */
function calcularEstadoActualOneDrive(detalle) {
    if (!detalle) {
        return "SIN_INFORMACION";
    }
    if (detalle.oneDriveInstalado === false) {
        return "NO_INSTALADO";
    }
    if (detalle.oneDriveInstalado !== true) {
        return "SIN_INFORMACION";
    }
    if (detalle.oneDriveEnEjecucion === false) {
        return "NO_EJECUTANDO";
    }
    if (!detalle.oneDriveUsuario?.trim()) {
        return "SIN_USUARIO";
    }
    if (detalle.oneDriveOperativo === true) {
        return "OPERATIVO";
    }
    return "CON_ADVERTENCIAS";
}
/* =========================================================
   SALUD MENSUAL DE ONEDRIVE
========================================================= */
function calcularSaludMensualOneDrive(eventos) {
    const snapshots = eventos
        .map((evento) => {
        const metadata = parseEventMetadata(evento.metadata);
        const instalado = boolOrNull(metadata.oneDriveInstalado);
        const enEjecucion = boolOrNull(metadata.oneDriveEnEjecucion);
        const operativo = boolOrNull(metadata.oneDriveOperativo);
        const usuario = String(metadata.oneDriveUsuario ?? "").trim();
        const version = String(metadata.oneDriveVersion ?? "").trim();
        return {
            instalado,
            enEjecucion,
            operativo,
            usuario: usuario || null,
            version: version || null,
        };
    })
        .filter((snapshot) => snapshot.instalado !== null ||
        snapshot.enEjecucion !== null ||
        snapshot.operativo !== null);
    if (snapshots.length === 0) {
        return {
            estado: "SIN_DATOS",
            totalAnalisisConDatos: 0,
            analisisOperativos: 0,
            analisisConFalla: 0,
            porcentajeOperativo: 0,
            usuariosDetectados: [],
            versionesDetectadas: [],
        };
    }
    const todosNoInstalados = snapshots.every((snapshot) => snapshot.instalado === false);
    const usuariosDetectados = Array.from(new Set(snapshots
        .map((snapshot) => snapshot.usuario)
        .filter((value) => Boolean(value))));
    const versionesDetectadas = Array.from(new Set(snapshots
        .map((snapshot) => snapshot.version)
        .filter((value) => Boolean(value))));
    if (todosNoInstalados) {
        return {
            estado: "NO_INSTALADO",
            totalAnalisisConDatos: snapshots.length,
            analisisOperativos: 0,
            analisisConFalla: snapshots.length,
            porcentajeOperativo: 0,
            usuariosDetectados,
            versionesDetectadas,
        };
    }
    const analisisOperativos = snapshots.filter((snapshot) => snapshot.operativo === true).length;
    const analisisConFalla = snapshots.length - analisisOperativos;
    const porcentajeOperativo = Number(((analisisOperativos /
        snapshots.length) *
        100).toFixed(1));
    let estado;
    if (porcentajeOperativo === 100) {
        estado = "ESTABLE";
    }
    else if (porcentajeOperativo >= 70) {
        estado = "INTERMITENTE";
    }
    else {
        estado = "CON_FALLAS";
    }
    return {
        estado,
        totalAnalisisConDatos: snapshots.length,
        analisisOperativos,
        analisisConFalla,
        porcentajeOperativo,
        usuariosDetectados,
        versionesDetectadas,
    };
}
/* =========================================================
   ENDPOINT
   GET /api/equipos/agent/dashboard
========================================================= */
export async function getEquipoAgentDashboard(req, res) {
    try {
        const current = getCurrentChileYearMonth();
        const query = dashboardQuerySchema.parse({
            ...req.query,
            year: req.query.year ??
                current.year,
            month: req.query.month ??
                current.month,
        });
        const year = query.year ?? current.year;
        const month = query.month ?? current.month;
        const search = query.search?.trim() ?? "";
        const user = req.user;
        const isCliente = user?.rol === "CLIENTE";
        const empresaIdUsuario = user?.empresaId
            ? Number(user.empresaId)
            : null;
        const empresaIdFiltro = isCliente && empresaIdUsuario
            ? empresaIdUsuario
            : query.empresaId;
        /*
 * Se valida la variable para evitar que un valor inválido
 * deje todos los agentes en un estado incorrecto.
 */
        const horasSinConexionEnv = Number(process.env.AGENT_OFFLINE_AFTER_HOURS);
        const horasSinConexion = Number.isFinite(horasSinConexionEnv) &&
            horasSinConexionEnv > 0
            ? horasSinConexionEnv
            : 384;
        const versionRecomendada = process.env.AGENT_RECOMMENDED_VERSION?.trim() ??
            "8.0.0";
        const { desde, hasta } = getChileMonthRange(year, month);
        const andConditions = [
            {
                deletedAt: null,
            },
            buildEquipoEmpresaActivaWhere(),
        ];
        if (empresaIdFiltro) {
            andConditions.push({
                OR: [
                    {
                        empresaId: empresaIdFiltro,
                    },
                    {
                        empresaId: null,
                        solicitante: {
                            is: {
                                empresaId: empresaIdFiltro,
                            },
                        },
                    },
                ],
            });
        }
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
                        hostname: {
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
                        usuarioActual: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        agenteVersion: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        solicitante: {
                            is: {
                                nombre: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        solicitante: {
                            is: {
                                email: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        empresa: {
                            is: {
                                nombre: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        detalle: {
                            is: {
                                oneDriveUsuario: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        detalle: {
                            is: {
                                oneDriveVersion: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                ],
            });
        }
        const equipos = await prisma.equipo.findMany({
            where: {
                AND: andConditions,
            },
            select: {
                id_equipo: true,
                serial: true,
                marca: true,
                modelo: true,
                tipo: true,
                estado: true,
                hostname: true,
                usuarioActual: true,
                localIp: true,
                agenteActivo: true,
                estadoAgente: true,
                agenteVersion: true,
                lastSeenAt: true,
                lastBootAt: true,
                ramGb: true,
                diskTotalGb: true,
                diskFreeGb: true,
                empresaId: true,
                idSolicitante: true,
                requiereRevisionSolicitante: true,
                motivoRevisionSolicitante: true,
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
                        empresaId: true,
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
                        so: true,
                        antivirusNombre: true,
                        antivirusActivo: true,
                        firewallActivo: true,
                        bitlockerEstado: true,
                        windowsUpdate: true,
                        oneDrive: true,
                        oneDriveEstado: true,
                        oneDriveInstalado: true,
                        oneDriveEnEjecucion: true,
                        oneDriveOperativo: true,
                        oneDriveUsuario: true,
                        oneDriveVersion: true,
                        oneDriveDetalle: true,
                    },
                },
                agenteEventos: {
                    where: {
                        tipo: {
                            in: [
                                ...INVENTORY_EVENT_TYPES,
                            ],
                        },
                        createdAt: {
                            gte: desde,
                            lt: hasta,
                        },
                    },
                    select: {
                        id: true,
                        tipo: true,
                        mensaje: true,
                        metadata: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
            orderBy: [
                {
                    lastSeenAt: "desc",
                },
                {
                    id_equipo: "desc",
                },
            ],
        });
        const itemsBase = equipos.map((equipo) => {
            const empresaFinal = equipo.empresa ??
                equipo.solicitante?.empresa ??
                null;
            const estadoAgenteCalculado = calcularEstadoAgente(equipo.lastSeenAt, horasSinConexion);
            const estadoOneDriveCalculado = calcularEstadoActualOneDrive(equipo.detalle);
            const saludMensualOneDrive = calcularSaludMensualOneDrive(equipo.agenteEventos);
            const ultimoEventoMes = equipo.agenteEventos[0] ??
                null;
            const diasAnalizados = Array.from(new Set(equipo.agenteEventos.map((evento) => formatChileDateKey(evento.createdAt))));
            const versionDesactualizada = Boolean(versionRecomendada &&
                equipo.agenteVersion &&
                equipo.agenteVersion !==
                    versionRecomendada);
            const alertas = [];
            if (estadoAgenteCalculado ===
                "SIN_CONEXION") {
                alertas.push("El agente no reporta dentro del tiempo esperado.");
            }
            if (estadoAgenteCalculado ===
                "SIN_AGENTE") {
                alertas.push("El equipo no registra agente de inventario.");
            }
            if (versionDesactualizada) {
                alertas.push("La versión del agente no coincide con la recomendada.");
            }
            /*
* Solo se generan alertas cuando existe una condición
* concreta que requiere revisión.
*
* SIN_INFORMACION no se considera una falla:
* significa que el agente todavía no ha entregado datos.
*/
            if (estadoOneDriveCalculado ===
                "NO_EJECUTANDO") {
                alertas.push("OneDrive está instalado, pero no se encuentra en ejecución.");
            }
            if (estadoOneDriveCalculado ===
                "SIN_USUARIO") {
                alertas.push("OneDrive está instalado, pero no tiene un usuario detectado.");
            }
            if (estadoOneDriveCalculado ===
                "CON_ADVERTENCIAS") {
                alertas.push("OneDrive está instalado, pero reporta advertencias.");
            }
            if (estadoOneDriveCalculado ===
                "NO_INSTALADO") {
                alertas.push("OneDrive no se encuentra instalado en el equipo.");
            }
            /*
             * La salud mensual se evalúa de forma independiente
             * respecto del estado actual.
             */
            if (saludMensualOneDrive.estado ===
                "INTERMITENTE") {
                alertas.push(`OneDrive tuvo una operatividad intermitente durante el mes (${saludMensualOneDrive.porcentajeOperativo}%).`);
            }
            if (saludMensualOneDrive.estado ===
                "CON_FALLAS") {
                alertas.push(`OneDrive presentó fallas durante el mes (${saludMensualOneDrive.porcentajeOperativo}% operativo).`);
            }
            if (equipo.requiereRevisionSolicitante) {
                alertas.push("La clasificación del solicitante requiere revisión.");
            }
            return {
                idEquipo: equipo.id_equipo,
                serial: equipo.serial,
                marca: equipo.marca,
                modelo: equipo.modelo,
                tipo: equipo.tipo,
                estadoEquipo: equipo.estado,
                empresa: empresaFinal
                    ? {
                        id: empresaFinal.id_empresa,
                        nombre: empresaFinal.nombre,
                    }
                    : null,
                solicitante: equipo.solicitante
                    ? {
                        id: equipo.solicitante.id_solicitante,
                        nombre: equipo.solicitante.nombre,
                        email: equipo.solicitante.email,
                    }
                    : null,
                hardware: {
                    ramGb: equipo.ramGb,
                    diskTotalGb: equipo.diskTotalGb,
                    diskFreeGb: equipo.diskFreeGb,
                    sistemaOperativo: equipo.detalle?.so ??
                        null,
                },
                agente: {
                    instalado: Boolean(equipo.lastSeenAt),
                    estadoGuardado: equipo.estadoAgente,
                    estado: estadoAgenteCalculado,
                    version: equipo.agenteVersion,
                    versionRecomendada,
                    versionDesactualizada,
                    ultimaConexion: equipo.lastSeenAt,
                    ultimoArranque: equipo.lastBootAt,
                    hostname: equipo.hostname,
                    usuarioActual: equipo.usuarioActual,
                    localIp: equipo.localIp,
                },
                analisisMes: {
                    analizado: equipo.agenteEventos.length >
                        0,
                    cantidad: equipo.agenteEventos.length,
                    diasAnalizados: diasAnalizados.length,
                    ultimoAnalisis: ultimoEventoMes?.createdAt ??
                        null,
                    ultimoTipo: ultimoEventoMes?.tipo ??
                        null,
                },
                seguridad: {
                    antivirusNombre: equipo.detalle
                        ?.antivirusNombre ??
                        null,
                    antivirusActivo: equipo.detalle
                        ?.antivirusActivo ??
                        null,
                    firewallActivo: equipo.detalle
                        ?.firewallActivo ??
                        null,
                    cifradoEstado: equipo.detalle
                        ?.bitlockerEstado ??
                        null,
                    windowsUpdate: equipo.detalle
                        ?.windowsUpdate ??
                        null,
                },
                oneDrive: {
                    estado: estadoOneDriveCalculado,
                    resumen: equipo.detalle
                        ?.oneDrive ??
                        null,
                    estadoReportado: equipo.detalle
                        ?.oneDriveEstado ??
                        null,
                    instalado: equipo.detalle
                        ?.oneDriveInstalado ??
                        null,
                    enEjecucion: equipo.detalle
                        ?.oneDriveEnEjecucion ??
                        null,
                    operativo: equipo.detalle
                        ?.oneDriveOperativo ??
                        null,
                    usuario: equipo.detalle
                        ?.oneDriveUsuario ??
                        null,
                    version: equipo.detalle
                        ?.oneDriveVersion ??
                        null,
                    detalle: equipo.detalle
                        ?.oneDriveDetalle ??
                        null,
                    saludMes: saludMensualOneDrive,
                },
                clasificacion: {
                    requiereRevision: equipo.requiereRevisionSolicitante,
                    motivo: equipo.motivoRevisionSolicitante,
                },
                alertas,
            };
        });
        /* =========================================================
   COBERTURA POR EMPRESA
========================================================= */
        /*
         * Se calcula desde itemsBase antes de aplicar filtros como:
         *
         * - estadoAgente
         * - estadoOneDrive
         * - saludOneDrive
         * - analizadoMes
         *
         * De esta forma, seleccionar "Analizados este mes"
         * no provoca que todas las empresas aparezcan con 100%.
         *
         * Sí respeta:
         *
         * - permisos del usuario
         * - empresa seleccionada
         * - búsqueda
         * - período mensual
         */
        const coberturaEmpresaMap = new Map();
        for (const item of itemsBase) {
            const empresaId = item.empresa?.id ?? null;
            const nombre = item.empresa?.nombre ??
                "Sin empresa";
            /*
             * Se utiliza el ID como clave para evitar juntar
             * empresas diferentes que tengan nombres iguales.
             */
            const key = empresaId !== null
                ? String(empresaId)
                : "sin-empresa";
            const current = coberturaEmpresaMap.get(key) ?? {
                empresaId,
                nombre,
                total: 0,
                revisados: 0,
                pendientes: 0,
                analisis: 0,
                porcentaje: 0,
            };
            current.total += 1;
            current.analisis +=
                item.analisisMes.cantidad;
            if (item.analisisMes.analizado) {
                current.revisados += 1;
            }
            coberturaEmpresaMap.set(key, current);
        }
        const coberturaPorEmpresa = Array.from(coberturaEmpresaMap.values())
            .map((empresa) => {
            const pendientes = empresa.total -
                empresa.revisados;
            const porcentaje = empresa.total > 0
                ? Number(((empresa.revisados /
                    empresa.total) *
                    100).toFixed(1))
                : 0;
            return {
                ...empresa,
                pendientes,
                porcentaje,
            };
        })
            .sort((a, b) => 
        /*
         * Primero aparecen las empresas con más
         * equipos pendientes de revisión.
         */
        b.pendientes -
            a.pendientes ||
            /*
             * En caso de empate, se priorizan las
             * empresas con más equipos.
             */
            b.total -
                a.total ||
            /*
             * Finalmente se ordenan alfabéticamente.
             */
            a.nombre.localeCompare(b.nombre, "es"));
        const items = itemsBase.filter((item) => {
            if (query.estadoAgente !==
                "TODOS" &&
                item.agente.estado !==
                    query.estadoAgente) {
                return false;
            }
            if (query.estadoOneDrive !==
                "TODOS" &&
                item.oneDrive.estado !==
                    query.estadoOneDrive) {
                return false;
            }
            if (query.saludOneDrive !==
                "TODOS" &&
                item.oneDrive.saludMes.estado !==
                    query.saludOneDrive) {
                return false;
            }
            if (query.analizadoMes ===
                "ANALIZADO" &&
                !item.analisisMes.analizado) {
                return false;
            }
            if (query.analizadoMes ===
                "NO_ANALIZADO" &&
                item.analisisMes.analizado) {
                return false;
            }
            return true;
        });
        const resumen = {
            totalEquipos: items.length,
            equiposAnalizados: items.filter((item) => item.analisisMes.analizado).length,
            equiposNoAnalizados: items.filter((item) => !item.analisisMes.analizado).length,
            totalAnalisis: items.reduce((sum, item) => sum +
                item.analisisMes.cantidad, 0),
            agentesActivos: items.filter((item) => item.agente.estado ===
                "ACTIVO").length,
            agentesSinConexion: items.filter((item) => item.agente.estado ===
                "SIN_CONEXION").length,
            equiposSinAgente: items.filter((item) => item.agente.estado ===
                "SIN_AGENTE").length,
            agentesDesactualizados: items.filter((item) => item.agente
                .versionDesactualizada).length,
            pendientesClasificacion: items.filter((item) => item.clasificacion
                .requiereRevision).length,
            oneDriveOperativo: items.filter((item) => item.oneDrive.estado ===
                "OPERATIVO").length,
            oneDriveNoInstalado: items.filter((item) => item.oneDrive.estado ===
                "NO_INSTALADO").length,
            /*
            * Solo condiciones confirmadas que requieren revisión.
 * SIN_INFORMACION se contabiliza aparte.
 */
            oneDriveConAdvertencias: items.filter((item) => [
                "NO_EJECUTANDO",
                "SIN_USUARIO",
                "CON_ADVERTENCIAS",
            ].includes(item.oneDrive.estado)).length,
            /*
             * Equipos donde el agente todavía no ha entregado
             * información suficiente de OneDrive.
             */
            oneDriveSinInformacion: items.filter((item) => item.oneDrive.estado ===
                "SIN_INFORMACION").length,
            oneDriveEstableMes: items.filter((item) => item.oneDrive.saludMes
                .estado === "ESTABLE").length,
            oneDriveIntermitenteMes: items.filter((item) => item.oneDrive.saludMes
                .estado ===
                "INTERMITENTE").length,
            oneDriveConFallasMes: items.filter((item) => item.oneDrive.saludMes
                .estado ===
                "CON_FALLAS").length,
        };
        const porcentajeAnalizados = resumen.totalEquipos > 0
            ? Number(((resumen.equiposAnalizados /
                resumen.totalEquipos) *
                100).toFixed(1))
            : 0;
        const eventosPorDiaMap = new Map();
        /*
 * Índice en memoria para localizar equipos por ID
 * sin ejecutar Array.find en cada iteración.
 */
        const equiposById = new Map(equipos.map((equipo) => [
            equipo.id_equipo,
            equipo,
        ]));
        for (const item of items) {
            const equipoOriginal = equiposById.get(item.idEquipo);
            if (!equipoOriginal)
                continue;
            for (const evento of equipoOriginal.agenteEventos) {
                const fecha = formatChileDateKey(evento.createdAt);
                const currentDay = eventosPorDiaMap.get(fecha) ?? {
                    analisis: 0,
                    equipos: new Set(),
                    oneDriveOperativos: 0,
                    oneDriveConFalla: 0,
                };
                currentDay.analisis += 1;
                currentDay.equipos.add(item.idEquipo);
                const metadata = parseEventMetadata(evento.metadata);
                const oneDriveOperativo = boolOrNull(metadata.oneDriveOperativo);
                if (oneDriveOperativo === true) {
                    currentDay
                        .oneDriveOperativos += 1;
                }
                if (oneDriveOperativo === false) {
                    currentDay
                        .oneDriveConFalla += 1;
                }
                eventosPorDiaMap.set(fecha, currentDay);
            }
        }
        const actividadPorDia = Array.from(eventosPorDiaMap.entries())
            .map(([fecha, value]) => ({
            fecha,
            analisis: value.analisis,
            equiposAnalizados: value.equipos.size,
            oneDriveOperativos: value.oneDriveOperativos,
            oneDriveConFalla: value.oneDriveConFalla,
        }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha));
        const versionesAgenteMap = new Map();
        const versionesOneDriveMap = new Map();
        for (const item of items) {
            const agenteVersion = item.agente.version ??
                "Sin versión";
            versionesAgenteMap.set(agenteVersion, (versionesAgenteMap.get(agenteVersion) ?? 0) + 1);
            const oneDriveVersion = item.oneDrive.version ??
                "Sin versión";
            versionesOneDriveMap.set(oneDriveVersion, (versionesOneDriveMap.get(oneDriveVersion) ?? 0) + 1);
        }
        const versionesAgente = Array.from(versionesAgenteMap.entries())
            .map(([version, cantidad]) => ({
            version,
            cantidad,
        }))
            .sort((a, b) => b.cantidad -
            a.cantidad);
        const versionesOneDrive = Array.from(versionesOneDriveMap.entries())
            .map(([version, cantidad]) => ({
            version,
            cantidad,
        }))
            .sort((a, b) => b.cantidad -
            a.cantidad);
        return res.json({
            ok: true,
            periodo: {
                year,
                month,
                desde,
                hasta,
                timezone: CHILE_TIMEZONE,
            },
            configuracion: {
                horasSinConexion,
                versionAgenteRecomendada: versionRecomendada,
                criteriosOneDrive: {
                    requiereInstalado: true,
                    requiereEjecucion: true,
                    requiereUsuario: true,
                    requiereOperativo: true,
                },
                tiposEventosInventario: [
                    ...INVENTORY_EVENT_TYPES,
                ],
            },
            resumen: {
                ...resumen,
                porcentajeAnalizados,
            },
            graficos: {
                actividadPorDia,
                versionesAgente,
                versionesOneDrive,
                /*
                 * Cobertura calculada desde la base completa de equipos
                 * que cumplen permisos, búsqueda, empresa y período.
                 */
                coberturaPorEmpresa,
            },
            items,
        });
    }
    catch (error) {
        console.error("❌ Error obteniendo dashboard del agente:", error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                ok: false,
                error: "Parámetros inválidos",
                details: error.flatten(),
            });
        }
        return res.status(500).json({
            ok: false,
            error: "Error interno obteniendo dashboard del agente",
        });
    }
}
//# sourceMappingURL=equipo-agent-dashboard.controller.js.map