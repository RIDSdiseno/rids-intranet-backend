// src/service/simple-api/simpleapi-cache.service.ts
import { prisma } from "../../lib/prisma.js";
export async function getSiiApiCache(params) {
    return prisma.siiApiCache.findUnique({
        where: {
            empresaKey_tipo_mes_ano: {
                empresaKey: params.empresaKey,
                tipo: params.tipo,
                mes: params.mes,
                ano: params.ano,
            },
        },
    });
}
export async function saveSiiApiCache(params, data) {
    return prisma.siiApiCache.upsert({
        where: {
            empresaKey_tipo_mes_ano: {
                empresaKey: params.empresaKey,
                tipo: params.tipo,
                mes: params.mes,
                ano: params.ano,
            },
        },
        create: {
            empresaKey: params.empresaKey,
            rutEmpresa: params.rutEmpresa,
            tipo: params.tipo,
            mes: params.mes,
            ano: params.ano,
            data: data,
        },
        update: {
            rutEmpresa: params.rutEmpresa,
            data: data,
        },
    });
}
//# sourceMappingURL=simple-api-cache.service.js.map