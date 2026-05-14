// src/controllers/controllers-agente-inventario/equipo-agent.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

type EquipoAgentPayload = {
    empresaId?: number | string | null;
    solicitanteId?: number | string | null;

    empresaNombre?: string | null;
    dominioEmpresa?: string | null;

    solicitanteEmail?: string | null;
    solicitanteNombre?: string | null;

    hostname?: string | null;
    serial?: string | null;

    marca?: string | null;
    modelo?: string | null;
    procesador?: string | null;

    ramGb?: number | string | null;
    diskTotalGb?: number | string | null;
    diskFreeGb?: number | string | null;

    osName?: string | null;
    osVersion?: string | null;
    osBuild?: string | null;

    usuarioActual?: string | null;
    dominio?: string | null;
    localIp?: string | null;
    publicIp?: string | null;
    macAddress?: string | null;

    lastBootAt?: string | null;
    agenteVersion?: string | null;

    antivirusNombre?: string | null;
    antivirusActivo?: boolean | null;
    firewallActivo?: boolean | null;
    bitlockerEstado?: string | null;
    windowsUpdate?: string | null;

    tipoDd?: string | null;
    estadoAlm?: string | null;
    office?: string | null;
    teamViewer?: string | null;

    softwares?: Array<{
        nombre?: string | null;
        version?: string | null;
        publisher?: string | null;
        installDate?: string | null;
    }>;
};

/* =========================
   HELPERS
========================= */

