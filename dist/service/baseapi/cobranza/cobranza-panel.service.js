// src/service/baseapi/cobranza/cobranza-panel.service.ts
/* =========================================================
   COBRANZA AUTOMÁTICA · PANEL (Fase 5c)

   - Configuración por empresa (RcvCobranzaConfig): ver y editar.
   - Cola (RcvRecordatorioEnvio): listar por fechas, estado y texto.
   - Cancelar a mano un recordatorio pendiente o con error.
========================================================= */
import { prisma } from "../../../lib/prisma.js";
import { MAX_DIAS_VENCIDA_COBRANZA_AUTO, SALDO_MINIMO_COBRANZA_AUTO, } from "./cobranza-automatico.service.js";
export class CobranzaPanelError extends Error {
}
const ZONA = "America/Santiago";
function fechaChileIso(fecha) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}
function horaChile(fecha) {
    return new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(fecha);
}
export const REGLAS_FIJAS_COBRANZA = {
    saldoMinimo: SALDO_MINIMO_COBRANZA_AUTO,
    topeDiasVencida: MAX_DIAS_VENCIDA_COBRANZA_AUTO,
    repetirCadaDias: 15,
    diasRecuperacion: 3,
};
export async function obtenerConfigCobranza() {
    const filas = await prisma.rcvCobranzaConfig.findMany({ orderBy: { empresaKey: "asc" } });
    return filas
        .filter((f) => f.empresaKey === "rids" || f.empresaKey === "econnet")
        .map((f) => ({
        empresaKey: f.empresaKey,
        activo: f.activo,
        envioAutomatico: f.envioAutomatico,
        adjuntarPdf: f.adjuntarPdf,
        horaConsultaSii: f.horaConsultaSii,
        horaCobranza: f.horaCobranza,
        diasPorVencer: [...f.diasPorVencer].sort((a, b) => a - b),
        diasVencidos: [...f.diasVencidos].sort((a, b) => a - b),
        updatedAt: f.updatedAt.toISOString(),
    }));
}
function validarHora(valor, campo) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor ?? "").trim());
    const h = Number(m?.[1]);
    const min = Number(m?.[2]);
    if (!m || h > 23 || min > 59)
        throw new CobranzaPanelError(`${campo}: usa el formato HH:MM (24 horas).`);
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function validarDias(valor, campo, min, max) {
    if (!Array.isArray(valor))
        throw new CobranzaPanelError(`${campo}: debe ser una lista de días.`);
    const dias = [...new Set(valor.map((v) => Number(v)))].sort((a, b) => a - b);
    if (dias.some((d) => !Number.isInteger(d) || d < min || d > max)) {
        throw new CobranzaPanelError(`${campo}: cada valor debe ser un entero entre ${min} y ${max}.`);
    }
    if (dias.length > 10)
        throw new CobranzaPanelError(`${campo}: máximo 10 etapas.`);
    return dias;
}
/** Valida y guarda los cambios. La preparación debe ser antes del envío. */
export async function actualizarConfigCobranza(empresaKey, body) {
    const actual = await prisma.rcvCobranzaConfig.findUnique({ where: { empresaKey } });
    if (!actual)
        throw new CobranzaPanelError("No existe configuración de cobranza para esta empresa.");
    const cambios = {};
    for (const campo of ["activo", "envioAutomatico", "adjuntarPdf"]) {
        if (body[campo] === undefined)
            continue;
        if (typeof body[campo] !== "boolean")
            throw new CobranzaPanelError(`${campo}: debe ser verdadero o falso.`);
        cambios[campo] = body[campo];
    }
    if (body.horaConsultaSii !== undefined)
        cambios.horaConsultaSii = validarHora(body.horaConsultaSii, "Hora de preparación");
    if (body.horaCobranza !== undefined)
        cambios.horaCobranza = validarHora(body.horaCobranza, "Hora de envío");
    if (body.diasPorVencer !== undefined)
        cambios.diasPorVencer = validarDias(body.diasPorVencer, "Etapas por vencer", -60, -1);
    if (body.diasVencidos !== undefined)
        cambios.diasVencidos = validarDias(body.diasVencidos, "Etapas vencidas", 0, MAX_DIAS_VENCIDA_COBRANZA_AUTO);
    const preparacion = cambios.horaConsultaSii ?? actual.horaConsultaSii;
    const envio = cambios.horaCobranza ?? actual.horaCobranza;
    if (preparacion >= envio)
        throw new CobranzaPanelError("La hora de preparación debe ser anterior a la hora de envío.");
    if (Object.keys(cambios).length === 0)
        throw new CobranzaPanelError("No hay cambios que guardar.");
    await prisma.rcvCobranzaConfig.update({ where: { empresaKey }, data: cambios });
    const vista = (await obtenerConfigCobranza()).find((c) => c.empresaKey === empresaKey);
    if (!vista)
        throw new CobranzaPanelError("No se pudo leer la configuración guardada.");
    return vista;
}
const MAX_FILAS_COLA = 3000;
export async function listarColaCobranza(params) {
    const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!esFecha(params.desde) || !esFecha(params.hasta) || params.desde > params.hasta) {
        throw new CobranzaPanelError("Rango de fechas inválido (desde y hasta en AAAA-MM-DD).");
    }
    // Margen de un día por la zona horaria; luego se filtra por la fecha de Chile.
    const desdeUtc = new Date(`${params.desde}T00:00:00Z`);
    desdeUtc.setUTCDate(desdeUtc.getUTCDate() - 1);
    const hastaUtc = new Date(`${params.hasta}T00:00:00Z`);
    hastaUtc.setUTCDate(hastaUtc.getUTCDate() + 2);
    const registros = await prisma.rcvRecordatorioEnvio.findMany({
        where: {
            empresaKey: params.empresaKey,
            createdAt: { gte: desdeUtc, lt: hastaUtc },
            ...(params.estado ? { estado: params.estado } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_FILAS_COLA + 1,
    });
    const filas = registros
        .slice(0, MAX_FILAS_COLA)
        .map((r) => ({ r, fecha: fechaChileIso(r.createdAt) }))
        .filter(({ fecha }) => fecha >= params.desde && fecha <= params.hasta)
        .map(({ r, fecha }) => ({
        id: r.id,
        empresaKey: r.empresaKey,
        tipoDoc: r.tipoDoc,
        folio: r.folio,
        rutContraparte: r.rutContraparte,
        razonSocial: r.razonSocial,
        tipoRecordatorio: r.tipoRecordatorio,
        emailDestino: r.emailDestino,
        nombreDestino: r.nombreDestino,
        estado: r.estado,
        automatico: r.automatico,
        montoTotal: r.montoTotal,
        fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString().slice(0, 10) : null,
        diasDiferencia: r.diasDiferencia,
        asunto: r.asunto,
        error: r.error,
        intentos: r.intentos,
        fecha,
        hora: horaChile(r.createdAt),
        enviadoAt: r.enviadoAt ? r.enviadoAt.toISOString() : null,
        horaEnvio: r.enviadoAt ? horaChile(r.enviadoAt) : null,
    }));
    const porEstado = {};
    for (const f of filas)
        porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
    return { filas, porEstado, truncado: registros.length > MAX_FILAS_COLA };
}
/** Solo PENDIENTE o ERROR (lo que el envío todavía podría mandar). */
export async function cancelarRecordatorioCobranza(id, responsable) {
    const resultado = await prisma.rcvRecordatorioEnvio.updateMany({
        where: { id, estado: { in: ["PENDIENTE", "ERROR"] }, enviadoAt: null },
        data: { estado: "CANCELADO", procesandoAt: null, error: `Cancelado a mano${responsable ? ` por ${responsable}` : ""}.` },
    });
    if (resultado.count !== 1) {
        throw new CobranzaPanelError("Solo se pueden cancelar recordatorios pendientes o con error que no se hayan enviado.");
    }
}
//# sourceMappingURL=cobranza-panel.service.js.map