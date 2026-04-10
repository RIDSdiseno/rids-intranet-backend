import { getDevice, getAllConnectionsHistorical, calcDurationMinutes, } from "../../service/teamviewer/teamviewer.service.js";
import { prisma } from "../../lib/prisma.js";
import { runBackfillTeamViewerDurationsInternal } from "./teamviewer-data.controller.js";
const norm = (s) => (s ?? "").trim().replace(/\s+/g, " ");
function normalizeName(name) {
    return name
        .toLowerCase()
        .normalize("NFD") // elimina tildes
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function formatDateOnly(date) {
    return date.toISOString().slice(0, 10);
}
// Controlador principal para sincronizar sesiones de TeamViewer
export async function syncTeamViewer(req, res) {
    try {
        const result = await runTeamViewerSyncInternal();
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ error: "Error sincronizando TeamViewer" });
    }
}
// Función interna que realiza toda la lógica de sincronización, separada del controlador para facilitar testing y posibles ejecuciones programadas sin necesidad de una petición HTTP
export async function runTeamViewerSyncInternal(opts) {
    let fromDate;
    let toDate;
    if (opts?.fullHistorical) {
        fromDate = opts.fromDate;
        toDate = opts.toDate;
    }
    else {
        const lastSession = await prisma.mantencionRemota.findFirst({
            where: { origen: "TEAMVIEWER" },
            orderBy: { inicio: "desc" },
            select: { inicio: true },
        });
        fromDate = lastSession?.inicio
            ? new Date(lastSession.inicio.getTime() + 1000)
                .toISOString()
                .replace(/\.\d{3}Z$/, "Z")
            : undefined;
        toDate = undefined;
    }
    console.log("Sync TeamViewer desde:", fromDate ?? "Primera ejecución");
    console.log("Sync TeamViewer hasta:", toDate ?? "Actual");
    const data = await getAllConnectionsHistorical({
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
    });
    const sessions = data ?? [];
    if (!sessions.length) {
        return {
            ok: true,
            totalRecibidas: 0,
            creadas: 0,
            yaExistian: 0,
            sinEmpresa: 0,
            backfill: null,
        };
    }
    let creadas = 0;
    let yaExistian = 0;
    let sinEmpresa = 0;
    // 1) Obtener IDs en batch
    const sessionIds = sessions.map(s => s.id);
    const deviceIds = sessions
        .map(s => String(s.deviceid ?? "").trim())
        .filter(Boolean);
    // 2) Buscar mantenciones ya existentes en 1 sola query
    const existentes = await prisma.mantencionRemota.findMany({
        where: { teamviewerId: { in: sessionIds } },
        select: { teamviewerId: true },
    });
    const existentesSet = new Set(existentes.map(e => e.teamviewerId));
    // 3) Traer todos los mapas en 1 query
    const deviceMaps = await prisma.teamViewerDeviceMap.findMany({
        where: { deviceId: { in: deviceIds } },
        select: { deviceId: true, empresaId: true, solicitanteId: true },
    });
    // Crear un mapa en memoria para acceso rápido por deviceId
    const deviceMap = new Map(deviceMaps.map(d => [d.deviceId, d]));
    // Obtener el ID del técnico de soporte para asignar a las mantenciones remotas creadas (si existe)
    const soporteRids = await prisma.tecnico.findUnique({
        where: { email: "soporte@rids.cl" },
        select: { id_tecnico: true }
    });
    const tecnicoSoporteId = soporteRids?.id_tecnico ?? null;
    // 4) Traer todos los equipos relacionados en 1 query
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
    // Crear un mapa en memoria para acceso rápido por teamViewer (deviceId)
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
    // Crear un mapa en memoria para equipos sin teamViewer, indexado por solicitanteId para facilitar el fallback de auto-completar teamViewer
    const equipoSinTVMap = new Map();
    for (const eq of equiposSinTV) {
        if (eq.solicitante?.id_solicitante) {
            equipoSinTVMap.set(eq.solicitante.id_solicitante, eq);
        }
    }
    // Crear un mapa en memoria para acceso rápido por teamViewer (deviceId)
    const equipoMap = new Map();
    for (const eq of equipos) {
        if (eq.detalle?.teamViewer) {
            equipoMap.set(eq.detalle.teamViewer, eq.solicitante);
        }
    }
    // 5) Traer solicitantes para fallback (una sola vez)
    const solicitantes = await prisma.solicitante.findMany({
        select: { id_solicitante: true, empresaId: true, nombre: true },
    });
    // 6) Traer empresas UNA sola vez (optimización)
    const empresas = await prisma.empresa.findMany({
        select: { id_empresa: true, nombre: true },
    });
    // Para cada sesión de TeamViewer, intentamos asociarla con una empresa y un solicitante usando varios métodos (mapa explícito, inventario, fallback por nombre, match por groupname). Si logramos resolver la empresa, creamos o actualizamos la mantención remota correspondiente. También contamos cuántas sesiones se crean, cuántas ya existían y cuántas no se pudieron asociar a una empresa.
    for (const session of sessions) {
        if (existentesSet.has(session.id)) {
            yaExistian++;
            continue;
        }
        const deviceId = String(session.deviceid ?? "").trim();
        const deviceNombre = norm(session.devicename);
        const inicio = new Date(session.start_date);
        let fin = null;
        if (session.end_date) {
            fin = new Date(session.end_date);
        }
        else if (session.duration) {
            fin = new Date(inicio.getTime() + session.duration * 1000);
        }
        const duracionMinutos = fin
            ? Math.round((fin.getTime() - inicio.getTime()) / 60000)
            : null;
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
        // 4️⃣ Intentar match por alias o grupo usando API de TeamViewer (si tenemos deviceId)
        if (!empresaId && deviceId) {
            try {
                const deviceInfo = await getDevice(deviceId.startsWith("d") ? deviceId : `d${deviceId}`);
                const alias = deviceInfo.alias?.toLowerCase() ?? "";
                const group = deviceInfo.groupname?.toLowerCase() ?? "";
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
            }
        }
        if (!empresaId) {
            sinEmpresa++;
            continue;
        }
        // Crear o actualizar mantención remota
        await prisma.mantencionRemota.upsert({
            where: {
                teamviewerId: session.id,
            },
            update: {
                // opcional: puedes actualizar info si cambia
                fin,
                duracionMinutos,
                deviceNombre: deviceNombre || null,
            },
            // si no existe, lo crea con esta data
            create: {
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
                status: fin ? "COMPLETADA" : "EN_CURSO",
                deviceId: deviceId || null,
                deviceNombre: deviceNombre || null,
            },
        });
        creadas++;
    }
    const backfillFromDate = fromDate ? fromDate.slice(0, 10) : undefined;
    const backfillToDate = toDate ? toDate.slice(0, 10) : formatDateOnly(new Date());
    let backfill = null;
    if (backfillFromDate && backfillToDate) {
        try {
            backfill = await runBackfillTeamViewerDurationsInternal({
                fromDate: backfillFromDate,
                toDate: backfillToDate,
            });
        }
        catch (error) {
            console.error("[runTeamViewerSyncInternal][backfill]", error);
            backfill = {
                ok: false,
                error: "Falló el backfill posterior a la sync",
            };
        }
    }
    return {
        ok: true,
        totalRecibidas: sessions.length,
        creadas,
        yaExistian,
        sinEmpresa,
        backfill,
    };
}
//# sourceMappingURL=teamviewer.controller.js.map