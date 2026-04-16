import { prisma } from "../lib/prisma.js";
export const SLA_DEFAULTS = {
    LOW: { firstResponseMinutes: 60, resolutionMinutes: 240 },
    NORMAL: { firstResponseMinutes: 60, resolutionMinutes: 90 },
    HIGH: { firstResponseMinutes: 30, resolutionMinutes: 60 },
    URGENT: { firstResponseMinutes: 30, resolutionMinutes: 45 },
};
export async function getSlaConfigFromDB() {
    try {
        const rows = await prisma.slaConfig.findMany();
        const merged = {
            ...SLA_DEFAULTS,
        };
        for (const r of rows) {
            const priority = r.priority;
            if (priority in merged) {
                merged[priority] = {
                    firstResponseMinutes: r.firstResponseMinutes,
                    resolutionMinutes: r.resolutionMinutes,
                };
            }
        }
        return merged;
    }
    catch {
        return SLA_DEFAULTS;
    }
}
//# sourceMappingURL=sla.config.js.map