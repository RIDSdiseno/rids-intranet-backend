// src/scripts/probar-cobranza-consolidado.ts
//
// Prueba del correo consolidado de cobranza (Fase 5b). NO toca RcvRecordatorioEnvio.
//
//   npx tsx src/scripts/probar-cobranza-consolidado.ts rids|econnet [--rut=76123456K] [--pdf] [--enviar --para=correo@rids.cl]
//
//   sin --rut   usa los grupos de HOY (simulación de la 5a): mismo cliente + mismo correo con 2 o más facturas
//   --rut       arma el correo con todas las facturas abiertas del cliente (saldo >= mínimo), aunque hoy no les toque
//   --pdf       genera y adjunta los PDF (consulta BaseAPI si el DTE no está en caché)
//   --enviar    envía el correo SOLO a --para (fuerza COBRANZA_TEST_EMAIL en este proceso)
//
// Sin --enviar escribe "Claude outputs/cobranza-consolidado-<empresa>-<rut>.html" para abrirlo en el navegador.

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";

import path from "node:path";

import { prisma } from "../lib/prisma.js";

import { graphFinanzasService } from "../service/baseapi/graph-finanzas.service.js";

import { generarDtePdfBuffer } from "../service/baseapi/baseapi-dte-pdf.service.js";

import { obtenerCalculo } from "../controllers/baseapi/baseapi-finanzas-cxc.controller.js";

import {
    procesarCobranzaAutomatica,
    SALDO_MINIMO_COBRANZA_AUTO,
} from "../service/baseapi/cobranza/cobranza-automatico.service.js";

import {
    enviarCorreoCobranzaConsolidado,
    nombreDocumentoCobranza,
    type FacturaCorreoCobranza,
} from "../service/baseapi/cobranza/cobranza-email.service.js";

const args = process.argv.slice(2);
const empresa = (args.find((a) => !a.startsWith("--")) ?? "rids").toLowerCase();
const rutArg = args.find((a) => a.startsWith("--rut="))?.split("=")[1]?.replace(/[^0-9kK]/g, "").toUpperCase();
const para = args.find((a) => a.startsWith("--para="))?.split("=")[1]?.trim().toLowerCase();
const conPdf = args.includes("--pdf");
const enviar = args.includes("--enviar");

if (empresa !== "rids" && empresa !== "econnet") {
    console.error("Empresa inválida. Usa: rids | econnet");
    process.exit(1);
}

if (enviar && !para) {
    console.error("--enviar requiere --para=correo@dominio");
    process.exit(1);
}

const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, "").toUpperCase();

type Grupo = {
    rut: string;
    razonSocial: string | null;
    email: string;
    nombre: string | null;
    facturas: (FacturaCorreoCobranza & { periodo: string })[];
};

