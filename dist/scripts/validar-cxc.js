// src/scripts/validar-cxc.ts
//
// Valida el servicio de cuentas por cobrar contra Duemint. SOLO LECTURA.
//
//   npx tsx src/scripts/validar-cxc.ts rids [--detalle] [--sii] [--desde=AAAA] [--csv] [--verbose]
//
//   --detalle  lista documentos abiertos, pagos del mes y conciliadas sin documento
//   --sii      permite consultar BaseAPI por NC/ND sin XML en cache (guarda en FacturaDTE)
//   --desde    solo caches RCV desde ese año
//   --csv      escribe "Claude outputs/cxc-<empresa>-<fecha>.csv" (carpeta ignorada por git)
//   --verbose  muestra los logs de notas de crédito
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { obtenerResumenCxc, } from "../service/baseapi/finanzas/cxc-documentos.service.js";
/* =========================================================
   ARGUMENTOS
   ========================================================= */
const args = process.argv.slice(2);
const empresa = (args.find((a) => !a.startsWith("--")) ?? "rids").toLowerCase();
const detalle = args.includes("--detalle");
const consultaSii = args.includes("--sii");
const csv = args.includes("--csv");
const verbose = args.includes("--verbose");
const desdeArg = args.find((a) => a.startsWith("--desde="))?.split("=")[1];
const desdeAno = desdeArg ? Number(desdeArg) : undefined;
if (empresa !== "rids" && empresa !== "econnet") {
    console.error("Empresa inválida. Usa: rids | econnet");
    process.exit(1);
}
if (desdeAno !== undefined && !Number.isInteger(desdeAno)) {
    console.error("--desde debe ser un año (AAAA)");
    process.exit(1);
}
/* =========================================================
   REFERENCIA DUEMINT (pantalla del 17-11-2026)
   ========================================================= */
const DUEMINT = {
    rids: {
        fecha: "17-11-2026",
        pagosMes: [9_578_757, 8],
        porVencer: [12_356_856, 17],
        vencido: [21_650_581, 36],
        total: [34_007_437, 53],
        tramos: {
            AL_DIA: [12_356_856, 17],
            "1_30": [9_820_000, 13],
            "31_60": [5_920_000, 9],
            "61_90": [3_450_000, 6],
            MAS_90: [2_460_000, 8],
        },
    },
    // Export Duemint 18-11-2026. Incluye 33-454 (pagado parcial: 9.000 por pagar) en el total.
    econnet: {
        fecha: "18-11-2026",
        pagosMes: [18_202_691, 6],
        porVencer: [17_300_220, 3],
        vencido: [13_188_062, 37],
        total: [30_497_282, 41],
        tramos: {
            AL_DIA: [17_300_220, 3],
            "1_30": [3_993_391, 10],
            "31_60": [2_798_247, 3],
            "61_90": [0, 0],
            MAS_90: [6_396_424, 24],
        },
    },
};
/* =========================================================
   FORMATO
   ========================================================= */
