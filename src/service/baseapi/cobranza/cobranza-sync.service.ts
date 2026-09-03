import {
    consultarVentasRcvBaseApi,
} from "../baseapi-rcv.service.js";

type EmpresaKey =
    | "econnet"
    | "rids";

export type CobranzaSyncResultado = {
    empresa: EmpresaKey;
    ok: boolean;
    cached?: boolean;
    cacheUpdatedAt?: Date | string | null;
    error?: string;
};

export async function sincronizarRcvCobranza(): Promise<
    CobranzaSyncResultado[]
> {
    const hoy = new Date();

    const mes = String(
        hoy.getMonth() + 1
    ).padStart(2, "0");

    const ano = String(
        hoy.getFullYear()
    );

    const empresas: EmpresaKey[] = [
        "econnet",
        "rids",
    ];

    const resultados: CobranzaSyncResultado[] =
        [];

    for (const empresa of empresas) {
        try {
            console.log(
                `[COBRANZA SYNC] Consultando ${empresa.toUpperCase()} ${mes}/${ano}`
            );

            const resultado =
                await consultarVentasRcvBaseApi({
                    empresa,
                    mes,
                    ano,
                    forceRefresh: true,
                });

            resultados.push({
                empresa,
                ok: true,
                cached:
                    resultado.cached,
                cacheUpdatedAt:
                    resultado.cacheUpdatedAt,
            });

            console.log(
                `[COBRANZA SYNC] ✅ ${empresa.toUpperCase()} sincronizado`
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            console.error(
                `[COBRANZA SYNC] ❌ Error sincronizando ${empresa.toUpperCase()}:`,
                message
            );

            resultados.push({
                empresa,
                ok: false,
                error: message,
            });
        }
    }

    return resultados;
}