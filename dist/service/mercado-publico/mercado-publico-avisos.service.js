// src/service/mercado-publico/mercado-publico-avisos.service.ts
/* =========================================================
   AVISOS DE LICITACIONES (Mercado Público)

   Módulo propio: NO usa Recordatorio ni el resumen de pendientes.

   - Avisa los hitos activos a 7, 3, 1 y 0 días (días calendario de Chile).
   - Si un día no corrió el cron, recupera: se envía el umbral más chico
     que aún cubre los días que faltan (ej. faltan 2 días y no salió el
     de 3 → se envía el de 3).
   - Un aviso por (hito, fecha del hito, umbral) en LicitacionHitoAviso.
     Si la fecha se prorroga, cambia fechaObjetivo y se vuelve a avisar.
   - Destinatarios:
       CONVERTIDA  → responsable de la oportunidad + casilla común
       INTERESANTE → solo casilla común (solo hasta su cierre)
       NUEVA       → solo casilla común, en sección aparte "Sin revisar"
                     (solo hasta su cierre y solo TIPOS_AVISO_NUEVA)
   - Un correo por destinatario con todos sus hitos del día y los
     cambios de estado detectados en la sincronización previa.
   ========================================================= */
import { EstadoOportunidadMercadoPublico, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { sendEmail, } from "../correos-masivos/masivos-email-sender.service.js";
import { ETIQUETA_HITO, whereLicitacionesVigentes, whereNuevasConCierrePendiente, } from "./mercado-publico-hitos.service.js";
/* =========================================================
   CONFIGURACIÓN
   ========================================================= */
const ZONA_CHILE = "America/Santiago";
/** Días antes del hito en que se avisa (orden ascendente). */
export const UMBRALES_AVISO = [0, 1, 3, 7];
/*
 * Tipos de hito que generan aviso. Las aperturas técnica/económica
 * suelen ser el mismo día del cierre y no requieren acción: no se avisan.
 */
const TIPOS_CON_AVISO = new Set([
    "FINAL_PREGUNTAS",
    "PUBLICACION_RESPUESTAS",
    "VISITA_TERRENO",
    "ENTREGA_ANTECEDENTES",
    "SOPORTE_FISICO",
    "CIERRE",
    "ADJUDICACION",
    "FIRMA_CONTRATO",
    "OTRO",
]);
/*
 * Para las NUEVA (sin revisar) solo se avisan los hitos que exigen
 * actuar antes del cierre. Para avisar todos sus hitos, usar TIPOS_CON_AVISO.
 */
const TIPOS_AVISO_NUEVA = new Set([
    "FINAL_PREGUNTAS",
    "VISITA_TERRENO",
    "CIERRE",
]);
/** Casilla común (MERCADO_PUBLICO_AVISOS_CORREOS, separados por coma). */
function correosCasilla() {
    return (process.env.MERCADO_PUBLICO_AVISOS_CORREOS ?? "")
        .split(/[,;]/)
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.includes("@"));
}
const URL_FICHA_MP = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=";
/* =========================================================
   FECHAS (calendario de Chile)
   ========================================================= */