const clp = (n) => n.toLocaleString("es-CL");
const col = (texto, ancho) => String(texto).padEnd(ancho).slice(0, ancho);
const der = (texto, ancho) => String(texto).padStart(ancho).slice(-ancho);
function fila(concepto, monto, docs, ref) {
    const base = `${col(concepto, 22)} ${der(clp(monto), 14)} ${der(docs, 5)}`;
    if (!ref)
        return base;
    const difMonto = monto - ref[0];
    const difDocs = docs - ref[1];
    const ok = Math.abs(difMonto) < 1_000 && difDocs === 0 ? "OK" : "≠";
    return `${base}   | ${der(clp(ref[0]), 14)} ${der(ref[1], 5)}   | ${der(clp(difMonto), 12)} ${der(difDocs, 4)}  ${ok}`;
}
function documentoLinea(d) {
    return [
        col(`${d.tipoDoc}-${d.folio}`, 10),
        col(d.rutContraparte, 11),
        col(d.razonSocial ?? "", 28),
        col(d.fechaEmision ?? "", 10),
        col(d.fechaVencimiento ?? "sin fecha", 10),
        col(d.origenVencimiento, 17),
        der(d.diasDiferencia ?? "", 5),
        der(clp(d.saldo), 12),
        d.montoNotasCredito > 0 ? ` (NC ${clp(d.montoNotasCredito)})` : "",
    ].join(" ");
}
function csvEscapar(valor) {
    const texto = String(valor ?? "");
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
/* =========================================================
   MAIN
   ========================================================= */
async function main() {
    const logOriginal = console.log;
    if (!verbose)
        console.log = () => undefined;
    let resumen;
    try {
        resumen = await obtenerResumenCxc({
            empresaKey: empresa,
            consultaSii,
            ...(desdeAno !== undefined ? { desdeAno } : {}),
        });
    }
    finally {
        console.log = logOriginal;
    }
    const { tarjetas, antiguedad, diagnostico, documentos, hoy } = resumen;
    const ref = DUEMINT[empresa];
    console.log(`\n=== CxC ${empresa.toUpperCase()} · hoy ${hoy}${ref ? ` · Duemint ${ref.fecha}` : ""} ===\n`);
    console.log(`${col("Concepto", 22)} ${der("CRM", 14)} ${der("Docs", 5)}${ref ? `   | ${der("Duemint", 14)} ${der("Docs", 5)}   | ${der("Diferencia", 12)} ${der("Docs", 4)}` : ""}`);
    console.log(fila("Pagos del mes", tarjetas.pagosMes.monto, tarjetas.pagosMes.documentos, ref?.pagosMes));
    console.log(fila("Por vencer", tarjetas.porVencer.monto, tarjetas.porVencer.documentos, ref?.porVencer));
    console.log(fila("Vencido", tarjetas.vencido.monto, tarjetas.vencido.documentos, ref?.vencido));
    console.log(fila("Sin vencimiento", tarjetas.sinVencimiento.monto, tarjetas.sinVencimiento.documentos));
    console.log(fila("Total abierto", tarjetas.total.monto, tarjetas.total.documentos, ref?.total));
    console.log("\nAntigüedad");
    for (const tramo of antiguedad) {
        // Duemint redondea los tramos a decenas de miles en pantalla: se compara solo la cantidad.
        const r = ref?.tramos[tramo.tramo] ?? (ref ? [0, 0] : undefined);
        const base = `${col(tramo.etiqueta, 22)} ${der(clp(tramo.monto), 14)} ${der(tramo.documentos, 5)}`;
        console.log(r ? `${base}   | ${der(clp(r[0]), 14)} ${der(r[1], 5)}   | docs ${der(tramo.documentos - r[1], 4)}` : base);
    }
    console.log("\nDiagnóstico");
    const p = diagnostico.periodosLeidos;
    console.log(`  Periodos RCV leídos:        ${p.length} (${p[0] ?? "-"} → ${p[p.length - 1] ?? "-"})`);
    console.log(`  Documentos RCV:             ${diagnostico.documentosRcv} (duplicados omitidos ${diagnostico.duplicadosOmitidos})`);
    console.log(`  Cobrables (33/34/56):       ${diagnostico.documentosCobrables} (ND solo reversa omitidas ${diagnostico.ndSoloReversa})`);
    console.log(`  NC en RCV / facturas con NC: ${diagnostico.notasCreditoEnRcv} / ${diagnostico.facturasConNc} (compensados ${diagnostico.compensados})${consultaSii ? "" : "  ← si faltan, probar --sii"}`);
    console.log(`  Conciliadas BD / emparejadas: ${diagnostico.conciliadasEnBd} / ${diagnostico.conciliadasEmparejadas}`);
    console.log(`  NC inferidas (RUT + monto): ${diagnostico.ncInferidas.length}${diagnostico.ncInferidas.length > 0 ? `  → ${diagnostico.ncInferidas.map((i) => `${i.nc}→${i.factura}`).join(" · ")}` : ""}`);
    console.log(`  NC sin aplicar:             ${diagnostico.ncSinAplicar.length}${diagnostico.ncSinAplicar.length > 0 ? "  (detalle con --detalle)" : ""}`);
    console.log(`  Abiertos sin vencimiento:   ${diagnostico.sinVencimiento}`);
    console.log(`  Con plazo de la empresa:    ${diagnostico.plazoEmpresa}`);
    console.log(`  Origen del vencimiento:     ${Object.entries(diagnostico.origenVencimiento).map(([k, v]) => `${k} ${v}`).join(" · ") || "-"}`);
    const desfase = p.length > 0 && p[p.length - 1] !== hoy.slice(0, 7);
    if (desfase)
        console.log(`  ⚠ El último periodo en cache no es el mes actual (${hoy.slice(0, 7)}).`);
    if (detalle) {
        const abiertos = documentos
            .filter((d) => d.estado === "VENCIDO" || d.estado === "PENDIENTE")
            .sort((a, b) => (b.diasDiferencia ?? -9999) - (a.diasDiferencia ?? -9999));
        console.log(`\nDocumentos abiertos (${abiertos.length})`);
        console.log(`${col("Doc", 10)} ${col("RUT", 11)} ${col("Razón social", 28)} ${col("Emisión", 10)} ${col("Vence", 10)} ${col("Origen venc.", 17)} ${der("Días", 5)} ${der("Saldo", 12)}`);
        for (const d of abiertos)
            console.log(documentoLinea(d));
        const mes = hoy.slice(0, 7);
        const pagos = documentos.filter((d) => d.estado === "PAGADO" && d.pagadoAt?.startsWith(mes));
        console.log(`\nPagos del mes (${pagos.length})`);
        for (const d of pagos) {
            console.log(`${col(`${d.tipoDoc}-${d.folio}`, 10)} ${col(d.razonSocial ?? "", 28)} ${col(d.pagadoAt ?? "", 10)} ${col(d.formaPago ?? "", 12)} ${der(clp(d.saldo), 12)}`);
        }
        if (diagnostico.ncSinAplicar.length > 0) {
            console.log(`\nNC sin aplicar (${diagnostico.ncSinAplicar.length}) — sin XML en BaseAPI, anulada por una ND o referencia no soportada`);
            console.log(`${col("NC", 8)} ${col("Emisión", 10)} ${col("RUT", 11)} ${col("Razón social", 28)} ${der("Monto", 12)}  Facturas abiertas del mismo RUT y monto`);
            for (const nc of diagnostico.ncSinAplicar) {
                // Pista: facturas abiertas del mismo cliente con el mismo monto (posible factura anulada).
                const candidatas = documentos
                    .filter((d) => (d.estado === "VENCIDO" || d.estado === "PENDIENTE") && d.rutContraparte === nc.rut && d.saldo === nc.monto)
                    .map((d) => `${d.tipoDoc}-${d.folio}`);
                console.log(`${col(`61-${nc.folio}`, 8)} ${col(nc.fechaEmision ?? nc.periodo, 10)} ${col(nc.rut, 11)} ${col(nc.razonSocial ?? "", 28)} ${der(clp(nc.monto), 12)}  ${candidatas.join(", ") || "-"}`);
            }
        }
        if (diagnostico.conciliadasSinDocumento.length > 0) {
            console.log(`\nConciliadas sin documento en los caches (tipo|folio|rut, máx. 50)`);
            console.log(`  ${diagnostico.conciliadasSinDocumento.join("\n  ")}`);
        }
    }
    if (csv) {
        const carpeta = path.resolve(process.cwd(), "Claude outputs");
        mkdirSync(carpeta, { recursive: true });
        const archivo = path.join(carpeta, `cxc-${empresa}-${hoy}.csv`);
        const cabecera = ["tipoDoc", "folio", "rut", "razonSocial", "periodo", "emision", "vencimiento", "origenVencimiento", "dias", "tramo", "estado", "montoOriginal", "montoNC", "saldo", "pagadoAt", "formaPago"];
        const filas = documentos.map((d) => [d.tipoDoc, d.folio, d.rutContraparte, d.razonSocial, d.periodo, d.fechaEmision, d.fechaVencimiento, d.origenVencimiento, d.diasDiferencia, d.tramo, d.estado, d.montoOriginal, d.montoNotasCredito, d.saldo, d.pagadoAt, d.formaPago]
            .map(csvEscapar)
            .join(";"));
        // BOM para que Excel abra bien las tildes.
        writeFileSync(archivo, `﻿${[cabecera.join(";"), ...filas].join("\r\n")}`, "utf8");
        console.log(`\nCSV: ${archivo} (${filas.length} documentos)`);
    }
    console.log("");
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=validar-cxc.js.map