import { prisma } from "../../../lib/prisma.js";
import { siiApiRequest } from "./sii-api-client.service.js";
import { getEmpresaConfig } from "./sii-api-auth.service.js";
import { normalizeRcvResponse } from "./sii-normalizer.service.js";
import type { RcvQuery, RcvTipo } from "../types/sii-api.types.js";

export async function obtenerRcv({
    tipo,
    empresaKey,
    mes,
    ano,
    forceRefresh = false,
}: RcvQuery & { tipo: RcvTipo }) {
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
                source: "cache" as const,
                raw: cached.data,
                documentos: normalizeRcvResponse(cached.data),
            };
        }
    }

    const raw = await siiApiRequest<unknown>({
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
            data: raw as any,
        },
        update: {
            data: raw as any,
        },
    });

    return {
        source: "simpleapi" as const,
        raw,
        documentos: normalizeRcvResponse(raw),
    };
}

export function obtenerRcvVentas(params: RcvQuery) {
    return obtenerRcv({ ...params, tipo: "ventas" });
}

export function obtenerRcvCompras(params: RcvQuery) {
    return obtenerRcv({ ...params, tipo: "compras" });
}