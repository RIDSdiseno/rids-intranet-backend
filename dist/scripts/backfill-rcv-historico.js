// src/scripts/backfill-rcv-historico.ts
import "dotenv/config";
import { prisma, } from "../lib/prisma.js";
import { consultarVentasRcvBaseApi, consultarComprasRcvBaseApi, } from "../service/baseapi/baseapi-rcv.service.js";
/* =========================================================
   CONFIGURACIÓN
========================================================= */
/*
 * true:
 *   solo muestra qué haría.
 *
 * false:
 *   ejecuta consultas reales contra BaseAPI.
 */
const DRY_RUN = false;
/*
 * Pausa solo entre llamadas reales.
 */
const DELAY_MS = 2500;
/*
 * Límite de seguridad por ejecución.
 *
 * Con 72 meses faltantes, 100 alcanza,
 * pero puedes bajarlo si quieres probar por lotes.
 */
const MAX_CALLS = 100;
/* =========================================================
   ARGUMENTOS
========================================================= */
const empresa = String(process.argv[2] ??
    "")
    .trim()
    .toLowerCase();
const tipo = String(process.argv[3] ??
    "ventas")
    .trim()
    .toLowerCase();
const anoInicio = Number(process.argv[4]);
const mesInicio = Number(process.argv[5] ??
    1);
/* =========================================================
   VALIDACIONES
========================================================= */
if (empresa !==
    "econnet" &&
    empresa !==
        "rids") {
    throw new Error("Empresa inválida. Usa econnet o rids.");
}
if (tipo !==
    "ventas" &&
    tipo !==
        "compras") {
    throw new Error("Tipo inválido. Usa ventas o compras.");
}
const anoActual = new Date()
    .getFullYear();
