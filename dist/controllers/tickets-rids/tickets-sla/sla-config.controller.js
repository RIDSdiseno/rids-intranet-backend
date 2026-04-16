import { prisma } from "../../../lib/prisma.js";
import { getSlaConfigFromDB } from "../../../config/sla.config.js";
const PRIORITY_ORDER = ["LOW", "NORMAL", "HIGH", "URGENT"];
export async function getSlaConfig(req, res) {
    try {
        const config = await getSlaConfigFromDB();
        const data = PRIORITY_ORDER.map((priority, index) => ({
            id: index + 1,
            priority,
            firstResponseMinutes: config[priority].firstResponseMinutes,
            resolutionMinutes: config[priority].resolutionMinutes,
        }));
        return res.json({ ok: true, data });
    }
    catch (error) {
        console.error("[getSlaConfig]", error);
        return res.status(500).json({ error: "Error obteniendo configuración SLA" });
    }
}
export async function updateSlaConfig(req, res) {
    try {
        const priority = req.params.priority;
        const { firstResponseMinutes, resolutionMinutes } = req.body;
        if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) {
            return res.status(400).json({ error: "Prioridad inválida" });
        }
        if (typeof firstResponseMinutes !== "number" || firstResponseMinutes < 1 ||
            typeof resolutionMinutes !== "number" || resolutionMinutes < 1) {
            return res.status(400).json({ error: "Valores inválidos" });
        }
        if (firstResponseMinutes > resolutionMinutes) {
            return res.status(400).json({
                error: "El tiempo de primera respuesta no puede ser mayor al de resolución"
            });
        }
        const updated = await prisma.slaConfig.upsert({
            where: { priority },
            create: { priority, firstResponseMinutes, resolutionMinutes },
            update: { firstResponseMinutes, resolutionMinutes },
        });
        return res.json({ ok: true, data: updated });
    }
    catch (error) {
        console.error("[updateSlaConfig]", error);
        return res.status(500).json({ error: "Error actualizando configuración SLA" });
    }
}
//# sourceMappingURL=sla-config.controller.js.map