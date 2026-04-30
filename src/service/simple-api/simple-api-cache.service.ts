// src/service/simple-api/simpleapi-cache.service.ts

import { prisma } from "../../lib/prisma.js";

type RcvTipo = "ventas" | "compras";

type GetCacheParams = {
    empresaKey: string;
    rutEmpresa: string;
    tipo: RcvTipo;
    mes: string;
    ano: string;
};

export async function getSiiApiCache(params: GetCacheParams) {
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

export async function saveSiiApiCache(
    params: GetCacheParams,
    data: unknown
) {
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
            data: data as any,
        },
        update: {
            rutEmpresa: params.rutEmpresa,
            data: data as any,
        },
    });
}