async function silencioso<T>(fn: () => Promise<T>): Promise<T> {
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
    const empresaKey = empresa as "rids" | "econnet";
    const { data } = await silencioso(() => obtenerCalculo(empresaKey, true));

    const abiertos = data.documentos.filter((d) => d.estado === "PENDIENTE" || d.estado === "VENCIDO");

    let grupo: Grupo | undefined;

    if (rutArg) {
        const docs = abiertos.filter(
            (d) => normalizarRut(d.rutContraparte) === rutArg && d.saldo >= SALDO_MINIMO_COBRANZA_AUTO && d.fechaVencimiento && d.diasDiferencia !== null,
        );

        if (docs.length === 0) throw new Error(`El RUT ${rutArg} no tiene facturas abiertas sobre el mínimo`);

        grupo = {
            rut: rutArg,
            razonSocial: docs[0]?.razonSocial ?? null,
            email: para ?? "cliente@ejemplo.cl",
            nombre: null,
            facturas: docs.map((d) => ({
                tipoDoc: d.tipoDoc,
                folio: d.folio,
                fechaVencimiento: d.fechaVencimiento as string,
                diasDiferencia: d.diasDiferencia as number,
                saldo: d.saldo,
                periodo: d.periodo,
            })),
        };
    } else {
        const simulacion = await silencioso(() =>
            procesarCobranzaAutomatica({ empresas: [empresaKey], registrarPendientes: false, refrescarRcv: false }),
        );

        const grupos = new Map<string, Grupo>();

        for (const c of simulacion.empresas[0]?.detalle ?? []) {
            for (const d of c.destinatarios) {
                const clave = `${normalizarRut(c.rutContraparte)}|${d.email.toLowerCase()}`;
                const g = grupos.get(clave) ?? {
                    rut: normalizarRut(c.rutContraparte),
                    razonSocial: c.razonSocial,
                    email: d.email.toLowerCase(),
                    nombre: d.nombre,
                    facturas: [],
                };

                g.facturas.push({
                    tipoDoc: c.tipoDoc,
                    folio: c.folio,
                    fechaVencimiento: c.fechaVencimiento,
                    diasDiferencia: c.diasDiferencia,
                    saldo: c.montoPendiente,
                    periodo: c.periodoOrigen,
                });

                grupos.set(clave, g);
            }
        }

        const consolidados = [...grupos.values()].filter((g) => g.facturas.length > 1);

        console.log(`\nGrupos de hoy en ${empresa.toUpperCase()}: ${grupos.size} · consolidados (2 o más facturas): ${consolidados.length}`);

        for (const g of consolidados) {
            console.log(`  - ${g.razonSocial ?? g.rut} <${g.email}>: ${g.facturas.map((f) => `${f.tipoDoc}-${f.folio}`).join(", ")}`);
        }

        grupo = consolidados[0];

        if (!grupo) {
            console.log("\nHoy no hay clientes con 2 o más facturas en etapa. Usa --rut=<RUT> para probar con un cliente.");
            return;
        }
    }

    const abiertosCliente = abiertos.filter((d) => normalizarRut(d.rutContraparte) === grupo.rut);

    const adjuntos: { filename: string; content: Buffer }[] = [];
    const documentosSinAdjunto: string[] = [];

    if (conPdf) {
        for (const f of grupo.facturas) {
            try {
                const pdf = await silencioso(() =>
                    generarDtePdfBuffer({ empresa: empresaKey, periodo: f.periodo, folio: f.folio, tipoDTE: f.tipoDoc, forceRefresh: false }),
                );
                adjuntos.push({ filename: pdf.filename, content: pdf.buffer });
            } catch (error) {
                console.warn(`PDF ${f.tipoDoc}-${f.folio}: ${error instanceof Error ? error.message : String(error)}`);
                documentosSinAdjunto.push(nombreDocumentoCobranza(f.tipoDoc, f.folio));
            }
        }
    }

    let html = "";

    if (enviar) {
        process.env.COBRANZA_TEST_EMAIL = para;
    } else {
        // Captura el correo en vez de enviarlo.
        process.env.COBRANZA_TEST_EMAIL = "sin-envio@local";
        (graphFinanzasService as unknown as { sendMail: (p: { bodyHtml: string }) => Promise<unknown> }).sendMail = async (p) => {
            html = p.bodyHtml;
            return {};
        };
    }

    const resultado = await enviarCorreoCobranzaConsolidado({
        empresaKey,
        emailDestino: grupo.email,
        nombreDestino: grupo.nombre,
        razonSocial: grupo.razonSocial,
        facturas: grupo.facturas.map(({ periodo: _periodo, ...f }) => f),
        totalCliente: {
            saldo: abiertosCliente.reduce((total, d) => total + d.saldo, 0),
            documentos: abiertosCliente.length,
        },
        adjuntos,
        documentosSinAdjunto,
    });

    if (!resultado.ok) throw new Error(resultado.error ?? "Error enviando");

    console.log(
        `\nCliente: ${grupo.razonSocial ?? grupo.rut} · facturas: ${grupo.facturas.length} · PDF: ${adjuntos.length} (${Math.round(adjuntos.reduce((t, a) => t + a.content.length, 0) / 1024)} KB)`,
    );

    if (enviar) {
        console.log(`Enviado SOLO a ${para}.`);
        return;
    }

    const carpeta = path.resolve("Claude outputs");
    mkdirSync(carpeta, { recursive: true });

    const archivo = path.join(carpeta, `cobranza-consolidado-${empresa}-${grupo.rut}.html`);
    writeFileSync(archivo, html, "utf8");

    console.log(`Vista previa: ${archivo} (el logo no se ve fuera del correo: es una imagen inline)`);
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