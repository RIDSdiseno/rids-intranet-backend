// src/scripts/simular-cobranza-cxc.ts
//
// Simula la preparación de recordatorios automáticos (Fase 5a). SOLO LECTURA:
// no registra recordatorios, no envía correos y no refresca el RCV.
//
//   npx tsx src/scripts/simular-cobranza-cxc.ts rids|econnet [--comparar] [--verbose]
//
//   --comparar  ejecuta también la lógica anterior (LEGACY, 12 meses) y muestra las diferencias
//   --verbose   muestra los logs internos de la cobranza

import "dotenv/config";

import { prisma } from "../lib/prisma.js";

import {
    procesarCobranzaAutomatica,
    SALDO_MINIMO_COBRANZA_AUTO,
    MAX_DIAS_VENCIDA_COBRANZA_AUTO,
    type CandidatoRecordatorioCobranza,
} from "../service/baseapi/cobranza/cobranza-automatico.service.js";

const args = process.argv.slice(2);
const empresa = (args.find((a) => !a.startsWith("--")) ?? "rids").toLowerCase();
const comparar = args.includes("--comparar");
const verbose = args.includes("--verbose");

if (empresa !== "rids" && empresa !== "econnet") {
    console.error("Empresa inválida. Usa: rids | econnet");
    process.exit(1);
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const clave = (c: CandidatoRecordatorioCobranza) => `${c.tipoDoc}-${c.folio}`;

async function silencioso<T>(fn: () => Promise<T>): Promise<T> {
    if (verbose) return fn();

    const log = console.log;
    const warn = console.warn;
    console.log = () => { };
    console.warn = () => { };

    try {
        return await fn();
    } finally {
        console.log = log;
        console.warn = warn;
    }
}

async function main() {
    const cxc = await silencioso(() =>
        procesarCobranzaAutomatica({ empresas: [empresa as "rids" | "econnet"], registrarPendientes: false, refrescarRcv: false, motor: "CXC" }),
    );

    const r = cxc.empresas[0];

    if (!r) throw new Error("Sin resultado");

    console.log(`\n=== Cobranza automática ${empresa.toUpperCase()} · núcleo CxC (simulación) ===`);
    console.log(`Config: activa=${r.activa} envioAutomatico=${r.envioAutomatico}${r.error ? ` · ERROR: ${r.error}` : ""}`);
    console.log(
        `Documentos: ${r.documentosAnalizados} · pagados/compensados: ${r.confirmadosOmitidos} · sin vencimiento: ${r.sinFechaVencimiento} · saldo mínimo: ${clp(SALDO_MINIMO_COBRANZA_AUTO)} · tope: ${MAX_DIAS_VENCIDA_COBRANZA_AUTO} días vencida`,
    );
    console.log(
        `Recordatorios hoy: ${r.candidatos} · con destinatario: ${r.candidatosConDestinatario} · sin destinatario: ${r.candidatosSinDestinatario} · ya enviados: ${r.yaEnviados} · por enviar: ${r.pendientesEnvio}\n`,
    );

    console.table(
        r.detalle.map((c) => ({
            doc: clave(c),
            cliente: (c.razonSocial ?? c.rutContraparte).slice(0, 32),
            saldo: clp(c.montoPendiente),
            vence: c.fechaVencimiento,
            dias: c.diasDiferencia,
            etapa: c.tipoRecordatorio,
            origen: c.origenVencimiento,
            correos: c.destinatarios.length,
            yaEnviado: c.yaEnviado,
        })),
    );

    if (!comparar) return;

    const legacy = await silencioso(() =>
        procesarCobranzaAutomatica({ empresas: [empresa as "rids" | "econnet"], registrarPendientes: false, motor: "LEGACY", mesesAnalizar: 12 }),
    );

    const viejos = new Map((legacy.empresas[0]?.detalle ?? []).map((c) => [clave(c), c]));
    const nuevos = new Map(r.detalle.map((c) => [clave(c), c]));

    const filas: Record<string, string | number>[] = [];

    for (const [k, n] of nuevos) {
        const v = viejos.get(k);
        if (!v) filas.push({ doc: k, cambio: "Solo núcleo", etapa: n.tipoRecordatorio, saldoNuevo: clp(n.montoPendiente) });
        else if (v.montoPendiente !== n.montoPendiente || v.tipoRecordatorio !== n.tipoRecordatorio)
            filas.push({
                doc: k,
                cambio: "Distinto",
                etapa: `${v.tipoRecordatorio} → ${n.tipoRecordatorio}`,
                saldoViejo: clp(v.montoPendiente),
                saldoNuevo: clp(n.montoPendiente),
            });
    }

    for (const [k, v] of viejos) {
        if (!nuevos.has(k)) filas.push({ doc: k, cambio: "Solo lógica anterior", etapa: v.tipoRecordatorio, saldoViejo: clp(v.montoPendiente) });
    }

    console.log(`\n=== Diferencias con la lógica anterior (LEGACY: ${legacy.empresas[0]?.candidatos ?? 0} recordatorios) ===`);

    if (filas.length === 0) console.log("Sin diferencias.");
    else console.table(filas);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit();
    });