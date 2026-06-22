import { prisma } from "../../lib/prisma.js";
/* =========================
   HELPERS
========================= */
function cleanString(value) {
    if (value === null || value === undefined)
        return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}
function numberOrNull(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function dateOrNull(value) {
    if (!value || typeof value !== "string")
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}
function formatFechaRevisionChileISO() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}
function boolOrNull(value) {
    if (typeof value === "boolean")
        return value;
    return null;
}
function boolFromUnknown(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string")
        return value.toLowerCase() === "true";
    return false;
}
function validateAgentApiKey(req) {
    const expected = process.env.WINDOWS_AGENT_API_KEY?.trim();
    const received = req.header("x-agent-api-key")?.trim();
    return Boolean(expected && received && expected === received);
}
function buildRamText(ramGb) {
    if (ramGb === null)
        return null;
    return `${ramGb} GB`;
}
function buildDiskText(totalGb, freeGb) {
    if (totalGb === null && freeGb === null)
        return null;
    if (totalGb !== null && freeGb !== null) {
        return `${totalGb} GB total / ${freeGb} GB libres`;
    }
    if (totalGb !== null)
        return `${totalGb} GB total`;
    return `${freeGb} GB libres`;
}
function buildSoText(osName, osVersion, osBuild) {
    const parts = [
        osName,
        osVersion ? `v${osVersion}` : null,
        osBuild ? `build ${osBuild}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" - ") : null;
}
function getEmailDomain(email) {
    const clean = cleanString(email)?.toLowerCase();
    if (!clean || !clean.includes("@"))
        return null;
    return clean.split("@")[1]?.trim() || null;
}
/* =========================
   RESOLUCIÓN AUTOMÁTICA
========================= */
async function resolveEmpresaFromAgent(body) {
    const empresaId = numberOrNull(body.empresaId);
    if (empresaId) {
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
        });
        if (empresa)
            return empresa;
    }
    const dominioBody = cleanString(body.dominioEmpresa)?.toLowerCase();
    const dominioEmail = getEmailDomain(body.solicitanteEmail);
    const dominio = dominioBody || dominioEmail;
    if (dominio) {
        const empresa = await prisma.empresa.findFirst({
            where: {
                dominios: {
                    has: dominio,
                },
            },
        });
        if (empresa)
            return empresa;
    }
    const empresaNombre = cleanString(body.empresaNombre);
    if (empresaNombre) {
        const empresa = await prisma.empresa.findFirst({
            where: {
                nombre: {
                    contains: empresaNombre,
                    mode: "insensitive",
                },
            },
        });
        if (empresa)
            return empresa;
    }
    return null;
}
async function resolveSolicitanteFromAgent(body, empresaId) {
    const solicitanteId = numberOrNull(body.solicitanteId);
    if (solicitanteId) {
        const solicitante = await prisma.solicitante.findFirst({
            where: {
                id_solicitante: solicitanteId,
                deletedAt: null,
            },
        });
        if (solicitante)
            return solicitante;
    }
    const email = cleanString(body.solicitanteEmail)?.toLowerCase();
    if (!email)
        return null;
    if (empresaId) {
        const solicitanteEmpresa = await prisma.solicitante.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: "insensitive",
                },
                empresaId,
                deletedAt: null,
            },
        });
        if (solicitanteEmpresa)
            return solicitanteEmpresa;
    }
    const solicitanteGlobal = await prisma.solicitante.findFirst({
        where: {
            email: {
                equals: email,
                mode: "insensitive",
            },
            deletedAt: null,
        },
    });
    return solicitanteGlobal;
}
/* =========================
   SOFTWARE
========================= */
async function syncSoftwares(equipoId, softwares) {
    if (!softwares || !Array.isArray(softwares))
        return;
    const cleaned = softwares
        .map((s) => ({
        equipoId,
        nombre: cleanString(s.nombre),
        version: cleanString(s.version) ?? "",
        publisher: cleanString(s.publisher),
        installDate: dateOrNull(s.installDate),
    }))
        .filter((s) => Boolean(s.nombre));
    if (cleaned.length === 0)
        return;
    const unique = Array.from(new Map(cleaned.map((s) => [
        `${s.nombre.toLowerCase()}|${s.version.toLowerCase()}`,
        s,
    ])).values());
    await prisma.equipoSoftware.deleteMany({
        where: { equipoId },
    });
    await prisma.equipoSoftware.createMany({
        data: unique,
        skipDuplicates: true,
    });
}
/* =========================
   POST /api/equipos/agent/inventory
========================= */
export async function receiveEquipoAgentInventory(req, res) {
    try {
        if (!validateAgentApiKey(req)) {
            res.status(401).json({
                ok: false,
                error: "No autorizado",
            });
            return;
        }
        const body = req.body;
        const source = cleanString(body.source) ?? "AGENT";
        const isAgentSync = source === "AGENT";
        const tecnicoInstaladorEmail = cleanString(body.tecnicoInstaladorEmail)?.toLowerCase() ??
            cleanString(body.tecnicoEmail)?.toLowerCase() ??
            null;
        const usuarioWindowsEjecutor = cleanString(body.usuarioWindowsEjecutor);
        const taskUserConfigurado = cleanString(body.taskUserConfigurado);
        const tecnicoInstalador = tecnicoInstaladorEmail
            ? await prisma.tecnico.findFirst({
                where: {
                    email: {
                        equals: tecnicoInstaladorEmail,
                        mode: "insensitive",
                    },
                    status: true,
                },
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            })
            : null;
        const serial = cleanString(body.serial);
        const hostname = cleanString(body.hostname);
        const solicitanteEmail = cleanString(body.solicitanteEmail)?.toLowerCase() ?? null;
        const solicitanteEmailFuente = cleanString(body.solicitanteEmailFuente) ?? null;
        const conflictoCorreos = boolFromUnknown(body.conflictoCorreos);
        const emailsDetectados = Array.isArray(body.emailsDetectados)
            ? body.emailsDetectados
                .map((item) => ({
                email: cleanString(item.email)?.toLowerCase() ?? null,
                source: cleanString(item.source) ?? null,
                dominio: getEmailDomain(item.email),
            }))
                .filter((item) => Boolean(item.email))
            : [];
        const dominioEmpresa = cleanString(body.dominioEmpresa)?.toLowerCase() ??
            getEmailDomain(solicitanteEmail);
        if (!serial && !hostname) {
            res.status(400).json({
                ok: false,
                error: "Debe venir serial o hostname",
            });
            return;
        }
        const empresaDetectada = await resolveEmpresaFromAgent({
            ...body,
            solicitanteEmail,
            dominioEmpresa,
        });
        const solicitanteDetectado = await resolveSolicitanteFromAgent({
            ...body,
            solicitanteEmail,
        }, empresaDetectada?.id_empresa ?? null);
        const marca = cleanString(body.marca) ?? "Sin marca";
        const modelo = cleanString(body.modelo) ?? "Sin modelo";
        const ramGb = numberOrNull(body.ramGb);
        const diskTotalGb = numberOrNull(body.diskTotalGb);
        const diskFreeGb = numberOrNull(body.diskFreeGb);
        const osName = cleanString(body.osName);
        const osVersion = cleanString(body.osVersion);
        const osBuild = cleanString(body.osBuild);
        let equipo = null;
        if (serial) {
            equipo = await prisma.equipo.findUnique({
                where: { serial },
                include: {
                    solicitante: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
                            email: true,
                            empresaId: true,
                            deletedAt: true,
                            isActive: true,
                        },
                    },
                },
            });
        }
        if (!equipo && hostname && empresaDetectada?.id_empresa) {
            equipo = await prisma.equipo.findFirst({
                where: {
                    hostname,
                    empresaId: empresaDetectada.id_empresa,
                    deletedAt: null,
                },
                include: {
                    solicitante: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
                            email: true,
                            empresaId: true,
                            deletedAt: true,
                            isActive: true,
                        },
                    },
                },
            });
        }
        const empresaIdFinal = equipo?.empresaId ??
            solicitanteDetectado?.empresaId ??
            empresaDetectada?.id_empresa ??
            equipo?.solicitante?.empresaId ??
            null;
        const solicitanteActualId = equipo?.idSolicitante ?? null;
        const solicitanteActual = equipo?.solicitante ?? null;
        const solicitanteActualValido = Boolean(solicitanteActualId &&
            solicitanteActual &&
            solicitanteActual.deletedAt === null &&
            solicitanteActual.isActive !== false &&
            (!empresaIdFinal || solicitanteActual.empresaId === empresaIdFinal));
        const solicitanteDetectadoId = solicitanteDetectado?.id_solicitante ?? null;
        const solicitanteDetectadoEmailFinal = solicitanteEmail ?? equipo?.solicitanteDetectadoEmail ?? null;
        const solicitanteDetectadoIdFinal = solicitanteDetectadoId ?? equipo?.solicitanteDetectadoId ?? null;
        const fuenteConfiableParaAsignar = !conflictoCorreos ||
            solicitanteEmailFuente === "OutlookProfile" ||
            solicitanteEmailFuente === "OfficeIdentity" ||
            solicitanteEmailFuente === "UPN";
        const solicitanteDetectadoValido = Boolean(solicitanteDetectadoId &&
            solicitanteDetectado &&
            solicitanteDetectado.deletedAt === null &&
            solicitanteDetectado.isActive !== false &&
            (!empresaIdFinal || solicitanteDetectado.empresaId === empresaIdFinal) &&
            fuenteConfiableParaAsignar);
        let idSolicitanteFinal = null;
        let requiereRevisionSolicitante = false;
        let motivoRevisionSolicitante = null;
        if (solicitanteDetectadoValido && solicitanteDetectadoId) {
            idSolicitanteFinal = solicitanteDetectadoId;
            if (solicitanteActualId &&
                solicitanteActualId !== solicitanteDetectadoId) {
                motivoRevisionSolicitante =
                    "El agente actualizó automáticamente el solicitante porque detectó un email real distinto al asignado.";
            }
        }
        else if (conflictoCorreos && solicitanteDetectadoId) {
            idSolicitanteFinal = solicitanteActualValido
                ? solicitanteActualId
                : null;
            requiereRevisionSolicitante = true;
            motivoRevisionSolicitante =
                "El agente detectó correos o dominios distintos entre las fuentes del equipo. Se requiere revisión manual antes de cambiar el solicitante.";
        }
        else if (solicitanteActualValido) {
            idSolicitanteFinal = solicitanteActualId;
        }
        else {
            idSolicitanteFinal = null;
            requiereRevisionSolicitante = true;
            if (solicitanteActualId) {
                motivoRevisionSolicitante =
                    "El solicitante asignado no pertenece a la empresa detectada o no es válido, y el agente no detectó un email real.";
            }
            else {
                motivoRevisionSolicitante =
                    "El agente no detectó un email real para asignar solicitante.";
            }
        }
        const equipoUpdateData = {
            lastSeenAt: new Date(),
            agenteActivo: true,
            estadoAgente: "ACTIVO",
            deletedAt: null,
            requiereRevisionSolicitante,
            solicitanteDetectadoEmail: solicitanteDetectadoEmailFinal,
            solicitanteDetectadoId: solicitanteDetectadoIdFinal,
            motivoRevisionSolicitante,
        };
        if (serial)
            equipoUpdateData.serial = serial;
        if (hostname)
            equipoUpdateData.hostname = hostname;
        if (marca)
            equipoUpdateData.marca = marca;
        if (modelo)
            equipoUpdateData.modelo = modelo;
        const procesador = cleanString(body.procesador);
        if (procesador)
            equipoUpdateData.procesador = procesador;
        const ramResumen = cleanString(body.ramResumen);
        const ramText = ramResumen ?? buildRamText(ramGb);
        if (ramText)
            equipoUpdateData.ram = ramText;
        if (ramGb !== null)
            equipoUpdateData.ramGb = ramGb;
        const diskText = buildDiskText(diskTotalGb, diskFreeGb);
        if (diskText)
            equipoUpdateData.disco = diskText;
        if (diskTotalGb !== null)
            equipoUpdateData.diskTotalGb = diskTotalGb;
        if (diskFreeGb !== null)
            equipoUpdateData.diskFreeGb = diskFreeGb;
        const usuarioActual = cleanString(body.usuarioActual);
        if (usuarioActual)
            equipoUpdateData.usuarioActual = usuarioActual;
        const dominio = cleanString(body.dominio);
        if (dominio)
            equipoUpdateData.dominio = dominio;
        const localIp = cleanString(body.localIp);
        if (localIp)
            equipoUpdateData.localIp = localIp;
        const publicIp = cleanString(body.publicIp);
        if (publicIp)
            equipoUpdateData.publicIp = publicIp;
        const macAddress = cleanString(body.macAddress);
        if (macAddress)
            equipoUpdateData.macAddress = macAddress;
        const hasMacWifiField = Object.prototype.hasOwnProperty.call(body, "macWifi");
        const hasMacEthernetField = Object.prototype.hasOwnProperty.call(body, "macEthernet");
        const macWifi = cleanString(body.macWifi);
        const macEthernet = cleanString(body.macEthernet);
        const lastBootAt = dateOrNull(body.lastBootAt);
        if (lastBootAt)
            equipoUpdateData.lastBootAt = lastBootAt;
        const uptimeText = cleanString(body.uptimeText);
        const uptimeSeconds = numberOrNull(body.uptimeSeconds);
        const agenteVersion = cleanString(body.agenteVersion);
        if (agenteVersion)
            equipoUpdateData.agenteVersion = agenteVersion;
        if (empresaIdFinal) {
            equipoUpdateData.empresaId = empresaIdFinal;
        }
        if (idSolicitanteFinal) {
            equipoUpdateData.idSolicitante = idSolicitanteFinal;
        }
        else if (solicitanteActualId && !solicitanteActualValido) {
            equipoUpdateData.idSolicitante = null;
        }
        if (equipo) {
            equipo = await prisma.equipo.update({
                where: {
                    id_equipo: equipo.id_equipo,
                },
                data: equipoUpdateData,
            });
        }
        else {
            const serialForCreate = serial ??
                (hostname
                    ? `AGENT-${hostname}-${empresaIdFinal ?? "SIN-EMPRESA"}`
                    : `AGENT-${Date.now()}`);
            equipo = await prisma.equipo.create({
                data: {
                    ...equipoUpdateData,
                    serial: serialForCreate,
                    marca,
                    modelo,
                    tipo: "GENERICO",
                    propiedad: "Empresa",
                },
            });
        }
        const soTexto = buildSoText(osName, osVersion, osBuild);
        const fechaRevisionAgente = formatFechaRevisionChileISO();
        await prisma.detalleEquipo.upsert({
            where: {
                idEquipo: equipo.id_equipo,
            },
            update: {
                ...(soTexto ? { so: soTexto } : {}),
                ...(hasMacWifiField
                    ? { macWifi: macWifi ?? null }
                    : {}),
                ...(hasMacEthernetField
                    ? { redEthernet: macEthernet ?? null }
                    : {}),
                antivirusNombre: cleanString(body.antivirusNombre),
                antivirusActivo: boolOrNull(body.antivirusActivo),
                firewallActivo: boolOrNull(body.firewallActivo),
                bitlockerEstado: cleanString(body.bitlockerEstado),
                windowsUpdate: cleanString(body.windowsUpdate),
                revisado: fechaRevisionAgente,
                ...(cleanString(body.tipoDd)
                    ? { tipoDd: cleanString(body.tipoDd) }
                    : {}),
                ...(cleanString(body.estadoAlm)
                    ? { estadoAlm: cleanString(body.estadoAlm) }
                    : {}),
                ...(cleanString(body.office)
                    ? { office: cleanString(body.office) }
                    : {}),
                ...(cleanString(body.teamViewer)
                    ? { teamViewer: cleanString(body.teamViewer) }
                    : {}),
            },
            create: {
                idEquipo: equipo.id_equipo,
                so: soTexto,
                // IMPORTANTE:
                // macWifi va al campo MAC WiFi.
                // macEthernet va al campo redEthernet, que en el front se muestra como MAC Ethernet.
                // localIp NO se guarda aquí.
                macWifi: macWifi ?? null,
                redEthernet: macEthernet ?? null,
                revisado: fechaRevisionAgente,
                antivirusNombre: cleanString(body.antivirusNombre),
                antivirusActivo: boolOrNull(body.antivirusActivo),
                firewallActivo: boolOrNull(body.firewallActivo),
                bitlockerEstado: cleanString(body.bitlockerEstado),
                windowsUpdate: cleanString(body.windowsUpdate),
                tipoDd: cleanString(body.tipoDd),
                estadoAlm: cleanString(body.estadoAlm),
                office: cleanString(body.office),
                teamViewer: cleanString(body.teamViewer),
            },
        });
        await prisma.auditLog.create({
            data: {
                entity: "Equipo",
                entityId: String(equipo.id_equipo),
                action: "UPDATE",
                // Importante:
                // Las sincronizaciones automáticas del agente NO deben quedar a nombre del técnico.
                // El técnico solo queda como instalador/configurador dentro de changes/metadata.
                actorId: null,
                empresaId: empresaIdFinal ?? null,
                description: "Inventario actualizado automáticamente desde agente Windows",
                changes: {
                    origen: "WINDOWS_AGENT",
                    source,
                    ejecutadoPor: "SISTEMA",
                    tecnicoInstaladorId: tecnicoInstalador?.id_tecnico ?? null,
                    tecnicoInstaladorEmail: tecnicoInstalador?.email ?? tecnicoInstaladorEmail,
                    tecnicoInstaladorNombre: tecnicoInstalador?.nombre ?? null,
                    usuarioWindowsEjecutor,
                    taskUserConfigurado,
                    hostname,
                    serial,
                    lastSeenAt: new Date().toISOString(),
                },
            },
        });
        await syncSoftwares(equipo.id_equipo, body.softwares);
        await prisma.equipoAgenteEvento.create({
            data: {
                equipoId: equipo.id_equipo,
                tipo: requiereRevisionSolicitante
                    ? "REVISION_SOLICITANTE"
                    : "INVENTORY_SYNC",
                mensaje: requiereRevisionSolicitante
                    ? "El agente detectó información de solicitante que requiere revisión manual."
                    : "Inventario sincronizado automáticamente desde agente Windows",
                metadata: {
                    hostname,
                    serial,
                    lastBootAt: body.lastBootAt ?? null,
                    uptimeText,
                    uptimeSeconds,
                    source,
                    ejecutadoPor: "SISTEMA",
                    tecnicoInstaladorId: tecnicoInstalador?.id_tecnico ?? null,
                    tecnicoInstaladorNombre: tecnicoInstalador?.nombre ?? null,
                    tecnicoInstaladorEmail: tecnicoInstalador?.email ?? tecnicoInstaladorEmail,
                    usuarioWindowsEjecutor,
                    taskUserConfigurado,
                    solicitanteEmail: solicitanteDetectadoEmailFinal,
                    solicitanteEmailFuente,
                    conflictoCorreos,
                    emailsDetectados,
                    dominioEmpresa,
                    empresaDetectadaId: empresaDetectada?.id_empresa ?? null,
                    empresaDetectadaNombre: empresaDetectada?.nombre ?? null,
                    solicitanteActualId,
                    solicitanteActualValido,
                    fuenteConfiableParaAsignar,
                    solicitanteDetectadoId: solicitanteDetectadoIdFinal,
                    solicitanteDetectadoEmail: solicitanteDetectadoEmailFinal,
                    solicitanteDetectadoNombre: solicitanteDetectado?.nombre ?? null,
                    empresaIdFinal,
                    solicitanteIdFinal: idSolicitanteFinal,
                    macAddress,
                    macWifi,
                    macEthernet,
                    localIp,
                    requiereRevisionSolicitante,
                    motivoRevisionSolicitante,
                    clasificado: Boolean(empresaIdFinal && idSolicitanteFinal),
                    requiereClasificacion: !empresaIdFinal ||
                        !idSolicitanteFinal ||
                        requiereRevisionSolicitante,
                    agenteVersion,
                },
            },
        });
        res.json({
            ok: true,
            message: "Inventario actualizado correctamente",
            equipoId: equipo.id_equipo,
            empresaId: empresaIdFinal,
            solicitanteId: idSolicitanteFinal,
            solicitanteActualId,
            solicitanteDetectadoId: solicitanteDetectadoIdFinal,
            solicitanteDetectadoEmail: solicitanteDetectadoEmailFinal,
            solicitanteEmailFuente,
            conflictoCorreos,
            emailsDetectados,
            macAddress,
            macWifi,
            macEthernet,
            localIp,
            lastBootAt: body.lastBootAt ?? null,
            uptimeText,
            uptimeSeconds,
            requiereRevisionSolicitante,
            motivoRevisionSolicitante,
            clasificado: Boolean(empresaIdFinal && idSolicitanteFinal),
            requiereClasificacion: !empresaIdFinal || !idSolicitanteFinal || requiereRevisionSolicitante,
        });
    }
    catch (error) {
        console.error("❌ Error recibiendo inventario del agente:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno recibiendo inventario del agente",
        });
    }
}
/* =========================
   GET /api/equipos/agent
========================= */
export async function listEquiposAgent(req, res) {
    try {
        const search = String(req.query.search ?? "").trim();
        const empresaIdQuery = Number(req.query.empresaId || 0);
        const estadoAgente = String(req.query.estadoAgente ?? "").trim();
        const soloConAgente = String(req.query.soloConAgente ?? "false") === "true";
        const pendienteClasificacion = String(req.query.pendienteClasificacion ?? "false") === "true";
        const user = req.user;
        const isCliente = user?.rol === "CLIENTE";
        const empresaIdFromUser = user?.empresaId ? Number(user.empresaId) : null;
        const empresaId = isCliente && empresaIdFromUser
            ? empresaIdFromUser
            : empresaIdQuery || undefined;
        const andFilters = [{ deletedAt: null }];
        if (empresaId) {
            andFilters.push({
                OR: [
                    { empresaId },
                    {
                        solicitante: {
                            is: {
                                empresaId,
                            },
                        },
                    },
                ],
            });
        }
        if (soloConAgente) {
            andFilters.push({
                lastSeenAt: {
                    not: null,
                },
            });
        }
        if (pendienteClasificacion) {
            andFilters.push({
                lastSeenAt: {
                    not: null,
                },
            });
            andFilters.push({
                OR: [
                    { empresaId: null },
                    { idSolicitante: null },
                    { requiereRevisionSolicitante: true },
                ],
            });
        }
        if (estadoAgente) {
            andFilters.push({
                estadoAgente: estadoAgente,
            });
        }
        if (search) {
            andFilters.push({
                OR: [
                    { hostname: { contains: search, mode: "insensitive" } },
                    { serial: { contains: search, mode: "insensitive" } },
                    { marca: { contains: search, mode: "insensitive" } },
                    { modelo: { contains: search, mode: "insensitive" } },
                    { usuarioActual: { contains: search, mode: "insensitive" } },
                    { localIp: { contains: search, mode: "insensitive" } },
                    { macAddress: { contains: search, mode: "insensitive" } },
                    {
                        solicitanteDetectadoEmail: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        detalle: {
                            is: {
                                teamViewer: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        solicitante: {
                            is: {
                                nombre: { contains: search, mode: "insensitive" },
                            },
                        },
                    },
                    {
                        solicitante: {
                            is: {
                                email: { contains: search, mode: "insensitive" },
                            },
                        },
                    },
                    {
                        empresa: {
                            is: {
                                nombre: { contains: search, mode: "insensitive" },
                            },
                        },
                    },
                ],
            });
        }
        const equipos = await prisma.equipo.findMany({
            where: {
                AND: andFilters,
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        razonSocial: true,
                    },
                },
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                    },
                },
                detalle: true,
                _count: {
                    select: {
                        softwares: true,
                        agenteEventos: true,
                    },
                },
            },
            orderBy: [
                {
                    lastSeenAt: "desc",
                },
                {
                    updatedAt: "desc",
                },
            ],
            take: 300,
        });
        res.json({
            ok: true,
            equipos,
        });
    }
    catch (error) {
        console.error("❌ Error listando equipos con agente:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno listando equipos con agente",
        });
    }
}
/* =========================
   GET /api/equipos/agent/:id
========================= */
export async function getEquipoAgentById(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            res.status(400).json({
                ok: false,
                error: "ID inválido",
            });
            return;
        }
        const user = req.user;
        const isCliente = user?.rol === "CLIENTE";
        const empresaIdFromUser = user?.empresaId ? Number(user.empresaId) : null;
        const equipo = await prisma.equipo.findFirst({
            where: {
                id_equipo: id,
                deletedAt: null,
                ...(isCliente && empresaIdFromUser
                    ? {
                        OR: [
                            { empresaId: empresaIdFromUser },
                            {
                                solicitante: {
                                    is: {
                                        empresaId: empresaIdFromUser,
                                    },
                                },
                            },
                        ],
                    }
                    : {}),
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        razonSocial: true,
                    },
                },
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                        telefono: true,
                    },
                },
                detalle: true,
                softwares: {
                    orderBy: {
                        nombre: "asc",
                    },
                },
                agenteEventos: {
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 50,
                },
                adicionales: true,
            },
        });
        if (!equipo) {
            res.status(404).json({
                ok: false,
                error: "Equipo no encontrado",
            });
            return;
        }
        res.json({
            ok: true,
            equipo,
        });
    }
    catch (error) {
        console.error("❌ Error obteniendo equipo con agente:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno obteniendo equipo",
        });
    }
}
//# sourceMappingURL=equipo-agent.controller.js.map