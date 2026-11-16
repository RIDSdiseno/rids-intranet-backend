// src/service/oportunidades/oportunidades-avisos.service.ts
/* =========================================================
   AVISOS DEL FUNNEL (fechas de las oportunidades)

   Módulo propio: NO usa Recordatorio ni el resumen de pendientes.

   Fechas que se avisan, según la etapa:
     PROXIMA_ACCION         fechaProximaAccion         NUEVA → NEGOCIACION
     COMPROMISO_ENVIO       fechaComprometidaEnvio     NUEVA, COTIZACION_PREPARACION
     VENCIMIENTO_PROPUESTA  fechaVencimientoPropuesta  COTIZACION_ENVIADA, NEGOCIACION
     REACTIVACION           fechaReactivacion          POSTERGADA

   - Umbrales: 3, 1 y 0 días (calendario de Chile). Si un día no corrió,
     recupera con el umbral pendiente más chico que cubre los días que faltan.
   - Solo al responsable de la oportunidad (si está activo).
   - Un correo por responsable con todas sus fechas del día.
   - Un aviso por (oportunidad, tipo, fecha, umbral) en OportunidadFechaAviso:
     si la fecha cambia (nuevo seguimiento, edición), se vuelve a avisar.
   ========================================================= */
import { EtapaOportunidadVenta, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { sendEmail, } from "../correos-masivos/masivos-email-sender.service.js";
/* =========================================================
   CONFIGURACIÓN
   ========================================================= */
const ZONA_CHILE = "America/Santiago";
/** Días antes de la fecha en que se avisa (orden ascendente). */
export const UMBRALES_AVISO_FUNNEL = [0, 1, 3];
const ETIQUETA_FECHA = {
    PROXIMA_ACCION: "Próxima acción",
    COMPROMISO_ENVIO: "Envío comprometido de la propuesta",
    VENCIMIENTO_PROPUESTA: "Vence la propuesta enviada",
    REACTIVACION: "Retomar oportunidad postergada",
};
/*
 * Etiquetas de "Próxima acción". Copia de PROXIMAS_ACCIONES del front
 * (src/components/modals-funnel/proximasAcciones.ts): si se agrega una
 * opción allá, agregarla aquí. Un valor desconocido (texto libre de
 * oportunidades antiguas) se muestra tal cual.
 */
const ETIQUETA_PROXIMA_ACCION = {
    LLAMAR: "Llamar",
    WHATSAPP: "WhatsApp",
    ENVIAR_CORREO: "Enviar correo",
    VISITA_PRESENCIAL: "Visita presencial",
    ENVIAR_COTIZACION: "Enviar cotización",
    HACER_SEGUIMIENTO: "Hacer seguimiento",
    AGENDAR_REUNION: "Agendar reunión",
    REVISAR_COTIZACION: "Revisar cotización",
    AJUSTAR_PROPUESTA: "Ajustar propuesta",
    ESPERAR_RESPUESTA: "Esperar respuesta del cliente",
    NEGOCIAR: "Negociar condiciones",
    SOLICITAR_APROBACION: "Solicitar aprobación",
    CONFIRMAR_COMPRA: "Confirmar compra",
    CERRAR_OPORTUNIDAD: "Cerrar oportunidad",
};
function etiquetaProximaAccion(valor) {
    const v = valor?.trim();
    if (!v)
        return null;
    return ETIQUETA_PROXIMA_ACCION[v] ?? v;
}
const ETIQUETA_ETAPA = {
    NUEVA: "Nueva",
    COTIZACION_PREPARACION: "Cotización en preparación",
    COTIZACION_ENVIADA: "Cotización enviada",
    NEGOCIACION: "Negociación",
    GANADA: "Ganada",
    PERDIDA: "Perdida",
    POSTERGADA: "Postergada",
};
const ETAPAS_PROXIMA_ACCION = new Set([
    EtapaOportunidadVenta.NUEVA,
    EtapaOportunidadVenta.COTIZACION_PREPARACION,
    EtapaOportunidadVenta.COTIZACION_ENVIADA,
    EtapaOportunidadVenta.NEGOCIACION,
]);
const ETAPAS_COMPROMISO_ENVIO = new Set([
    EtapaOportunidadVenta.NUEVA,
    EtapaOportunidadVenta.COTIZACION_PREPARACION,
]);
const ETAPAS_VENCIMIENTO_PROPUESTA = new Set([
    EtapaOportunidadVenta.COTIZACION_ENVIADA,
    EtapaOportunidadVenta.NEGOCIACION,
]);
const ETAPAS_REACTIVACION = new Set([
    EtapaOportunidadVenta.POSTERGADA,
]);
/* =========================================================
   FECHAS (calendario de Chile)
   ========================================================= */
const formatoDiaChile = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
/**
 * Día ("YYYY-MM-DD") de una fecha de la oportunidad.
 * - Campos @db.Date y fechas guardadas como "solo día" llegan a
 *   las 00:00:00.000 UTC: se usa el día UTC (si no, en Chile
 *   caerían el día anterior a las 21:00).
 * - Cualquier otra hora: se usa el día de Chile.
 */
function diaDeFecha(fecha) {
    const esSoloDia = fecha.getUTCHours() === 0 &&
        fecha.getUTCMinutes() === 0 &&
        fecha.getUTCSeconds() === 0 &&
        fecha.getUTCMilliseconds() === 0;
    return esSoloDia
        ? fecha.toISOString().slice(0, 10)
        : formatoDiaChile.format(fecha);
}
function diasEntre(desde, hasta) {
    const [ay, am, ad] = desde.split("-").map(Number);
    const [by, bm, bd] = hasta.split("-").map(Number);
    const a = Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1);
    const b = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1);
    return Math.round((b - a) / 86_400_000);
}
/** Hora actual en Chile (0-23). */
export function horaChileActualFunnel() {
    return Number(new Intl.DateTimeFormat("en-US", {
        timeZone: ZONA_CHILE,
        hour: "2-digit",
        hourCycle: "h23",
    }).format(new Date()));
}
function textoDia(dia) {
    const [y, m, d] = dia.split("-");
    const fecha = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
    const semana = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "short" }).format(fecha);
    return `${semana} ${d}-${m}-${y}`;
}
function textoDias(dias) {
    if (dias === 0)
        return "Hoy";
    if (dias === 1)
        return "Mañana";
    return `En ${dias} días`;
}
function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/* =========================================================
   PROCESO PRINCIPAL
   ========================================================= */
