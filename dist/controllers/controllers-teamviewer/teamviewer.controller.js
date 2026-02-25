import { getConnections } from "../../service/teamviewer/teamviewer.service.js";
import { prisma } from "../../lib/prisma.js";
export async function syncTeamViewer(req, res) {
    try {
        const data = await getConnections();
        const sessions = data?.records ?? [];
        let creadas = 0;
        let yaExistian = 0;
        for (const session of sessions) {
            const inicio = new Date(session.start_date);
            const fin = session.end_date ? new Date(session.end_date) : null;
            const duracionMinutos = fin
                ? Math.round((fin.getTime() - inicio.getTime()) / 60000)
                : null;
            const existente = await prisma.mantencionRemota.findUnique({
                where: { teamviewerId: session.id }
            });
            if (existente) {
                yaExistian++;
                continue;
            }
            // 🔎 Buscar solicitante por nombre (case insensitive)
            const solicitanteDb = session.devicename
                ? await prisma.solicitante.findFirst({
                    where: {
                        nombre: {
                            equals: session.devicename,
                            mode: "insensitive"
                        }
                    }
                })
                : null;
            await prisma.mantencionRemota.create({
                data: {
                    teamviewerId: session.id,
                    origen: "TEAMVIEWER",
                    empresaId: solicitanteDb?.empresaId ?? null,
                    solicitanteId: solicitanteDb?.id_solicitante ?? null,
                    solicitante: solicitanteDb?.nombre ?? session.devicename ?? "Desconocido",
                    inicio,
                    fin,
                    duracionMinutos,
                    soporteRemoto: true,
                    status: "COMPLETADA",
                    deviceId: session.deviceid,
                    deviceNombre: session.devicename,
                },
            });
            creadas++;
        }
        return res.json({
            ok: true,
            totalRecibidas: sessions.length,
            creadas,
            yaExistian,
        });
    }
    catch (error) {
        console.error("🔥 ERROR REAL:", error);
        return res.status(500).json({
            error: "Error sincronizando TeamViewer",
        });
    }
}
//# sourceMappingURL=teamviewer.controller.js.map