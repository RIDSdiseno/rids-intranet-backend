// src/service/baseapi/cobranza/cobranza-envio.service.ts
import { prisma, } from "../../../lib/prisma.js";
import { enviarCorreoCobranza, construirAsuntoCobranza, enviarCorreoCobranzaConsolidado, construirAsuntoCobranzaConsolidado, nombreDocumentoCobranza, } from "./cobranza-email.service.js";
import { generarDtePdfBuffer, } from "../baseapi-dte-pdf.service.js";
import { buscarDocumentoCxc, obtenerCalculo, } from "../../../controllers/baseapi/baseapi-finanzas-cxc.controller.js";
import { SALDO_MINIMO_COBRANZA_AUTO, } from "./cobranza-automatico.service.js";
/* =========================================================
   CONFIGURACIÓN WORKER
========================================================= */
/*
 * Un registro PROCESANDO durante más de este tiempo
 * se considera abandonado.
 *
 * Puede ocurrir por:
 *
 * - reinicio de Railway
 * - cierre inesperado del proceso
 * - excepción no controlada
 * - caída de conexión
 */
const MINUTOS_PROCESANDO_TIMEOUT = 15;
const MAX_INTENTOS = 3;
/* =========================================================
   FASE 5a · REVISIÓN JUSTO ANTES DE ENVIAR
========================================================= */
function fechaChileIsoEnvio(fecha) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(fecha);
}
/**
 * - Solo se envía lo preparado hoy (lo antiguo se cancela para no
 *   mandar montos o etapas viejas).
 * - Se vuelve a leer el documento en el núcleo: si se pagó, se
 *   compensó o quedó bajo el mínimo, se cancela; si no, se envía
 *   con el saldo actual.
 */
