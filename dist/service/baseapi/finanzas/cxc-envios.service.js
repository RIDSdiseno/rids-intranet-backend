// src/service/baseapi/finanzas/cxc-envios.service.ts
// Fase 2b: reenvío manual de facturas y recordatorios de pago desde la pestaña Facturas.
//
// - Reutiliza las plantillas y protecciones existentes:
//     factura      → enviarCorreoFactura   (FACTURA_TEST_EMAIL / FACTURA_LIVE_SEND)
//     recordatorio → enviarCorreoCobranza  (COBRANZA_TEST_EMAIL / COBRANZA_LIVE_SEND)
// - Antes de enviar valida el DTE contra BaseAPI (mismo chequeo del envío automático) y adjunta el PDF.
// - Solo registra en RcvFacturaEnvio / RcvRecordatorioEnvio los envíos REALES exitosos:
//     · en modo prueba no se registra nada (si no, bloquearía el envío automático real más adelante);
//     · los errores no se registran (el worker reintenta los ERROR con enviadoAt = null).
import { prisma } from "../../../lib/prisma.js";
import { generarDtePdfBuffer } from "../baseapi-dte-pdf.service.js";
import { construirAsuntoFactura, enviarCorreoFactura } from "../facturas/factura-email.service.js";
import { validarDteAntesDeEnviar } from "../facturas/factura-envio.service.js";
import { construirAsuntoCobranza, enviarCorreoCobranza } from "../cobranza/cobranza-email.service.js";
/* =========================================================
   HELPERS
========================================================= */
const MAX_DESTINATARIOS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizarRut(value) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}
function normalizarEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}
/** "pagos@rids.cl" → "pa***@rids.cl" */
function enmascararEmail(email) {
    const [usuario = "", dominio = ""] = email.split("@");
    return `${usuario.slice(0, 2)}***@${dominio}`;
}
/** YYYY-MM-DD → Date a medianoche UTC (misma convención que fechaDateToIso del envío automático). */
function isoADate(iso) {
    return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00.000Z`) : null;
}
function mensaje(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Error de validación: el controlador lo responde como 400. */
export class EnvioCxcError extends Error {
}
/** Replica la prioridad de las plantillas: casilla de prueba > envío real habilitado > bloqueado. */
export function modoEnvioCxc(tipo) {
    const prefijo = tipo === "factura" ? "FACTURA" : "COBRANZA";
    const testEmail = normalizarEmail(process.env[`${prefijo}_TEST_EMAIL`]);
    const live = String(process.env[`${prefijo}_LIVE_SEND`] ?? "").trim().toLowerCase() === "true";
    const variables = `${prefijo}_TEST_EMAIL / ${prefijo}_LIVE_SEND`;
    if (testEmail)
        return { modo: "PRUEBA", destinoPrueba: enmascararEmail(testEmail), variables };
    if (live)
        return { modo: "REAL", destinoPrueba: null, variables };
    return { modo: "BLOQUEADO", destinoPrueba: null, variables };
}
/** El recordatorio solo tiene sentido con saldo y fecha de vencimiento. */
function validarDocumento(tipo, doc) {
    if (doc.tipoDoc !== "33" && doc.tipoDoc !== "34") {
        throw new EnvioCxcError("Solo se pueden enviar facturas (tipo 33 o 34).");
    }
    if (doc.estado === "COMPENSADO") {
        throw new EnvioCxcError("La factura está anulada por notas de crédito.");
    }
    if (tipo === "recordatorio") {
        if (doc.estado !== "VENCIDO" && doc.estado !== "PENDIENTE") {
            throw new EnvioCxcError("Solo se envían recordatorios de facturas vencidas o por vencer.");
        }
        if (!doc.fechaVencimiento || doc.diasDiferencia === null) {
            throw new EnvioCxcError("La factura no tiene fecha de vencimiento.");
        }
    }
}
/* =========================================================
   OPCIONES (contactos, historial y modo)
========================================================= */
async function contactosReceptor(tipo, rut) {
    if (tipo === "factura") {
        const receptor = await prisma.receptorFacturacion.findUnique({
            where: { rut },
            include: { contactos: { where: { activo: true }, orderBy: [{ principal: "desc" }, { email: "asc" }] } },
        });
        return {
            receptor: {
                configurado: Boolean(receptor),
                activo: receptor?.activo ?? false,
                recibeAutomatico: receptor?.recibeFacturas ?? false,
            },
            contactos: (receptor?.contactos ?? []).map((c) => ({
                email: normalizarEmail(c.email),
                nombre: c.nombre,
                principal: c.principal,
                habilitado: c.recibeFacturas,
            })),
        };
    }
    const receptor = await prisma.receptorCobranza.findUnique({
        where: { rut },
        include: { contactos: { where: { activo: true }, orderBy: [{ principal: "desc" }, { email: "asc" }] } },
    });
    return {
        receptor: {
            configurado: Boolean(receptor),
            activo: receptor?.activo ?? false,
            recibeAutomatico: receptor?.recibeCobranza ?? false,
        },
        contactos: (receptor?.contactos ?? []).map((c) => ({
            email: normalizarEmail(c.email),
            nombre: c.nombre,
            principal: c.principal,
            habilitado: c.recibeCobranza,
        })),
    };
}
async function historialEnvios(tipo, empresaKey, doc) {
    const where = {
        empresaKey,
        tipoRcv: "ventas",
        tipoDoc: doc.tipoDoc,
        folio: doc.folio,
        rutContraparte: normalizarRut(doc.rutContraparte),
    };
    if (tipo === "factura") {
        const filas = await prisma.rcvFacturaEnvio.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take: 20,
            select: { emailDestino: true, estado: true, automatico: true, enviadoAt: true, updatedAt: true, error: true },
        });
        return filas.map((f) => ({
            email: f.emailDestino,
            estado: f.estado,
            automatico: f.automatico,
            tipoRecordatorio: null,
            enviadoAt: f.enviadoAt?.toISOString() ?? null,
            actualizadoAt: f.updatedAt.toISOString(),
            error: f.error,
        }));
    }
    const filas = await prisma.rcvRecordatorioEnvio.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { emailDestino: true, estado: true, automatico: true, tipoRecordatorio: true, enviadoAt: true, updatedAt: true, error: true },
    });
    return filas.map((f) => ({
        email: f.emailDestino,
        estado: f.estado,
        automatico: f.automatico,
        tipoRecordatorio: f.tipoRecordatorio,
        enviadoAt: f.enviadoAt?.toISOString() ?? null,
        actualizadoAt: f.updatedAt.toISOString(),
        error: f.error,
    }));
}
export async function obtenerOpcionesEnvioCxc(params) {
    validarDocumento(params.tipo, params.documento);
    const [{ receptor, contactos }, historial] = await Promise.all([
        contactosReceptor(params.tipo, normalizarRut(params.documento.rutContraparte)),
        historialEnvios(params.tipo, params.empresaKey, params.documento),
    ]);
    return { tipo: params.tipo, modo: modoEnvioCxc(params.tipo), receptor, contactos, historial };
}
/* =========================================================
   ENVÍO
========================================================= */
export async function enviarDocumentoCxc(params) {
    const { tipo, empresaKey, documento: doc } = params;
    validarDocumento(tipo, doc);
    const modo = modoEnvioCxc(tipo);
    if (modo.modo === "BLOQUEADO") {
        throw new EnvioCxcError(`Envío bloqueado: falta configurar ${modo.variables} en el servidor.`);
    }
    const emails = Array.from(new Set(params.emails.map(normalizarEmail).filter(Boolean)));
    if (emails.length === 0)
        throw new EnvioCxcError("Selecciona al menos un destinatario.");
    if (emails.length > MAX_DESTINATARIOS)
        throw new EnvioCxcError(`Máximo ${MAX_DESTINATARIOS} destinatarios por envío.`);
    const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
    if (invalidos.length)
        throw new EnvioCxcError(`Correo inválido: ${invalidos.join(", ")}`);
    if (!doc.fechaEmision)
        throw new EnvioCxcError("La factura no tiene fecha de emisión.");
    const rut = normalizarRut(doc.rutContraparte);
    const { contactos } = await contactosReceptor(tipo, rut);
    const nombres = new Map(contactos.map((c) => [c.email, c.nombre]));
    // 1. El DTE sigue vigente y corresponde al cliente (consulta BaseAPI con forceRefresh).
    const validacion = await validarDteAntesDeEnviar({
        empresa: empresaKey,
        periodo: doc.periodo,
        tipoDoc: doc.tipoDoc,
        folio: doc.folio,
        rutContraparte: rut,
    });
    if (!validacion.valido) {
        throw new EnvioCxcError(validacion.motivo ?? "El DTE no es válido para envío.");
    }
    // 2. PDF (uno solo para todos los destinatarios).
    const pdf = await generarDtePdfBuffer({
        empresa: empresaKey,
        periodo: doc.periodo,
        folio: doc.folio,
        tipoDTE: doc.tipoDoc,
        forceRefresh: false,
    });
    const adjuntoPdf = { filename: pdf.filename, content: pdf.buffer };
    // 3. Envíos en curso del worker automático (factura): no se duplican.
    const procesando = new Set();
    if (tipo === "factura" && modo.modo === "REAL") {
        const filas = await prisma.rcvFacturaEnvio.findMany({
            where: { empresaKey, tipoRcv: "ventas", tipoDoc: doc.tipoDoc, folio: doc.folio, rutContraparte: rut, estado: "PROCESANDO" },
            select: { emailDestino: true },
        });
        for (const f of filas)
            procesando.add(normalizarEmail(f.emailDestino));
    }
    const ahora = new Date();
    const ciclo = `MANUAL-${ahora.toISOString()}`;
    const asunto = tipo === "factura"
        ? construirAsuntoFactura({ empresaKey, tipoDoc: doc.tipoDoc, folio: doc.folio })
        : construirAsuntoCobranza({ empresaKey, folio: doc.folio, tipoRecordatorio: "MANUAL" });
    const resultados = [];
    for (const email of emails) {
        if (procesando.has(email)) {
            resultados.push({ email, ok: false, registrado: false, error: "El envío automático lo está procesando en este momento." });
            continue;
        }
        const nombreDestino = nombres.get(email) ?? null;
        const envio = tipo === "factura"
            ? await enviarCorreoFactura({
                empresaKey,
                emailDestino: email,
                nombreDestino,
                razonSocial: doc.razonSocial,
                tipoDoc: doc.tipoDoc,
                folio: doc.folio,
                montoTotal: doc.montoOriginal,
                fechaEmision: doc.fechaEmision,
                adjuntoPdf,
            })
            : await enviarCorreoCobranza({
                empresaKey,
                emailDestino: email,
                nombreDestino,
                razonSocial: doc.razonSocial,
                tipoDoc: doc.tipoDoc,
                folio: doc.folio,
                montoTotal: doc.saldo,
                fechaVencimiento: doc.fechaVencimiento ?? "",
                diasDiferencia: doc.diasDiferencia ?? 0,
                tipoRecordatorio: "MANUAL",
                adjuntoPdf,
            });
        if (!envio.ok) {
            resultados.push({ email, ok: false, registrado: false, error: envio.error ?? "Error desconocido al enviar." });
            continue;
        }
        // En modo prueba el correo llegó a la casilla de pruebas: no se registra.
        if (modo.modo !== "REAL") {
            resultados.push({ email, ok: true, registrado: false, error: null });
            continue;
        }
        try {
            if (tipo === "factura") {
                await prisma.rcvFacturaEnvio.upsert({
                    where: {
                        empresaKey_tipoRcv_tipoDoc_folio_rutContraparte_emailDestino: {
                            empresaKey,
                            tipoRcv: "ventas",
                            tipoDoc: doc.tipoDoc,
                            folio: doc.folio,
                            rutContraparte: rut,
                            emailDestino: email,
                        },
                    },
                    create: {
                        empresaKey,
                        tipoRcv: "ventas",
                        tipoDoc: doc.tipoDoc,
                        folio: doc.folio,
                        rutContraparte: rut,
                        razonSocial: doc.razonSocial,
                        emailDestino: email,
                        nombreDestino,
                        asunto,
                        estado: "ENVIADO",
                        automatico: false,
                        montoTotal: doc.montoOriginal,
                        fechaEmision: isoADate(doc.fechaEmision),
                        intentos: 1,
                        ultimoIntentoAt: ahora,
                        enviadoAt: ahora,
                    },
                    update: {
                        nombreDestino,
                        asunto,
                        estado: "ENVIADO",
                        intentos: { increment: 1 },
                        ultimoIntentoAt: ahora,
                        procesandoAt: null,
                        enviadoAt: ahora,
                        error: null,
                    },
                });
            }
            else {
                await prisma.rcvRecordatorioEnvio.create({
                    data: {
                        empresaKey,
                        tipoRcv: "ventas",
                        tipoDoc: doc.tipoDoc,
                        folio: doc.folio,
                        rutContraparte: rut,
                        razonSocial: doc.razonSocial,
                        tipoRecordatorio: "MANUAL",
                        emailDestino: email,
                        nombreDestino,
                        asunto,
                        estado: "ENVIADO",
                        automatico: false,
                        fechaVencimiento: isoADate(doc.fechaVencimiento),
                        diasDiferencia: doc.diasDiferencia,
                        montoTotal: doc.saldo,
                        enviadoAt: ahora,
                        cicloVencimiento: ciclo,
                        intentos: 1,
                        ultimoIntentoAt: ahora,
                    },
                });
            }
            resultados.push({ email, ok: true, registrado: true, error: null });
        }
        catch (error) {
            console.error("[CXC ENVÍO] Correo enviado pero no se pudo registrar", { tipo, folio: doc.folio, email, error: mensaje(error) });
            resultados.push({ email, ok: true, registrado: false, error: `Enviado, pero no se pudo registrar: ${mensaje(error)}` });
        }
    }
    const enviados = resultados.filter((r) => r.ok).length;
    console.log("[CXC ENVÍO] Envío manual", {
        tipo,
        empresa: empresaKey,
        documento: `${doc.tipoDoc}-${doc.folio}`,
        modo: modo.modo,
        usuario: params.usuario,
        enviados,
        errores: resultados.length - enviados,
    });
    return { tipo, modo: modo.modo, enviados, errores: resultados.length - enviados, resultados };
}
//# sourceMappingURL=cxc-envios.service.js.map