function cleanString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function dateOrNull(value: unknown): Date | null {
    if (!value || typeof value !== "string") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function boolOrNull(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    return null;
}

function validateAgentApiKey(req: Request): boolean {
    const expected = process.env.WINDOWS_AGENT_API_KEY?.trim();
    const received = req.header("x-agent-api-key")?.trim();

    return Boolean(expected && received && expected === received);
}

function buildRamText(ramGb: number | null): string | null {
    if (ramGb === null) return null;
    return `${ramGb} GB`;
}

function buildDiskText(totalGb: number | null, freeGb: number | null): string | null {
    if (totalGb === null && freeGb === null) return null;

    if (totalGb !== null && freeGb !== null) {
        return `${totalGb} GB total / ${freeGb} GB libres`;
    }

    if (totalGb !== null) return `${totalGb} GB total`;
    return `${freeGb} GB libres`;
}

function buildSoText(
    osName: string | null,
    osVersion: string | null,
    osBuild: string | null
): string | null {
    const parts = [
        osName,
        osVersion ? `v${osVersion}` : null,
        osBuild ? `build ${osBuild}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" - ") : null;
}

function getEmailDomain(email?: string | null): string | null {
    const clean = cleanString(email)?.toLowerCase();

    if (!clean || !clean.includes("@")) return null;

    return clean.split("@")[1]?.trim() || null;
}

/* =========================
   RESOLUCIÓN AUTOMÁTICA
========================= */

async function resolveEmpresaFromAgent(body: EquipoAgentPayload) {
    const empresaId = numberOrNull(body.empresaId);

    if (empresaId) {
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
        });

        if (empresa) return empresa;
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

        if (empresa) return empresa;
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

        if (empresa) return empresa;
    }

    return null;
}

async function resolveSolicitanteFromAgent(
    body: EquipoAgentPayload,
    empresaId?: number | null
) {
    const solicitanteId = numberOrNull(body.solicitanteId);

    if (solicitanteId) {
        const solicitante = await prisma.solicitante.findUnique({
            where: { id_solicitante: solicitanteId },
        });

        if (solicitante) return solicitante;
    }

    const email = cleanString(body.solicitanteEmail)?.toLowerCase();

    if (email) {
        const solicitante = await prisma.solicitante.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: "insensitive",
                },
                ...(empresaId ? { empresaId } : {}),
                deletedAt: null,
            },
        });

        if (solicitante) return solicitante;
    }

    return null;
}

/* =========================
   SOFTWARE
========================= */

async function syncSoftwares(
    equipoId: number,
    softwares: EquipoAgentPayload["softwares"]
) {
    if (!softwares || !Array.isArray(softwares)) return;

    const cleaned = softwares
        .map((s) => ({
            nombre: cleanString(s.nombre),
            version: cleanString(s.version) ?? "",
            publisher: cleanString(s.publisher),
            installDate: dateOrNull(s.installDate),
        }))
        .filter((s) => Boolean(s.nombre));

    if (cleaned.length === 0) return;

    for (const sw of cleaned) {
        await prisma.equipoSoftware.upsert({
            where: {
                equipoId_nombre_version: {
                    equipoId,
                    nombre: sw.nombre!,
                    version: sw.version,
                },
            },
            update: {
                publisher: sw.publisher,
                installDate: sw.installDate,
            },
            create: {
                equipoId,
                nombre: sw.nombre!,
                version: sw.version,
                publisher: sw.publisher,
                installDate: sw.installDate,
            },
        });
    }
}

/* =========================
   POST /api/equipos/agent/inventory
========================= */

export async function receiveEquipoAgentInventory(req: Request, res: Response) {
    try {
        if (!validateAgentApiKey(req)) {
            res.status(401).json({
                ok: false,
                error: "No autorizado",
            });
            return;
        }

        const body = req.body as EquipoAgentPayload;

        const serial = cleanString(body.serial);
        const hostname = cleanString(body.hostname);

        const solicitanteEmail =
            cleanString(body.solicitanteEmail)?.toLowerCase() ?? null;

        const dominioEmpresa =
            cleanString(body.dominioEmpresa)?.toLowerCase() ??
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

        const solicitanteDetectado = await resolveSolicitanteFromAgent(
            {
                ...body,
                solicitanteEmail,
            },
            empresaDetectada?.id_empresa ?? null
        );

        const marca = cleanString(body.marca) ?? "Sin marca";
        const modelo = cleanString(body.modelo) ?? "Sin modelo";

        const ramGb = numberOrNull(body.ramGb);
        const diskTotalGb = numberOrNull(body.diskTotalGb);
        const diskFreeGb = numberOrNull(body.diskFreeGb);

        const osName = cleanString(body.osName);
        const osVersion = cleanString(body.osVersion);
        const osBuild = cleanString(body.osBuild);

        let equipo = null as Awaited<ReturnType<typeof prisma.equipo.findFirst>>;

        if (serial) {
            equipo = await prisma.equipo.findUnique({
                where: { serial },
            });
        }

        if (!equipo && hostname && empresaDetectada?.id_empresa) {
            equipo = await prisma.equipo.findFirst({
                where: {
                    hostname,
                    empresaId: empresaDetectada.id_empresa,
                    deletedAt: null,
                },
            });
        }

        /**
         * Importante:
         * Si el equipo ya fue clasificado manualmente, se conserva su empresa/solicitante.
         * Si no, se usa lo detectado automáticamente.
         */
        const empresaIdFinal =
            equipo?.empresaId ??
            empresaDetectada?.id_empresa ??
            null;

        const idSolicitanteFinal =
            equipo?.idSolicitante ??
            solicitanteDetectado?.id_solicitante ??
            null;

        const equipoUpdateData: any = {
            lastSeenAt: new Date(),
            agenteActivo: true,
            estadoAgente: "ACTIVO",
            deletedAt: null,
        };

        if (serial) equipoUpdateData.serial = serial;
        if (hostname) equipoUpdateData.hostname = hostname;

        if (marca) equipoUpdateData.marca = marca;
        if (modelo) equipoUpdateData.modelo = modelo;

        const procesador = cleanString(body.procesador);
        if (procesador) equipoUpdateData.procesador = procesador;

        const ramText = buildRamText(ramGb);
        if (ramText) equipoUpdateData.ram = ramText;
        if (ramGb !== null) equipoUpdateData.ramGb = ramGb;

        const diskText = buildDiskText(diskTotalGb, diskFreeGb);
        if (diskText) equipoUpdateData.disco = diskText;
        if (diskTotalGb !== null) equipoUpdateData.diskTotalGb = diskTotalGb;
        if (diskFreeGb !== null) equipoUpdateData.diskFreeGb = diskFreeGb;

        const usuarioActual = cleanString(body.usuarioActual);
        if (usuarioActual) equipoUpdateData.usuarioActual = usuarioActual;

        const dominio = cleanString(body.dominio);
        if (dominio) equipoUpdateData.dominio = dominio;

        const localIp = cleanString(body.localIp);
        if (localIp) equipoUpdateData.localIp = localIp;

        const publicIp = cleanString(body.publicIp);
        if (publicIp) equipoUpdateData.publicIp = publicIp;

        const macAddress = cleanString(body.macAddress);
        if (macAddress) equipoUpdateData.macAddress = macAddress;

        const lastBootAt = dateOrNull(body.lastBootAt);
        if (lastBootAt) equipoUpdateData.lastBootAt = lastBootAt;

        const agenteVersion = cleanString(body.agenteVersion);
        if (agenteVersion) equipoUpdateData.agenteVersion = agenteVersion;

        if (empresaIdFinal) equipoUpdateData.empresaId = empresaIdFinal;
        if (idSolicitanteFinal) equipoUpdateData.idSolicitante = idSolicitanteFinal;

        if (equipo) {
            equipo = await prisma.equipo.update({
                where: {
                    id_equipo: equipo.id_equipo,
                },
                data: equipoUpdateData,
            });
        } else {
            const serialForCreate =
                serial ??
                (hostname
                    ? `AGENT-${hostname}-${empresaIdFinal ?? "SIN-EMPRESA"}`
                    : `AGENT-${Date.now()}`);

            equipo = await prisma.equipo.create({
                data: {
                    ...equipoUpdateData,
                    serial: serialForCreate,
                    marca,
                    modelo,
                    tipo: "NOTEBOOK",
                    propiedad: "Empresa",
                },
            });
        }

        const soTexto = buildSoText(osName, osVersion, osBuild);

        await prisma.detalleEquipo.upsert({
            where: {
                idEquipo: equipo.id_equipo,
            },
            update: {
                ...(soTexto ? { so: soTexto } : {}),
                ...(macAddress ? { macWifi: macAddress } : {}),
                ...(localIp ? { redEthernet: localIp } : {}),

                antivirusNombre: cleanString(body.antivirusNombre),
                antivirusActivo: boolOrNull(body.antivirusActivo),
                firewallActivo: boolOrNull(body.firewallActivo),
                bitlockerEstado: cleanString(body.bitlockerEstado),
                windowsUpdate: cleanString(body.windowsUpdate),

                ...(cleanString(body.tipoDd) ? { tipoDd: cleanString(body.tipoDd) } : {}),
                ...(cleanString(body.estadoAlm) ? { estadoAlm: cleanString(body.estadoAlm) } : {}),
                ...(cleanString(body.office) ? { office: cleanString(body.office) } : {}),
                ...(cleanString(body.teamViewer) ? { teamViewer: cleanString(body.teamViewer) } : {}),
            },
            create: {
                idEquipo: equipo.id_equipo,
                so: soTexto,
                macWifi: macAddress,
                redEthernet: localIp,

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

        await syncSoftwares(equipo.id_equipo, body.softwares);

        await prisma.equipoAgenteEvento.create({
            data: {
                equipoId: equipo.id_equipo,
                tipo: "INVENTORY_SYNC",
                mensaje: "Inventario recibido desde agente Windows",
                metadata: {
                    hostname,
                    serial,
                    solicitanteEmail,
                    dominioEmpresa,

                    empresaDetectadaId: empresaDetectada?.id_empresa ?? null,
                    empresaDetectadaNombre: empresaDetectada?.nombre ?? null,

                    solicitanteDetectadoId:
                        solicitanteDetectado?.id_solicitante ?? null,
                    solicitanteDetectadoNombre:
                        solicitanteDetectado?.nombre ?? null,

                    empresaIdFinal,
                    solicitanteIdFinal: idSolicitanteFinal,

                    clasificado: Boolean(empresaIdFinal),
                    requiereClasificacion: !empresaIdFinal,

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
            clasificado: Boolean(empresaIdFinal),
            requiereClasificacion: !empresaIdFinal,
        });
    } catch (error) {
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

export async function listEquiposAgent(req: Request, res: Response) {
    try {
        const search = String(req.query.search ?? "").trim();
        const empresaIdQuery = Number(req.query.empresaId || 0);
        const estadoAgente = String(req.query.estadoAgente ?? "").trim();
        const soloConAgente = String(req.query.soloConAgente ?? "false") === "true";
        const pendienteClasificacion =
            String(req.query.pendienteClasificacion ?? "false") === "true";

        const user = (req as any).user;

        const isCliente = user?.rol === "CLIENTE";
        const empresaIdFromUser = user?.empresaId ? Number(user.empresaId) : null;

        const empresaId =
            isCliente && empresaIdFromUser
                ? empresaIdFromUser
                : empresaIdQuery || undefined;

        const equipos = await prisma.equipo.findMany({
            where: {
                deletedAt: null,

                ...(empresaId
                    ? {
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
                    }
                    : {}),

                ...(soloConAgente
                    ? {
                        lastSeenAt: {
                            not: null,
                        },
                    }
                    : {}),

                ...(pendienteClasificacion
                    ? {
                        lastSeenAt: {
                            not: null,
                        },
                        OR: [
                            { empresaId: null },
                            { idSolicitante: null },
                        ],
                    }
                    : {}),

                ...(estadoAgente
                    ? {
                        estadoAgente: estadoAgente as any,
                    }
                    : {}),

                ...(search
                    ? {
                        OR: [
                            { hostname: { contains: search, mode: "insensitive" } },
                            { serial: { contains: search, mode: "insensitive" } },
                            { marca: { contains: search, mode: "insensitive" } },
                            { modelo: { contains: search, mode: "insensitive" } },
                            { usuarioActual: { contains: search, mode: "insensitive" } },
                            { localIp: { contains: search, mode: "insensitive" } },
                            { macAddress: { contains: search, mode: "insensitive" } },
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
    } catch (error) {
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

export async function getEquipoAgentById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isFinite(id)) {
            res.status(400).json({
                ok: false,
                error: "ID inválido",
            });
            return;
        }

        const user = (req as any).user;
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
    } catch (error) {
        console.error("❌ Error obteniendo equipo con agente:", error);

        res.status(500).json({
            ok: false,
            error: "Error interno obteniendo equipo",
        });
    }
}