async function revisarRecordatorioAntesDeEnviar(recordatorio, empresasRefrescadas) {
    const hoy = fechaChileIsoEnvio(new Date());
    const preparado = fechaChileIsoEnvio(recordatorio.createdAt);
    if (preparado !== hoy) {
        return {
            enviar: false,
            motivo: `Preparado el ${preparado} y no enviado ese día; se descarta para no enviar datos antiguos.`,
        };
    }
    const empresaKey = recordatorio.empresaKey;
    if (!empresasRefrescadas.has(empresaKey)) {
        await obtenerCalculo(empresaKey, true);
        empresasRefrescadas.add(empresaKey);
    }
    const { documento, } = await buscarDocumentoCxc({
        empresa: empresaKey,
        tipoDoc: recordatorio.tipoDoc,
        folio: recordatorio.folio,
        rutContraparte: recordatorio.rutContraparte,
    });
    if (!documento) {
        return {
            enviar: false,
            motivo: "El documento no aparece en cuentas por cobrar.",
        };
    }
    if (documento.estado === "PAGADO") {
        return {
            enviar: false,
            motivo: "Factura pagada antes del envío.",
        };
    }
    if (documento.estado === "COMPENSADO") {
        return {
            enviar: false,
            motivo: "Factura compensada con nota de crédito.",
        };
    }
    if (documento.saldo < SALDO_MINIMO_COBRANZA_AUTO) {
        return {
            enviar: false,
            motivo: `Saldo ${documento.saldo} bajo el mínimo de cobranza automática (${SALDO_MINIMO_COBRANZA_AUTO}).`,
        };
    }
    return {
        enviar: true,
        saldo: documento.saldo,
    };
}
/* =========================================================
   HELPERS
========================================================= */
function fechaDateToIso(value) {
    if (!value) {
        return null;
    }
    if (Number.isNaN(value.getTime())) {
        return null;
    }
    return [
        value
            .getUTCFullYear(),
        String(value.getUTCMonth() +
            1).padStart(2, "0"),
        String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
}
function fechaDateToPeriodo(value) {
    if (!value ||
        Number.isNaN(value.getTime())) {
        return null;
    }
    return [
        value
            .getUTCFullYear(),
        String(value.getUTCMonth() +
            1).padStart(2, "0"),
    ].join("-");
}
async function resolverPeriodoDte(empresaKey, tipoDoc, folio, fechaVencimiento) {
    const tipoDTE = Number(tipoDoc);
    const folioInt = Number(folio);
    if (Number.isFinite(tipoDTE) &&
        Number.isFinite(folioInt)) {
        const factura = await prisma.facturaDTE.findFirst({
            where: {
                empresaAlias: empresaKey,
                tipoDTE,
                folio: folioInt,
            },
            select: {
                fechaEmision: true,
            },
        });
        const periodoFactura = fechaDateToPeriodo(factura
            ?.fechaEmision ??
            null);
        if (periodoFactura) {
            return periodoFactura;
        }
    }
    /*
     * Fallback.
     *
     * Normalmente no se utilizará porque los DTE
     * de cobranza ya están cacheados.
     */
    const periodoVencimiento = fechaDateToPeriodo(fechaVencimiento);
    if (periodoVencimiento) {
        console.warn("[COBRANZA ENVÍO] ⚠️ Período DTE inferido desde vencimiento", {
            empresa: empresaKey,
            tipoDoc,
            folio,
            periodo: periodoVencimiento,
        });
        return periodoVencimiento;
    }
    throw new Error(`No fue posible determinar el período del DTE ${tipoDoc}-${folio}`);
}
/* =========================================================
   RECUPERAR REGISTROS ATASCADOS
========================================================= */
async function recuperarRecordatoriosAtascados(empresa, limite = 100) {
    const ahora = new Date();
    const fechaLimite = new Date(ahora.getTime() -
        MINUTOS_PROCESANDO_TIMEOUT *
            60 *
            1000);
    const candidatos = await prisma.rcvRecordatorioEnvio.findMany({
        where: {
            ...(empresa
                ? {
                    empresaKey: empresa,
                }
                : {}),
            estado: "PROCESANDO",
            enviadoAt: null,
            procesandoAt: {
                lt: fechaLimite,
            },
        },
        select: {
            id: true,
        },
        orderBy: [
            {
                procesandoAt: "asc",
            },
            {
                id: "asc",
            },
        ],
        take: Math.max(1, Math.min(limite, 100)),
    });
    const idsRecuperados = [];
    for (const candidato of candidatos) {
        const resultado = await prisma.rcvRecordatorioEnvio.updateMany({
            where: {
                id: candidato.id,
                estado: "PROCESANDO",
                enviadoAt: null,
                procesandoAt: {
                    lt: fechaLimite,
                },
            },
            data: {
                estado: "ERROR",
                procesandoAt: null,
                error: `Proceso abandonado: permaneció en PROCESANDO más de ${MINUTOS_PROCESANDO_TIMEOUT} minutos`,
            },
        });
        if (resultado.count ===
            1) {
            idsRecuperados.push(candidato.id);
        }
    }
    if (idsRecuperados.length >
        0) {
        console.warn("[COBRANZA ENVÍO] ♻️ Recordatorios recuperados", {
            total: idsRecuperados.length,
            ids: idsRecuperados,
            empresa: empresa ??
                "todas",
        });
    }
    return idsRecuperados;
}
/* =========================================================
   CLAIM ATÓMICO
========================================================= */
async function intentarTomarRecordatorio(id) {
    /*
     * El updateMany funciona como un lock lógico.
     *
     * Solo un worker puede pasar:
     *
     * PENDIENTE / ERROR
     *        ↓
     * PROCESANDO
     */
    const ahora = new Date();
    const resultado = await prisma.rcvRecordatorioEnvio.updateMany({
        where: {
            id,
            estado: {
                in: [
                    "PENDIENTE",
                    "ERROR",
                ],
            },
            enviadoAt: null,
            intentos: {
                lt: MAX_INTENTOS,
            },
        },
        data: {
            estado: "PROCESANDO",
            procesandoAt: ahora,
            ultimoIntentoAt: ahora,
            intentos: {
                increment: 1,
            },
            error: null,
        },
    });
    return (resultado.count ===
        1);
}
/* =========================================================
   FASE 5b · CORREO CONSOLIDADO (empresa + RUT + correo)
========================================================= */
/** Tope de PDF por correo consolidado (Graph acepta ~4 MB por mensaje y el base64 suma ~33 %). */
const MAX_PDF_CONSOLIDADO = 10;
const MAX_BYTES_PDF_CONSOLIDADO = 2_500_000;
function claveGrupoEnvio(recordatorio) {
    return [
        recordatorio.empresaKey,
        recordatorio.rutContraparte.replace(/[^0-9kK]/g, "").toUpperCase(),
        recordatorio.emailDestino.trim().toLowerCase(),
    ].join("|");
}
async function generarPdfRecordatorio(recordatorio) {
    const empresaKey = recordatorio.empresaKey;
    const periodo = await resolverPeriodoDte(empresaKey, recordatorio.tipoDoc, recordatorio.folio, recordatorio.fechaVencimiento);
    const pdf = await generarDtePdfBuffer({
        empresa: empresaKey,
        periodo,
        folio: recordatorio.folio,
        tipoDTE: recordatorio.tipoDoc,
        forceRefresh: false,
    });
    return {
        filename: pdf.filename,
        content: pdf.buffer,
    };
}
/**
 * Procesa un grupo de 2 o más recordatorios del mismo cliente y destinatario.
 * Cada factura pasa por la revisión de la Fase 5a; si queda una sola,
 * se envía con el correo individual de siempre.
 */
async function procesarGrupoConsolidado(grupo, empresasRefrescadas) {
    const resultado = {
        procesados: 0,
        enviados: 0,
        errores: 0,
        omitidos: 0,
    };
    const tomados = [];
    for (const recordatorio of grupo) {
        if (await intentarTomarRecordatorio(recordatorio.id)) {
            tomados.push(recordatorio);
        }
        else {
            resultado.omitidos++;
        }
    }
    const primero = tomados[0];
    if (!primero) {
        return resultado;
    }
    resultado.procesados += tomados.length;
    const empresaKey = primero.empresaKey;
    const vigentes = [];
    try {
        const config = await prisma.rcvCobranzaConfig.findUnique({
            where: {
                empresaKey,
            },
        });
        if (!config || !config.activo) {
            await prisma.rcvRecordatorioEnvio.updateMany({
                where: {
                    id: { in: tomados.map((r) => r.id) },
                },
                data: {
                    estado: "CANCELADO",
                    procesandoAt: null,
                    error: "Automatización de cobranza desactivada",
                },
            });
            resultado.errores += tomados.length;
            return resultado;
        }
        /*
         * 1. Revisión de cada factura contra el núcleo (Fase 5a).
         */
        for (const recordatorio of tomados) {
            const fechaVencimiento = fechaDateToIso(recordatorio.fechaVencimiento);
            if (!fechaVencimiento) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: { id: recordatorio.id },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: "Recordatorio sin fecha de vencimiento válida",
                    },
                });
                resultado.errores++;
                continue;
            }
            const revision = await revisarRecordatorioAntesDeEnviar(recordatorio, empresasRefrescadas);
            if (!revision.enviar) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: { id: recordatorio.id },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: revision.motivo,
                    },
                });
                console.log("[COBRANZA ENVÍO] ⏭ Recordatorio cancelado", {
                    id: recordatorio.id,
                    folio: recordatorio.folio,
                    motivo: revision.motivo,
                });
                resultado.omitidos++;
                continue;
            }
            vigentes.push({
                recordatorio,
                saldo: revision.saldo,
                fechaVencimiento,
            });
        }
        if (vigentes.length === 0) {
            return resultado;
        }
        vigentes.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
        /*
         * 2. PDF con tope (cantidad y tamaño). Un PDF que falla no
         * bloquea el correo: se informa como no adjunto.
         */
        const adjuntos = [];
        const documentosSinAdjunto = [];
        let bytesAdjuntos = 0;
        if (config.adjuntarPdf) {
            for (const v of vigentes) {
                const nombre = nombreDocumentoCobranza(v.recordatorio.tipoDoc, v.recordatorio.folio);
                if (adjuntos.length >= MAX_PDF_CONSOLIDADO) {
                    documentosSinAdjunto.push(nombre);
                    continue;
                }
                try {
                    const pdf = await generarPdfRecordatorio(v.recordatorio);
                    if (bytesAdjuntos + pdf.content.length > MAX_BYTES_PDF_CONSOLIDADO) {
                        documentosSinAdjunto.push(nombre);
                        continue;
                    }
                    adjuntos.push(pdf);
                    bytesAdjuntos += pdf.content.length;
                }
                catch (error) {
                    console.error("[COBRANZA ENVÍO] ⚠ No se pudo generar el PDF", {
                        id: v.recordatorio.id,
                        folio: v.recordatorio.folio,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    documentosSinAdjunto.push(nombre);
                }
            }
        }
        /*
         * 3. Enviar: una factura → correo individual; varias → consolidado.
         */
        let envio;
        let asunto;
        const unico = vigentes.length === 1 ? vigentes[0] : undefined;
        if (unico) {
            const adjuntoPdf = adjuntos[0];
            envio =
                await enviarCorreoCobranza({
                    empresaKey,
                    emailDestino: unico.recordatorio.emailDestino,
                    nombreDestino: unico.recordatorio.nombreDestino,
                    razonSocial: unico.recordatorio.razonSocial,
                    tipoDoc: unico.recordatorio.tipoDoc,
                    folio: unico.recordatorio.folio,
                    montoTotal: unico.saldo,
                    fechaVencimiento: unico.fechaVencimiento,
                    diasDiferencia: unico.recordatorio.diasDiferencia ?? 0,
                    tipoRecordatorio: unico.recordatorio.tipoRecordatorio,
                    ...(adjuntoPdf ? { adjuntoPdf } : {}),
                });
            asunto =
                construirAsuntoCobranza({
                    empresaKey,
                    folio: unico.recordatorio.folio,
                    tipoRecordatorio: unico.recordatorio.tipoRecordatorio,
                });
        }
        else {
            const facturas = vigentes.map((v) => ({
                tipoDoc: v.recordatorio.tipoDoc,
                folio: v.recordatorio.folio,
                fechaVencimiento: v.fechaVencimiento,
                diasDiferencia: v.recordatorio.diasDiferencia ?? 0,
                saldo: v.saldo,
            }));
            /*
             * Saldo total abierto del cliente con la empresa
             * (el núcleo ya se recalculó en la revisión).
             */
            const rut = primero.rutContraparte.replace(/[^0-9kK]/g, "").toUpperCase();
            const { data } = await obtenerCalculo(empresaKey, false);
            const abiertos = data.documentos.filter((d) => (d.estado === "PENDIENTE" || d.estado === "VENCIDO") &&
                d.rutContraparte.replace(/[^0-9kK]/g, "").toUpperCase() === rut);
            const nombreDestino = vigentes.find((v) => v.recordatorio.nombreDestino)?.recordatorio.nombreDestino ?? null;
            envio =
                await enviarCorreoCobranzaConsolidado({
                    empresaKey,
                    emailDestino: primero.emailDestino,
                    nombreDestino,
                    razonSocial: primero.razonSocial,
                    facturas,
                    totalCliente: {
                        saldo: abiertos.reduce((total, d) => total + d.saldo, 0),
                        documentos: abiertos.length,
                    },
                    adjuntos,
                    documentosSinAdjunto,
                });
            asunto =
                construirAsuntoCobranzaConsolidado({
                    empresaKey,
                    facturas,
                });
        }
        if (!envio.ok) {
            await prisma.rcvRecordatorioEnvio.updateMany({
                where: {
                    id: { in: vigentes.map((v) => v.recordatorio.id) },
                },
                data: {
                    estado: "ERROR",
                    procesandoAt: null,
                    error: envio.error ?? "Error desconocido enviando correo",
                },
            });
            resultado.errores += vigentes.length;
            return resultado;
        }
        /*
         * 4. Todos los registros del correo quedan ENVIADO con el
         * mismo asunto y la misma hora (y su saldo revisado).
         */
        const enviadoAt = new Date();
        await prisma.$transaction(vigentes.map((v) => prisma.rcvRecordatorioEnvio.update({
            where: { id: v.recordatorio.id },
            data: {
                estado: "ENVIADO",
                asunto,
                enviadoAt,
                procesandoAt: null,
                error: null,
                montoTotal: v.saldo,
            },
        })));
        resultado.enviados += vigentes.length;
        console.log("[COBRANZA ENVÍO] ✅ Correo enviado", {
            empresa: empresaKey,
            email: primero.emailDestino,
            documentos: vigentes.map((v) => `${v.recordatorio.tipoDoc}-${v.recordatorio.folio}`),
            consolidado: vigentes.length > 1,
        });
        return resultado;
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[COBRANZA ENVÍO] ❌ Error procesando grupo", {
            empresa: empresaKey,
            email: primero.emailDestino,
            error: message,
        });
        const marcados = await prisma.rcvRecordatorioEnvio.updateMany({
            where: {
                id: { in: tomados.map((r) => r.id) },
                estado: "PROCESANDO",
            },
            data: {
                estado: "ERROR",
                procesandoAt: null,
                error: message,
            },
        });
        resultado.errores += marcados.count;
        return resultado;
    }
}
/* =========================================================
   PROCESAR ENVÍOS
========================================================= */
export async function procesarEnviosCobranza(options) {
    const limite = Math.max(1, Math.min(Number(options?.limite ??
        20), 100));
    const debeRecuperarAtascados = options?.recuperarAtascados !== false;
    const idsRecuperados = debeRecuperarAtascados ? await recuperarRecordatoriosAtascados(options?.empresa, limite) : [];
    const recuperados = idsRecuperados.length;
    /*
     * En la primera fase procesaremos:
     *
     * PENDIENTE
     * ERROR con menos de 3 intentos
     */
    const pendientes = await prisma.rcvRecordatorioEnvio.findMany({
        where: {
            ...(options
                ?.empresa
                ? {
                    empresaKey: options
                        .empresa,
                }
                : {}),
            ...(options?.ids?.length
                ? {
                    id: {
                        in: options.ids,
                    },
                }
                : {}),
            enviadoAt: null,
            intentos: {
                lt: MAX_INTENTOS,
            },
            OR: [
                {
                    estado: "PENDIENTE",
                },
                {
                    estado: "ERROR",
                },
            ],
        },
        orderBy: {
            createdAt: "asc",
        },
        take: limite,
    });
    console.log("[COBRANZA ENVÍO] Pendientes encontrados", {
        total: pendientes.length,
        empresa: options
            ?.empresa ??
            "todas",
        limite,
    });
    const empresasRefrescadas = new Set();
    let procesados = 0;
    let enviados = 0;
    let errores = 0;
    let omitidos = 0;
    /*
     * Fase 5b: agrupar por empresa + RUT + correo.
     * Los grupos de 2 o más van en un correo consolidado;
     * los recordatorios solos siguen el flujo de siempre.
     */
    const grupos = new Map();
    for (const recordatorio of pendientes) {
        const clave = claveGrupoEnvio(recordatorio);
        const grupo = grupos.get(clave);
        if (grupo)
            grupo.push(recordatorio);
        else
            grupos.set(clave, [recordatorio]);
    }
    const individuales = [];
    for (const grupo of grupos.values()) {
        if (grupo.length === 1) {
            individuales.push(...grupo);
            continue;
        }
        const resultadoGrupo = await procesarGrupoConsolidado(grupo, empresasRefrescadas);
        procesados += resultadoGrupo.procesados;
        enviados += resultadoGrupo.enviados;
        errores += resultadoGrupo.errores;
        omitidos += resultadoGrupo.omitidos;
    }
    for (const recordatorio of individuales) {
        /*
         * -----------------------------------------------
         * 1. CLAIM
         * -----------------------------------------------
         */
        const tomado = await intentarTomarRecordatorio(recordatorio.id);
        if (!tomado) {
            omitidos++;
            continue;
        }
        procesados++;
        try {
            /*
             * -----------------------------------------------
             * 2. Seguridad:
             * comprobar configuración de empresa
             * -----------------------------------------------
             */
            const config = await prisma.rcvCobranzaConfig.findUnique({
                where: {
                    empresaKey: recordatorio
                        .empresaKey,
                },
            });
            if (!config ||
                !config.activo) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: "Automatización de cobranza desactivada",
                    },
                });
                errores++;
                continue;
            }
            /*
             * IMPORTANTE:
             *
             * Todavía NO exigimos envioAutomatico=true
             * porque este worker será inicialmente
             * ejecutado mediante endpoint manual.
             *
             * El scheduler sí lo comprobará posteriormente.
             */
            const fechaVencimiento = fechaDateToIso(recordatorio
                .fechaVencimiento);
            if (!fechaVencimiento) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: "Recordatorio sin fecha de vencimiento válida",
                    },
                });
                errores++;
                continue;
            }
            /*
             * -----------------------------------------------
             * 2b. Fase 5a: revisar contra el núcleo CxC
             * -----------------------------------------------
             */
            const revision = await revisarRecordatorioAntesDeEnviar(recordatorio, empresasRefrescadas);
            if (!revision.enviar) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: revision.motivo,
                    },
                });
                console.log("[COBRANZA ENVÍO] ⏭ Recordatorio cancelado", {
                    id: recordatorio.id,
                    folio: recordatorio.folio,
                    motivo: revision.motivo,
                });
                omitidos++;
                continue;
            }
            if (revision.saldo !== recordatorio.montoTotal) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        montoTotal: revision.saldo,
                    },
                });
            }
            /*
  * -----------------------------------------------
  * 3. Preparar PDF DTE
  * -----------------------------------------------
  */
            let adjuntoPdf;
            if (config.adjuntarPdf) {
                const empresaKey = recordatorio
                    .empresaKey;
                const periodoDte = await resolverPeriodoDte(empresaKey, recordatorio
                    .tipoDoc, recordatorio
                    .folio, recordatorio
                    .fechaVencimiento);
                console.log("[COBRANZA ENVÍO] 📄 Generando PDF", {
                    id: recordatorio.id,
                    empresa: empresaKey,
                    tipoDoc: recordatorio
                        .tipoDoc,
                    folio: recordatorio
                        .folio,
                    periodo: periodoDte,
                });
                const pdf = await generarDtePdfBuffer({
                    empresa: empresaKey,
                    periodo: periodoDte,
                    folio: recordatorio
                        .folio,
                    tipoDTE: recordatorio
                        .tipoDoc,
                    forceRefresh: false,
                });
                adjuntoPdf = {
                    filename: pdf.filename,
                    content: pdf.buffer,
                };
                console.log("[COBRANZA ENVÍO] ✅ PDF preparado", {
                    id: recordatorio.id,
                    folio: recordatorio
                        .folio,
                    filename: pdf.filename,
                    bytes: pdf.buffer
                        .length,
                });
            }
            const resultadoEnvio = await enviarCorreoCobranza({
                empresaKey: recordatorio
                    .empresaKey,
                emailDestino: recordatorio
                    .emailDestino,
                nombreDestino: recordatorio
                    .nombreDestino,
                razonSocial: recordatorio
                    .razonSocial,
                tipoDoc: recordatorio
                    .tipoDoc,
                folio: recordatorio
                    .folio,
                montoTotal: revision.saldo,
                fechaVencimiento,
                diasDiferencia: recordatorio
                    .diasDiferencia ??
                    0,
                tipoRecordatorio: recordatorio
                    .tipoRecordatorio,
                ...(adjuntoPdf
                    ? {
                        adjuntoPdf,
                    }
                    : {}),
            });
            /*
             * -----------------------------------------------
             * 4A. ERROR
             * -----------------------------------------------
             */
            if (!resultadoEnvio.ok) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: resultadoEnvio
                            .error ??
                            "Error desconocido enviando correo",
                    },
                });
                errores++;
                continue;
            }
            /*
             * -----------------------------------------------
             * 4B. ENVIADO
             * -----------------------------------------------
             */
            const asunto = construirAsuntoCobranza({
                empresaKey: recordatorio
                    .empresaKey,
                folio: recordatorio
                    .folio,
                tipoRecordatorio: recordatorio
                    .tipoRecordatorio,
            });
            await prisma.rcvRecordatorioEnvio.update({
                where: {
                    id: recordatorio.id,
                },
                data: {
                    estado: "ENVIADO",
                    asunto,
                    enviadoAt: new Date(),
                    procesandoAt: null,
                    error: null,
                },
            });
            enviados++;
            console.log("[COBRANZA ENVÍO] ✅ Recordatorio completado", {
                id: recordatorio.id,
                empresa: recordatorio
                    .empresaKey,
                folio: recordatorio
                    .folio,
                email: recordatorio
                    .emailDestino,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            errores++;
            console.error("[COBRANZA ENVÍO] ❌ Error procesando recordatorio", {
                id: recordatorio.id,
                error: message,
            });
            /*
             * Intentamos liberar el registro.
             */
            try {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: message,
                    },
                });
            }
            catch (updateError) {
                console.error("[COBRANZA ENVÍO] ❌ No fue posible actualizar estado ERROR", {
                    id: recordatorio.id,
                    error: updateError,
                });
            }
        }
    }
    console.log("[COBRANZA ENVÍO] Resumen", {
        recuperados,
        encontrados: pendientes.length,
        procesados,
        enviados,
        errores,
        omitidos,
    });
    return {
        recuperados,
        procesados,
        enviados,
        errores,
        omitidos,
    };
}
export async function procesarRecoveryEnviosCobranza(options) {
    const limite = Math.max(1, Math.min(Number(options
        ?.limite ??
        100), 100));
    const idsRecuperados = await recuperarRecordatoriosAtascados(options
        ?.empresa, limite);
    if (idsRecuperados.length ===
        0) {
        console.log("[COBRANZA RECOVERY] ✅ Sin recordatorios atascados", {
            empresa: options
                ?.empresa ??
                "todas",
        });
        return {
            recuperados: 0,
            procesados: 0,
            enviados: 0,
            errores: 0,
            omitidos: 0,
        };
    }
    console.log("[COBRANZA RECOVERY] 🔁 Reintentando recordatorios recuperados", {
        empresa: options
            ?.empresa ??
            "todas",
        total: idsRecuperados.length,
        ids: idsRecuperados,
    });
    const resultado = await procesarEnviosCobranza({
        ...(options?.empresa
            ? {
                empresa: options.empresa,
            }
            : {}),
        ids: idsRecuperados,
        limite: idsRecuperados.length,
        recuperarAtascados: false,
    });
    return {
        ...resultado,
        recuperados: idsRecuperados.length,
    };
}
//# sourceMappingURL=cobranza-envio.service.js.map