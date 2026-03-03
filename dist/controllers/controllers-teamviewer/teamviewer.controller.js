import { getConnections, getDevice } from "../../service/teamviewer/teamviewer.service.js";
import { prisma } from "../../lib/prisma.js";
const norm = (s) => (s ?? "").trim().replace(/\s+/g, " ");
function normalizeName(name) {
    return name
        .toLowerCase()
        .normalize("NFD") // elimina tildes
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
export async function syncTeamViewer(req, res) {
    try {
        const result = await runTeamViewerSyncInternal();
        return res.json(result);
    }
    catch (error) {
        console.error("🔥 ERROR REAL:", error);
        return res.status(500).json({ error: "Error sincronizando TeamViewer" });
    }
}
export async function runTeamViewerSyncInternal() {
    const lastSession = await prisma.mantencionRemota.findFirst({
        where: { origen: "TEAMVIEWER" },
        orderBy: { inicio: "desc" },
        select: { inicio: true },
    });
    const fromDate = lastSession?.inicio
        ? new Date(lastSession.inicio.getTime() + 1000)
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z")
        : undefined;
    console.log("Última fecha sync:", fromDate ?? "Primera ejecución");
    const data = await getConnections(undefined);
    const sessions = data?.records ?? [];
    console.log("GROUPNAMES DETECTADOS:", [...new Set(sessions.map(s => s.groupname))]);
    if (!sessions.length) {
        return { ok: true, totalRecibidas: 0 };
    }
    let creadas = 0;
    let yaExistian = 0;
    let sinEmpresa = 0;
    // 🔥 1) Obtener IDs en batch
    const sessionIds = sessions.map(s => s.id);
    const deviceIds = sessions
        .map(s => String(s.deviceid ?? "").trim())
        .filter(Boolean);
    // 🔥 2) Buscar mantenciones ya existentes en 1 sola query
    const existentes = await prisma.mantencionRemota.findMany({
        where: { teamviewerId: { in: sessionIds } },
        select: { teamviewerId: true },
    });
    const existentesSet = new Set(existentes.map(e => e.teamviewerId));
    // 🔥 3) Traer todos los mapas en 1 query
    const deviceMaps = await prisma.teamViewerDeviceMap.findMany({
        where: { deviceId: { in: deviceIds } },
        select: { deviceId: true, empresaId: true, solicitanteId: true },
    });
    const deviceMap = new Map(deviceMaps.map(d => [d.deviceId, d]));
    const soporteRids = await prisma.tecnico.findUnique({
        where: { email: "soporte@rids.cl" },
        select: { id_tecnico: true }
    });
    const tecnicoSoporteId = soporteRids?.id_tecnico ?? null;
    // 🔥 4) Traer todos los equipos relacionados en 1 query
    const equipos = await prisma.equipo.findMany({
        where: {
            detalle: {
                is: { teamViewer: { in: deviceIds } },
            },
        },
        select: {
            detalle: { select: { teamViewer: true } },
            solicitante: {
                select: { id_solicitante: true, empresaId: true, nombre: true },
            },
        },
    });
    const equiposSinTV = await prisma.equipo.findMany({
        where: {
            detalle: {
                is: { teamViewer: null },
            },
        },
        select: {
            id_equipo: true,
            detalle: { select: { teamViewer: true } },
            solicitante: {
                select: { id_solicitante: true, empresaId: true, nombre: true },
            },
        },
    });
    const equipoSinTVMap = new Map();
    for (const eq of equiposSinTV) {
        if (eq.solicitante?.id_solicitante) {
            equipoSinTVMap.set(eq.solicitante.id_solicitante, eq);
        }
    }
    const equipoMap = new Map();
    for (const eq of equipos) {
        if (eq.detalle?.teamViewer) {
            equipoMap.set(eq.detalle.teamViewer, eq.solicitante);
        }
    }
    // 🔥 5) Traer solicitantes para fallback (una sola vez)
    const solicitantes = await prisma.solicitante.findMany({
        select: { id_solicitante: true, empresaId: true, nombre: true },
    });
    // 🔥 6) Traer empresas UNA sola vez (optimización)
    const empresas = await prisma.empresa.findMany({
        select: { id_empresa: true, nombre: true },
    });
    // 🔥 LOOP LIVIANO (sin queries pesadas)
    for (const session of sessions) {
        if (existentesSet.has(session.id)) {
            yaExistian++;
            continue;
        }
        const deviceId = String(session.deviceid ?? "").trim();
        const deviceNombre = norm(session.devicename);
        const inicio = new Date(session.start_date);
        const fin = session.end_date ? new Date(session.end_date) : null;
        const duracionMinutos = fin ? Math.round((fin.getTime() - inicio.getTime()) / 60000) : null;
        let empresaId = null;
        let solicitanteId = null;
        let solicitanteNombreFinal = deviceNombre || "Desconocido";
        // 1️⃣ Mapa explícito
        const explicitMap = deviceMap.get(deviceId);
        if (explicitMap?.empresaId) {
            empresaId = explicitMap.empresaId;
            solicitanteId = explicitMap.solicitanteId ?? null;
        }
        // 2️⃣ Inventario
        if ((!empresaId || !solicitanteId) && deviceId) {
            const sol = equipoMap.get(deviceId);
            if (sol) {
                solicitanteId = sol.id_solicitante;
                empresaId = sol.empresaId;
                solicitanteNombreFinal = sol.nombre;
            }
        }
        // 3️⃣ Fallback por nombre
        if ((!empresaId || !solicitanteId) && deviceNombre) {
            const sol = solicitantes.find(s => s.nombre.toLowerCase().includes(deviceNombre.toLowerCase()));
            if (sol) {
                solicitanteId = sol.id_solicitante;
                empresaId = sol.empresaId;
                solicitanteNombreFinal = sol.nombre;
                // 🔐 Auto-completar teamViewer SOLO si el equipo no lo tiene
                const equipoSinTV = equipoSinTVMap.get(sol.id_solicitante);
                if (equipoSinTV && deviceId) {
                    await prisma.detalleEquipo.update({
                        where: { idEquipo: equipoSinTV.id_equipo },
                        data: { teamViewer: deviceId },
                    });
                    // actualizar mapa en memoria para que no vuelva a intentarlo
                    equipoSinTVMap.delete(sol.id_solicitante);
                }
            }
        }
        // 🔹 Intentar match directo por groupname (sin API extra)
        if (!empresaId && session.groupname) {
            const groupNormalized = normalizeName(session.groupname);
            const match = empresas.find(e => {
                const empresaNorm = normalizeName(e.nombre);
                return (groupNormalized.includes(empresaNorm) ||
                    empresaNorm.includes(groupNormalized));
            });
            if (match) {
                empresaId = match.id_empresa;
            }
        }
        if (!empresaId && deviceId) {
            try {
                const deviceInfo = await getDevice(deviceId.startsWith("d") ? deviceId : `d${deviceId}`);
                const alias = deviceInfo.alias?.toLowerCase() ?? "";
                const group = deviceInfo.groupname?.toLowerCase() ?? "";
                console.log("🔎 DEVICE INFO:", {
                    alias,
                    group,
                });
                // 🔹 Intentar match por alias
                const solAlias = solicitantes.find(s => alias.includes(s.nombre.toLowerCase()));
                if (solAlias) {
                    solicitanteId = solAlias.id_solicitante;
                    empresaId = solAlias.empresaId;
                    solicitanteNombreFinal = solAlias.nombre;
                }
                // 🔹 Intentar match por grupo (empresa)
                if (!empresaId && group) {
                    const empresa = await prisma.empresa.findFirst({
                        where: {
                            nombre: {
                                contains: group,
                                mode: "insensitive",
                            },
                        },
                        select: { id_empresa: true },
                    });
                    if (empresa) {
                        empresaId = empresa.id_empresa;
                    }
                }
                // 🔹 Si logramos resolver → actualizar mapa
                if (empresaId) {
                    await prisma.teamViewerDeviceMap.update({
                        where: { deviceId },
                        data: {
                            empresaId,
                            solicitanteId,
                            deviceNombre: deviceInfo.alias ?? undefined,
                        },
                    });
                }
            }
            catch (err) {
                console.log("⚠ No se pudo consultar device API");
            }
        }
        if (!empresaId) {
            console.log("❌ SESSION SIN EMPRESA (FINAL):", session);
            sinEmpresa++;
            continue;
        }
        await prisma.mantencionRemota.create({
            data: {
                teamviewerId: session.id,
                origen: "TEAMVIEWER",
                empresaId,
                solicitanteId,
                tecnicoId: tecnicoSoporteId,
                solicitante: solicitanteNombreFinal,
                inicio,
                fin,
                duracionMinutos,
                soporteRemoto: true,
                status: "COMPLETADA",
                deviceId: deviceId || null,
                deviceNombre: deviceNombre || null,
            },
        });
        creadas++;
    }
    return {
        ok: true,
        totalRecibidas: sessions.length,
        creadas,
        yaExistian,
        sinEmpresa,
    };
}
//# sourceMappingURL=teamviewer.controller.js.map