export async function procesarAvisosFunnel(opciones = {}) {
    const simular = opciones.simular === true;
    const ahora = new Date();
    const hoy = formatoDiaChile.format(ahora);
    /* Ventana amplia (ayer → +5 días); el filtro exacto es por día de Chile. */
    const desde = new Date(ahora.getTime() - 2 * 86_400_000);
    const hasta = new Date(ahora.getTime() + 5 * 86_400_000);
    const rango = { gte: desde, lte: hasta };
    const oportunidades = await prisma.oportunidadVenta.findMany({
        where: {
            activo: true,
            etapa: {
                in: [
                    ...ETAPAS_PROXIMA_ACCION,
                    ...ETAPAS_REACTIVACION,
                ],
            },
            OR: [
                { fechaProximaAccion: rango },
                { fechaComprometidaEnvio: rango },
                { fechaVencimientoPropuesta: rango },
                { fechaReactivacion: rango },
            ],
        },
        select: {
            id: true,
            codigo: true,
            titulo: true,
            etapa: true,
            proximaAccion: true,
            fechaProximaAccion: true,
            fechaComprometidaEnvio: true,
            fechaVencimientoPropuesta: true,
            fechaReactivacion: true,
            entidad: { select: { nombre: true } },
            responsable: { select: { email: true, status: true } },
            avisosFechas: { select: { tipoFecha: true, fechaObjetivo: true, umbral: true } },
            /* Tarea pendiente más reciente: su detalle acompaña a la próxima acción. */
            seguimientos: {
                where: { estado: "PENDIENTE" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { comentario: true },
            },
        },
    });
    const items = [];
    let sinDestinatario = 0;
    for (const o of oportunidades) {
        const fechas = [
            { tipo: "PROXIMA_ACCION", fecha: o.fechaProximaAccion, aplica: ETAPAS_PROXIMA_ACCION.has(o.etapa) },
            { tipo: "COMPROMISO_ENVIO", fecha: o.fechaComprometidaEnvio, aplica: ETAPAS_COMPROMISO_ENVIO.has(o.etapa) },
            { tipo: "VENCIMIENTO_PROPUESTA", fecha: o.fechaVencimientoPropuesta, aplica: ETAPAS_VENCIMIENTO_PROPUESTA.has(o.etapa) },
            { tipo: "REACTIVACION", fecha: o.fechaReactivacion, aplica: ETAPAS_REACTIVACION.has(o.etapa) },
        ];
        const email = o.responsable.status && o.responsable.email?.includes("@")
            ? o.responsable.email.trim().toLowerCase()
            : null;
        for (const f of fechas) {
            if (!f.aplica || !f.fecha)
                continue;
            const dia = diaDeFecha(f.fecha);
            const dias = diasEntre(hoy, dia);
            if (dias < 0 || dias > 3)
                continue;
            const umbral = UMBRALES_AVISO_FUNNEL.find((u) => u >= dias);
            if (umbral === undefined)
                continue;
            const fechaObjetivo = f.fecha;
            const yaEnviado = o.avisosFechas.some((a) => a.tipoFecha === f.tipo &&
                a.umbral === umbral &&
                a.fechaObjetivo.getTime() === fechaObjetivo.getTime());
            if (yaEnviado)
                continue;
            if (!email) {
                sinDestinatario++;
                continue;
            }
            items.push({
                oportunidadId: o.id,
                tipoFecha: f.tipo,
                fechaObjetivo,
                dia,
                dias,
                umbral,
                destinatario: email,
                oportunidad: {
                    codigo: o.codigo,
                    titulo: o.titulo,
                    cliente: o.entidad?.nombre ?? null,
                    etapa: o.etapa,
                    proximaAccion: o.proximaAccion,
                    detalleTarea: o.seguimientos[0]?.comentario?.trim() || null,
                },
            });
        }
    }
    items.sort((a, b) => a.dias - b.dias || a.oportunidad.codigo.localeCompare(b.oportunidad.codigo));
    const porDestinatario = new Map();
    for (const item of items) {
        const lista = porDestinatario.get(item.destinatario) ?? [];
        lista.push(item);
        porDestinatario.set(item.destinatario, lista);
    }
    const resultado = {
        hoy,
        simulado: simular,
        oportunidadesRevisadas: oportunidades.length,
        avisos: items.length,
        sinDestinatario,
        correos: [],
        detalle: items.map((i) => ({
            codigo: i.oportunidad.codigo,
            tipoFecha: i.tipoFecha,
            dia: i.dia,
            dias: i.dias,
            umbral: i.umbral,
            destinatario: i.destinatario,
        })),
    };
    if (simular) {
        for (const [to, lista] of porDestinatario) {
            resultado.correos.push({ to, avisos: lista.length, ok: true });
        }
        return resultado;
    }
    const registros = [];
    for (const [to, lista] of porDestinatario) {
        try {
            await sendEmail({
                to,
                subject: armarAsunto(lista),
                bodyHtml: armarHtml(hoy, lista),
            });
            resultado.correos.push({ to, avisos: lista.length, ok: true });
            for (const i of lista) {
                registros.push({
                    oportunidadId: i.oportunidadId,
                    tipoFecha: i.tipoFecha,
                    fechaObjetivo: i.fechaObjetivo,
                    umbral: i.umbral,
                    destinatario: to,
                });
            }
        }
        catch (error) {
            /* Sin registro: se reintenta en la próxima ejecución. */
            resultado.correos.push({
                to,
                avisos: lista.length,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    if (registros.length > 0) {
        await prisma.oportunidadFechaAviso.createMany({ data: registros, skipDuplicates: true });
    }
    return resultado;
}
/* =========================================================
   CORREO
   ========================================================= */
function armarAsunto(lista) {
    const hoy = lista.filter((i) => i.dias === 0).length;
    const total = lista.length;
    return `Funnel: ${total} fecha${total === 1 ? "" : "s"} por atender${hoy > 0 ? ` (${hoy} hoy)` : ""}`;
}
function armarHtml(hoy, lista) {
    const celda = "padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top;";
    const cabecera = "padding:8px 10px;background:#ecfeff;color:#0e7490;font-size:11px;text-align:left;text-transform:uppercase;";
    const filas = lista
        .map((i) => {
        const color = i.dias === 0 ? "#be123c" : i.dias === 1 ? "#c2410c" : "#0f172a";
        const accion = i.tipoFecha === "PROXIMA_ACCION"
            ? etiquetaProximaAccion(i.oportunidad.proximaAccion)
            : null;
        const detalleTarea = i.tipoFecha === "PROXIMA_ACCION" ? i.oportunidad.detalleTarea : null;
        const detalle = (accion ? `<br><span style="color:#0f172a;">${escaparHtml(accion)}</span>` : "") +
            (detalleTarea
                ? `<br><span style="color:#64748b;font-size:12px;">${escaparHtml(detalleTarea)}</span>`
                : "");
        return `<tr>
<td style="${celda}color:${color};font-weight:bold;white-space:nowrap;">${textoDias(i.dias)}<br><span style="font-weight:normal;color:#64748b;">${escaparHtml(textoDia(i.dia))}</span></td>
<td style="${celda}"><b>${escaparHtml(ETIQUETA_FECHA[i.tipoFecha])}</b>${detalle}</td>
<td style="${celda}"><b>${escaparHtml(i.oportunidad.codigo)}</b> · ${escaparHtml(i.oportunidad.titulo)}${i.oportunidad.cliente ? `<br><span style="color:#64748b;">${escaparHtml(i.oportunidad.cliente)}</span>` : ""}</td>
<td style="${celda}color:#475569;white-space:nowrap;">${escaparHtml(ETIQUETA_ETAPA[i.oportunidad.etapa])}</td>
</tr>`;
    })
        .join("");
    const [y, m, d] = hoy.split("-");
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:860px;">
<h2 style="margin:0 0 4px;color:#0e7490;">Funnel comercial: fechas por atender</h2>
<p style="margin:0 0 16px;color:#64748b;font-size:13px;">Avisos del ${d}-${m}-${y} para tus oportunidades.</p>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;">
<thead><tr><th style="${cabecera}">Cuándo</th><th style="${cabecera}">Qué</th><th style="${cabecera}">Oportunidad</th><th style="${cabecera}">Etapa</th></tr></thead>
<tbody>${filas}</tbody></table>
<p style="color:#64748b;font-size:12px;">Si ya la atendiste, registra un seguimiento o actualiza la fecha en el funnel: la nueva fecha generará sus propios avisos.</p>
<p style="margin-top:20px;color:#94a3b8;font-size:11px;">Aviso automático del CRM RIDS. Se avisa 3 días antes, 1 día antes y el mismo día.</p>
</div>`;
}
//# sourceMappingURL=oportunidades-avisos.service.js.map