if (!Number.isInteger(anoInicio) ||
    anoInicio <
        2000 ||
    anoInicio >
        anoActual) {
    throw new Error("Año inicial inválido.");
}
if (!Number.isInteger(mesInicio) ||
    mesInicio <
        1 ||
    mesInicio >
        12) {
    throw new Error("Mes inicial inválido.");
}
/* =========================================================
   HELPERS
========================================================= */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function getCacheTipo(tipo) {
    return `baseapi-rcv-${tipo}`;
}
function generarPeriodos(anoDesde, mesDesde) {
    const ahora = new Date();
    const anoHasta = ahora.getFullYear();
    const mesHasta = ahora.getMonth() +
        1;
    const periodos = [];
    let ano = anoDesde;
    let mes = mesDesde;
    while (ano <
        anoHasta ||
        (ano ===
            anoHasta &&
            mes <=
                mesHasta)) {
        const mesString = String(mes).padStart(2, "0");
        const anoString = String(ano);
        periodos.push({
            ano: anoString,
            mes: mesString,
            periodo: `${anoString}-${mesString}`,
        });
        mes++;
        if (mes >
            12) {
            mes =
                1;
            ano++;
        }
    }
    return periodos;
}
function getDocumentos(resultado) {
    const candidatos = [
        resultado
            ?.data
            ?.data
            ?.datos,
        resultado
            ?.data
            ?.datos,
        resultado
            ?.data
            ?.documentos,
        resultado
            ?.data
            ?.detalleVentas,
        resultado
            ?.data
            ?.detalleCompras,
        resultado
            ?.data
            ?.ventas,
        resultado
            ?.data
            ?.compras,
    ];
    for (const item of candidatos) {
        if (Array.isArray(item)) {
            return item;
        }
    }
    return [];
}
/* =========================================================
   MAIN
========================================================= */
async function main() {
    const periodos = generarPeriodos(anoInicio, mesInicio);
    const cacheTipo = getCacheTipo(tipo);
    let existentes = 0;
    let faltantes = 0;
    let consultados = 0;
    let conDatos = 0;
    let sinDatos = 0;
    let errores = 0;
    let llamadasReales = 0;
    console.log("============================================");
    console.log("       BACKFILL HISTÓRICO RCV");
    console.log("============================================");
    console.log({
        modo: DRY_RUN
            ? "SIMULACION"
            : "REAL",
        empresa,
        tipo,
        desde: `${anoInicio}-${String(mesInicio).padStart(2, "0")}`,
        hasta: periodos[periodos.length -
            1]?.periodo ??
            null,
        totalPeriodos: periodos.length,
        maxCalls: MAX_CALLS,
    });
    console.log("============================================");
    for (const periodo of periodos) {
        try {
            const cache = await prisma
                .siiApiCache
                .findUnique({
                where: {
                    empresaKey_tipo_mes_ano: {
                        empresaKey: empresa,
                        tipo: cacheTipo,
                        mes: periodo.mes,
                        ano: periodo.ano,
                    },
                },
            });
            /*
             * Ya existe cache:
             * nunca consultamos BaseAPI.
             */
            if (cache) {
                existentes++;
                console.log(`✅ ${periodo.periodo} | CACHE EXISTENTE`);
                continue;
            }
            faltantes++;
            /*
             * SIMULACIÓN:
             * solamente informar.
             */
            if (DRY_RUN) {
                console.log(`🟡 ${periodo.periodo} | FALTA CACHE | CONSULTARÍA BASEAPI`);
                continue;
            }
            /*
             * REAL:
             * límite de seguridad.
             */
            if (llamadasReales >=
                MAX_CALLS) {
                console.warn(`⛔ Límite de ${MAX_CALLS} llamadas alcanzado.`);
                break;
            }
            console.log(`📡 ${periodo.periodo} | CONSULTANDO BASEAPI...`);
            const resultado = tipo ===
                "ventas"
                ? await consultarVentasRcvBaseApi({
                    empresa,
                    mes: periodo.mes,
                    ano: periodo.ano,
                    /*
                     * Como previamente verificamos que
                     * el cache no existe, queremos una
                     * consulta real.
                     */
                    forceRefresh: true,
                })
                : await consultarComprasRcvBaseApi({
                    empresa,
                    mes: periodo.mes,
                    ano: periodo.ano,
                    forceRefresh: true,
                    /*
                     * Para backfill histórico del dashboard
                     * evitamos una segunda consulta adicional
                     * de pendientes.
                     */
                    incluirPendientes: false,
                });
            llamadasReales++;
            consultados++;
            const documentos = getDocumentos(resultado);
            if (documentos.length >
                0) {
                conDatos++;
                console.log(`   ✅ GUARDADO | ${documentos.length} documentos`);
            }
            else {
                sinDatos++;
                console.log("   ℹ️ GUARDADO | 0 documentos");
            }
            await sleep(DELAY_MS);
        }
        catch (error) {
            errores++;
            console.error(`❌ ${periodo.periodo}`, error instanceof
                Error
                ? error.message
                : error);
            /*
             * Si falla un mes no abortamos
             * todo el backfill.
             */
            if (!DRY_RUN) {
                await sleep(DELAY_MS);
            }
        }
    }
    console.log("");
    console.log("============================================");
    console.log("          RESULTADO BACKFILL RCV");
    console.log("============================================");
    console.log({
        modo: DRY_RUN
            ? "SIMULACION"
            : "REAL",
        empresa,
        tipo,
        periodosAnalizados: periodos.length,
        cacheExistente: existentes,
        faltantes,
        consultados,
        llamadasReales,
        conDatos,
        sinDatos,
        errores,
    });
    console.log("============================================");
    if (DRY_RUN) {
        console.log("");
        console.log("ℹ️ SIMULACIÓN FINALIZADA.");
        console.log("No se realizaron consultas a BaseAPI ni modificaciones en cache.");
    }
}
/* =========================================================
   EJECUCIÓN
========================================================= */
main()
    .catch(error => {
    console.error("❌ Error fatal:", error);
    process.exitCode =
        1;
})
    .finally(async () => {
    await prisma
        .$disconnect();
});
//# sourceMappingURL=backfill-rcv-historico.js.map