// src/modules/sii-api/services/sii-api-log.service.ts
import { prisma } from "../../../lib/prisma.js";
export async function createSiiApiLog(params) {
    try {
        await prisma.siiApiRequestLog.create({
            data: {
                empresaKey: params.empresaKey ?? null,
                rutEmpresa: params.rutEmpresa ?? null,
                endpoint: params.endpoint,
                method: params.method ?? "GET",
                status: params.status ?? null,
                ok: params.ok,
                error: params.error ?? null,
                durationMs: params.durationMs ?? null,
            },
        });
    }
    catch (error) {
        console.error("⚠️ Error guardando log SII API:", error);
    }
}
//# sourceMappingURL=sii-api-log.service.js.map