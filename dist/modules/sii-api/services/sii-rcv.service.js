import { prisma } from "../../../lib/prisma.js";
import { siiApiRequest } from "./sii-api-client.service.js";
import { getEmpresaConfig } from "./sii-api-auth.service.js";
import { normalizeRcvResponse } from "./sii-normalizer.service.js";
export async function obtenerRcv({ tipo, empresaKey, mes, ano, forceRefresh = false, }) {
    const mesNormalizado = mes.padStart(2, "0");
    const empresaConfig = getEmpresaConfig(empresaKey); // ← resuelve credenciales aquí
    if (!forceRefresh) {
        const cached = await prisma.siiApiCache.findUnique({
            where: {
                empresaKey_tipo_mes_ano: {
                    empresaKey,
                    tipo,
                    mes: mesNormalizado,
                    ano,
                },
            },
        });
        if (cached) {
            return {
                source: "cache",
                raw: cached.data,
                documentos: normalizeRcvResponse(cached.data),
            };
        }
    }
    const raw = await siiApiRequest({
        empresaKey,
        empresaConfig,
        endpoint: `/api/RCV/${tipo}/${mesNormalizado}/${ano}`,
        method: "POST",
    });
    await prisma.siiApiCache.upsert({
        where: {
            empresaKey_tipo_mes_ano: { empresaKey, tipo, mes: mesNormalizado, ano },
        },
        create: {
            empresaKey,
            rutEmpresa: empresaConfig.rutEmpresa,
            tipo,
            mes: mesNormalizado,
            ano,
            data: raw,
        },
        update: {
            data: raw,
        },
    });
    return {
        source: "simpleapi",
        raw,
        documentos: normalizeRcvResponse(raw),
    };
}
export function obtenerRcvVentas(params) {
    return obtenerRcv({ ...params, tipo: "ventas" });
}
export function obtenerRcvCompras(params) {
    return obtenerRcv({ ...params, tipo: "compras" });
}
//# sourceMappingURL=sii-rcv.service.js.map