const formatoDiaChile = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
/** "YYYY-MM-DD" del día en Chile para un instante. */
export function diaChile(fecha) {
    return formatoDiaChile.format(fecha);
}
function diasEntre(desde, hasta) {
    const [ay, am, ad] = desde.split("-").map(Number);
    const [by, bm, bd] = hasta.split("-").map(Number);
    const a = Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1);
    const b = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1);
    return Math.round((b - a) / 86_400_000);
}
/** Hora actual en Chile (0-23). */
export function horaChileActual() {
    return Number(new Intl.DateTimeFormat("en-US", {
        timeZone: ZONA_CHILE,
        hour: "2-digit",
        hourCycle: "h23",
    }).format(new Date()));
}
const formatoFechaHora = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_CHILE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
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
export async function procesarAvisosLicitaciones(opciones = {}) {
    const simular = opciones.simular === true;
    const ahora = new Date();
    const hoy = diaChile(ahora);
    const casilla = correosCasilla();
    /*
     * 1. Hitos activos, entre ayer y +8 días, de licitaciones en seguimiento
     *    (INTERESANTE/CONVERTIDA) o NUEVA con cierre pendiente.
     */
    const hitos = await prisma.licitacionHito.findMany({
        where: {
            activo: true,
            fecha: {
                gte: new Date(ahora.getTime() - 36 * 3_600_000),
                lte: new Date(ahora.getTime() + 8 * 86_400_000),
            },
            oportunidadMercadoPublico: {
                OR: [
                    whereLicitacionesVigentes(),
                    whereNuevasConCierrePendiente(ahora),
                ],
            },
        },
        orderBy: { fecha: "asc" },
        include: {
            avisos: { select: { fechaObjetivo: true, umbral: true } },
            oportunidadMercadoPublico: {
                select: {
                    codigoExterno: true,
                    nombre: true,
                    organismoNombre: true,
                    estado: true,
                    score: true,
                    oportunidadVenta: {
                        select: {
                            codigo: true,
                            responsable: { select: { nombre: true, email: true, status: true } },
                        },
                    },
                },
            },
        },
    });
    const items = [];
    let sinDestinatarios = 0;
    for (const h of hitos) {
        const esNueva = h.oportunidadMercadoPublico.estado === EstadoOportunidadMercadoPublico.NUEVA;
        if (!(esNueva ? TIPOS_AVISO_NUEVA : TIPOS_CON_AVISO).has(h.tipo))
            continue;
        /* Un hito que ya pasó (aunque sea hoy) no se avisa. */
        if (h.fecha.getTime() < ahora.getTime())
            continue;
        const dias = diasEntre(hoy, diaChile(h.fecha));
        if (dias < 0 || dias > 7)
            continue;
        const umbral = UMBRALES_AVISO.find((u) => u >= dias);
        if (umbral === undefined)
            continue;
        const yaEnviado = h.avisos.some((a) => a.umbral === umbral && a.fechaObjetivo.getTime() === h.fecha.getTime());
        if (yaEnviado)
            continue;
        const omp = h.oportunidadMercadoPublico;
        const responsable = omp.oportunidadVenta?.responsable ?? null;
        const destinatarios = new Set(casilla);
        if (omp.estado === EstadoOportunidadMercadoPublico.CONVERTIDA &&
            responsable?.status &&
            responsable.email?.includes("@")) {
            destinatarios.add(responsable.email.trim().toLowerCase());
        }
        if (destinatarios.size === 0) {
            sinDestinatarios++;
            continue;
        }
        items.push({
            seccion: esNueva ? "NUEVA" : "SEGUIMIENTO",
            hitoId: h.id,
            fechaObjetivo: h.fecha,
            umbral,
            dias,
            tipo: h.tipo,
            descripcion: h.descripcion,
            fecha: h.fecha,
            licitacion: {
                codigoExterno: omp.codigoExterno,
                nombre: omp.nombre,
                organismoNombre: omp.organismoNombre,
                estado: omp.estado,
                score: omp.score,
                oportunidadCodigo: omp.oportunidadVenta?.codigo ?? null,
                responsable: responsable?.nombre ?? null,
            },
            destinatarios: [...destinatarios],
        });
    }
    /* 2. Cambios de estado detectados por la sincronización previa. */
    const cambios = await armarCambiosEstado(opciones.cambiosEstado ?? [], casilla);
    /* 3. Agrupar por destinatario. */
    const porDestinatario = new Map();
    const bucket = (to) => {
        let b = porDestinatario.get(to);
        if (!b) {
            b = { hitos: [], cambios: [] };
            porDestinatario.set(to, b);
        }
        return b;
    };
    for (const item of items)
        for (const to of item.destinatarios)
            bucket(to).hitos.push(item);
    for (const c of cambios)
        for (const to of c.destinatarios)
            bucket(to).cambios.push(c);
    const resultado = {
        hoy,
        simulado: simular,
        hitosEnRango: hitos.length,
        avisos: items.length,
        avisosNuevas: items.filter((i) => i.seccion === "NUEVA").length,
        sinDestinatarios,
        cambiosEstado: cambios.length,
        correos: [],
        detalle: items.map((i) => ({
            codigoExterno: i.licitacion.codigoExterno,
            tipo: i.tipo,
            dias: i.dias,
            umbral: i.umbral,
            destinatarios: i.destinatarios,
        })),
    };
    if (simular) {
        for (const [to, b] of porDestinatario) {
            resultado.correos.push({ to, hitos: b.hitos.length, cambios: b.cambios.length, ok: true });
        }
        return resultado;
    }
    /* 4. Enviar: un correo por destinatario. */
    const enviadosPorHito = new Map();
    for (const [to, b] of porDestinatario) {
        const asunto = armarAsunto(b.hitos, b.cambios);
        try {
            await sendEmail({ to, subject: asunto, bodyHtml: armarHtml(hoy, b.hitos, b.cambios) });
            resultado.correos.push({ to, hitos: b.hitos.length, cambios: b.cambios.length, ok: true });
            for (const item of b.hitos) {
                const lista = enviadosPorHito.get(item.hitoId) ?? [];
                lista.push(to);
                enviadosPorHito.set(item.hitoId, lista);
            }
        }
        catch (error) {
            resultado.correos.push({
                to,
                hitos: b.hitos.length,
                cambios: b.cambios.length,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /*
     * 5. Registrar solo los hitos que llegaron al menos a un destinatario.
     *    Si todos los envíos de un hito fallaron, no se registra y se
     *    reintenta en la próxima ejecución.
     */
    const registros = items
        .filter((i) => enviadosPorHito.has(i.hitoId))
        .map((i) => {
        const enviados = enviadosPorHito.get(i.hitoId) ?? [];
        const fallidos = i.destinatarios.filter((d) => !enviados.includes(d));
        return {
            hitoId: i.hitoId,
            fechaObjetivo: i.fechaObjetivo,
            umbral: i.umbral,
            destinatarios: enviados,
            estado: "ENVIADO",
            error: fallidos.length > 0 ? `No enviado a: ${fallidos.join(", ")}` : null,
        };
    });
    if (registros.length > 0) {
        await prisma.licitacionHitoAviso.createMany({ data: registros, skipDuplicates: true });
    }
    return resultado;
}
/* =========================================================
   CAMBIOS DE ESTADO
   ========================================================= */
async function armarCambiosEstado(cambios, casilla) {
    if (cambios.length === 0)
        return [];
    const licitaciones = await prisma.oportunidadMercadoPublico.findMany({
        where: { id: { in: cambios.map((c) => c.id) } },
        select: {
            id: true,
            codigoExterno: true,
            nombre: true,
            organismoNombre: true,
            estado: true,
            estadoMercadoPublico: true,
            oportunidadVenta: {
                select: { codigo: true, responsable: { select: { email: true, status: true } } },
            },
        },
    });
    const porId = new Map(licitaciones.map((l) => [l.id, l]));
    const salida = [];
    for (const c of cambios) {
        const l = porId.get(c.id);
        if (!l)
            continue;
        const destinatarios = new Set(casilla);
        const resp = l.oportunidadVenta?.responsable;
        if (l.estado === EstadoOportunidadMercadoPublico.CONVERTIDA &&
            resp?.status &&
            resp.email?.includes("@")) {
            destinatarios.add(resp.email.trim().toLowerCase());
        }
        if (destinatarios.size === 0)
            continue;
        salida.push({
            codigoExterno: l.codigoExterno,
            nombre: l.nombre,
            organismoNombre: l.organismoNombre,
            texto: c.texto ?? l.estadoMercadoPublico ?? `Código ${String(c.nuevo ?? "?")}`,
            oportunidadCodigo: l.oportunidadVenta?.codigo ?? null,
            destinatarios: [...destinatarios],
        });
    }
    return salida;
}
/* =========================================================
   CORREO
   ========================================================= */
function armarAsunto(hitos, cambios) {
    const seguimiento = hitos.filter((h) => h.seccion === "SEGUIMIENTO");
    const nuevas = hitos.filter((h) => h.seccion === "NUEVA");
    /* URGENTE solo por licitaciones en seguimiento (las NUEVA no alarman). */
    const urgentes = seguimiento.filter((h) => h.dias <= 1).length;
    const partes = [];
    if (seguimiento.length > 0)
        partes.push(`${seguimiento.length} hito${seguimiento.length === 1 ? "" : "s"} en seguimiento`);
    if (nuevas.length > 0)
        partes.push(`${nuevas.length} sin revisar por cerrar`);
    if (cambios.length > 0)
        partes.push(`${cambios.length} cambio${cambios.length === 1 ? "" : "s"} de estado`);
    return `${urgentes > 0 ? "URGENTE · " : ""}Licitaciones Mercado Público: ${partes.join(", ")}`;
}
function armarHtml(hoy, hitos, cambios) {
    const celda = "padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top;";
    const cabecera = "padding:8px 10px;background:#ecfeff;color:#0e7490;font-size:11px;text-align:left;text-transform:uppercase;";
    const linkLicitacion = (codigo, nombre, organismo) => `<a href="${URL_FICHA_MP}${encodeURIComponent(codigo)}" style="color:#0e7490;">${escaparHtml(codigo)}</a><br>${escaparHtml(nombre)}<br><span style="color:#64748b;">${escaparHtml(organismo)}</span>`;
    const celdaCuando = (h) => {
        const color = h.dias === 0 ? "#be123c" : h.dias === 1 ? "#c2410c" : "#0f172a";
        return `<td style="${celda}color:${color};font-weight:bold;white-space:nowrap;">${textoDias(h.dias)}</td>`;
    };
    const celdaHito = (h) => {
        const etiqueta = ETIQUETA_HITO[h.tipo] ?? h.tipo;
        const hito = h.tipo === "OTRO" && h.descripcion ? h.descripcion : etiqueta;
        return `<td style="${celda}"><b>${escaparHtml(hito)}</b><br><span style="color:#475569;">${escaparHtml(formatoFechaHora.format(h.fecha))}</span></td>`;
    };
    const tabla = (columnas, filas) => `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;">
<thead><tr>${columnas.map((c) => `<th style="${cabecera}">${c}</th>`).join("")}</tr></thead>
<tbody>${filas}</tbody></table>`;
    const seguimiento = hitos.filter((h) => h.seccion === "SEGUIMIENTO");
    const nuevas = hitos.filter((h) => h.seccion === "NUEVA");
    const filasSeguimiento = seguimiento
        .map((h) => {
        const funnel = h.licitacion.oportunidadCodigo
            ? `Funnel ${escaparHtml(h.licitacion.oportunidadCodigo)}${h.licitacion.responsable ? ` · ${escaparHtml(h.licitacion.responsable)}` : ""}`
            : "Interesante (sin convertir)";
        return `<tr>${celdaCuando(h)}${celdaHito(h)}
<td style="${celda}">${linkLicitacion(h.licitacion.codigoExterno, h.licitacion.nombre, h.licitacion.organismoNombre)}</td>
<td style="${celda}color:#475569;">${funnel}</td></tr>`;
    })
        .join("");
    const filasNuevas = nuevas
        .map((h) => `<tr>${celdaCuando(h)}${celdaHito(h)}
<td style="${celda}">${linkLicitacion(h.licitacion.codigoExterno, h.licitacion.nombre, h.licitacion.organismoNombre)}</td>
<td style="${celda}color:#475569;white-space:nowrap;">${h.licitacion.score}%</td></tr>`)
        .join("");
    const filasCambios = cambios
        .map((c) => `<tr>
<td style="${celda}">${linkLicitacion(c.codigoExterno, c.nombre, c.organismoNombre)}</td>
<td style="${celda}font-weight:bold;">${escaparHtml(c.texto)}</td>
<td style="${celda}color:#475569;">${c.oportunidadCodigo ? `Funnel ${escaparHtml(c.oportunidadCodigo)}` : "Interesante (sin convertir)"}</td>
</tr>`)
        .join("");
    const [y, m, d] = hoy.split("-");
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:860px;">
<h2 style="margin:0 0 4px;color:#0e7490;">Licitaciones Mercado Público</h2>
<p style="margin:0 0 16px;color:#64748b;font-size:13px;">Avisos del ${d}-${m}-${y}. Horas en hora de Chile.</p>
${seguimiento.length > 0 ? `<h3 style="margin:16px 0 8px;font-size:15px;">En seguimiento</h3>
${tabla(["Cuándo", "Hito", "Licitación", "Seguimiento"], filasSeguimiento)}` : ""}
${cambios.length > 0 ? `<h3 style="margin:20px 0 8px;font-size:15px;">Cambios de estado en Mercado Público</h3>
${tabla(["Licitación", "Nuevo estado", "Seguimiento"], filasCambios)}
<p style="color:#64748b;font-size:12px;">El CRM no cambia la etapa del funnel automáticamente: revisa y actualiza la oportunidad si corresponde.</p>` : ""}
${nuevas.length > 0 ? `<h3 style="margin:20px 0 4px;font-size:15px;">Sin revisar y por cerrar</h3>
<p style="margin:0 0 8px;color:#64748b;font-size:12px;">Licitaciones NUEVA que nadie ha marcado como interesante ni descartado. Márcalas en el CRM para dejar de recibirlas aquí.</p>
${tabla(["Cuándo", "Hito", "Licitación", "Afinidad"], filasNuevas)}` : ""}
<p style="margin-top:20px;color:#94a3b8;font-size:11px;">Aviso automático del CRM RIDS. Se avisa a 7, 3, 1 y 0 días de cada hito.</p>
</div>`;
}
//# sourceMappingURL=mercado-publico-avisos.service.js.map