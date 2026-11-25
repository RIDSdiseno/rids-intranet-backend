// src/service/baseapi/cobranza/pago-recibido.service.ts
/* =========================================================
   «PAGO RECIBIDO» AL CLIENTE

   Equivalente al «Pago Recibido» de Duemint: cuando una factura queda
   PAGADA (registrar pago, abono que completa el saldo o conciliación de
   la cartola), se avisa a los contactos marcados para Cobranza del cliente.

   - Lo decide quien registra el pago (casilla «Avisar al cliente»).
   - Nunca para AJUSTE ni para pagos importados de Duemint (no pasan por aquí).
   - Un correo por contacto. Queda en RcvRecordatorioEnvio con
     tipoRecordatorio PAGO_RECIBIDO (se ve en el historial del cliente y en
     la cola), sin reintentos de la cobranza automática.
   - Mismas guardas que la cobranza: COBRANZA_TEST_EMAIL / COBRANZA_LIVE_SEND.
========================================================= */
import { prisma } from "../../../lib/prisma.js";
import { graphFinanzasService } from "../graph-finanzas.service.js";
import { adjuntoLogoEmpresa, htmlLogoEmpresa } from "../email-logo-empresa.js";
import { getConfigCorreoEmpresa } from "./cobranza-empresa.config.js";
export const TIPO_PAGO_RECIBIDO = "PAGO_RECIBIDO";
/** Intentos máximos de la cobranza automática: así nunca toma estos registros. */
const SIN_REINTENTOS = 3;
const FORMAS_PAGO = {
    TRANSFERENCIA: "Transferencia",
    EFECTIVO: "Efectivo",
    TARJETA: "Tarjeta",
    CHEQUE: "Cheque",
    CONTADO: "Contado",
    CREDITO: "Crédito",
    VALIDACION_MANUAL: "Validación manual",
    OTRO: "Otro",
};
const NOMBRE_TIPO_DOC = { "33": "Factura", "34": "Factura exenta", "56": "Nota de débito" };
function escaparHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function formatearMonto(monto) {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(monto);
}
function formatearFecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function normalizarRut(value) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}
export function construirAsuntoPagoRecibido(empresaKey, folio) {
    return `${getConfigCorreoEmpresa(empresaKey).nombre} - Pago recibido factura N° ${folio}`;
}
function construirHtmlPagoRecibido(params) {
    const config = getConfigCorreoEmpresa(params.empresaKey);
    const empresa = config.nombre;
    const documento = `${NOMBRE_TIPO_DOC[params.tipoDoc] ?? `DTE ${params.tipoDoc}`} N° ${params.folio}`;
    const forma = params.formaPago ? FORMAS_PAGO[params.formaPago] ?? params.formaPago : null;
    const fila = (label, valor, destacado = false) => `
        <tr>
            <td style="padding:11px 14px;width:40%;background:#F8FAFC;border-bottom:1px solid #E5E7EB;color:#64748B;font-size:13px;font-weight:600;">${escaparHtml(label)}</td>
            <td style="padding:11px 14px;border-bottom:1px solid #E5E7EB;color:#0F172A;font-size:${destacado ? "16px" : "14px"};font-weight:${destacado ? "800" : "600"};">${escaparHtml(valor)}</td>
        </tr>`;
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#E9EEF3;font-family:Arial,Helvetica,sans-serif;color:#1F2937;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#E9EEF3;border-collapse:collapse;">
<tr><td align="center" style="padding:30px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:650px;background:#FFFFFF;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;border:1px solid #DDE3EA;">

<tr><td style="padding:30px 32px 24px;background:#FFFFFF;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>
        <td valign="middle">
            <div style="font-size:26px;font-weight:800;color:#111827;line-height:1.2;">${escaparHtml(empresa)}</div>
            <div style="margin-top:6px;font-size:13px;color:#64748B;">Gestión de facturación y cobranza</div>
        </td>
        <td valign="middle" align="right" style="text-align:right;padding-left:16px;width:1%;white-space:nowrap;">${htmlLogoEmpresa(params.empresaKey, empresa)}</td>
    </tr></table>
</td></tr>

<tr><td style="padding:18px 32px;background:#16A34A;color:#FFFFFF;">
    <div style="font-size:22px;font-weight:700;line-height:1.25;">Pago recibido</div>
</td></tr>

<tr><td style="padding:30px 32px;font-size:14px;line-height:1.65;">
    <p style="margin:0 0 18px;color:#334155;">${escaparHtml(params.nombreDestino?.trim() || "Estimado(a)")}:</p>
    <p style="margin:0 0 18px;color:#334155;">
        Junto con saludar, le confirmamos que con fecha <strong>${escaparHtml(formatearFecha(params.fechaPago))}</strong> hemos recibido
        satisfactoriamente su pago por <strong>${escaparHtml(formatearMonto(params.montoPago))}</strong>${forma ? ` mediante <strong>${escaparHtml(forma)}</strong>` : ""},
        correspondiente al siguiente documento:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0;border-collapse:separate;border-spacing:0;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
        ${fila("Documento", documento)}
        ${params.razonSocial ? fila("Cliente", params.razonSocial) : ""}
        ${params.montoFactura !== params.montoPago ? fila("Monto del documento", formatearMonto(params.montoFactura)) : ""}
        ${fila("Monto recibido", formatearMonto(params.montoPago), true)}
        ${fila("Fecha de pago", formatearFecha(params.fechaPago))}
        ${forma ? fila("Forma de pago", forma) : ""}
        ${fila("Estado", "Pagada")}
    </table>

    <p style="margin:24px 0 0;color:#334155;">Muchas gracias por su pago.</p>
    <p style="margin:18px 0 0;color:#334155;">Saludos cordiales,<br /><strong>${escaparHtml(empresa)}</strong></p>
</td></tr>

<tr><td style="padding:20px 32px;background:#F8FAFC;border-top:1px solid #E5E7EB;color:#64748B;font-size:12px;line-height:1.6;">
    <strong style="color:#475569;">${escaparHtml(empresa)}</strong>
    ${config.correo ? `<br />${escaparHtml(config.correo)}` : ""}
    ${config.telefono ? `<br />${escaparHtml(config.telefono)}` : ""}
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;
}
/**
 * Envía «Pago recibido» a los contactos de Cobranza del cliente.
 * No lanza errores: devuelve qué se envió y qué falló (el pago ya quedó registrado).
 */
export async function notificarPagoRecibido(params) {
    const resultado = { enviados: [], errores: [], omitido: null };
    try {
        if (params.formaPago === "AJUSTE") {
            resultado.omitido = "Ajuste interno: no se avisa al cliente.";
            return resultado;
        }
        const rut = normalizarRut(params.rutContraparte);
        const receptor = await prisma.receptorCobranza.findUnique({
            where: { rut },
            include: { contactos: { where: { activo: true, recibeCobranza: true }, orderBy: [{ principal: "desc" }, { id: "asc" }] } },
        });
        const emails = [...new Map((receptor?.contactos ?? []).map((c) => [c.email.trim().toLowerCase(), c])).values()];
        if (emails.length === 0) {
            resultado.omitido = "El cliente no tiene contactos marcados para Cobranza.";
            return resultado;
        }
        const testEmail = process.env.COBRANZA_TEST_EMAIL?.trim().toLowerCase();
        const envioReal = String(process.env.COBRANZA_LIVE_SEND ?? "").trim().toLowerCase() === "true";
        if (!testEmail && !envioReal) {
            resultado.omitido = "Envío real bloqueado: configura COBRANZA_TEST_EMAIL o COBRANZA_LIVE_SEND=true.";
            return resultado;
        }
        const asunto = construirAsuntoPagoRecibido(params.empresaKey, params.folio);
        const cicloVencimiento = `PAGO-${params.fechaPago}`;
        const logo = adjuntoLogoEmpresa(params.empresaKey);
        for (const contacto of emails) {
            const email = contacto.email.trim().toLowerCase();
            const clave = {
                empresaKey: params.empresaKey,
                tipoRcv: "ventas",
                tipoDoc: params.tipoDoc,
                folio: params.folio,
                rutContraparte: rut,
                cicloVencimiento,
                tipoRecordatorio: TIPO_PAGO_RECIBIDO,
                emailDestino: email,
            };
            const previo = await prisma.rcvRecordatorioEnvio.findUnique({
                where: { empresaKey_tipoRcv_tipoDoc_folio_rutContraparte_cicloVencimiento_tipoRecordatorio_emailDestino: clave },
                select: { estado: true },
            });
            // Mismo pago ya avisado (por ejemplo, se deshizo y se volvió a conciliar el mismo día).
            if (previo?.estado === "ENVIADO")
                continue;
            let error = null;
            try {
                await graphFinanzasService.sendMail({
                    to: testEmail || email,
                    subject: asunto,
                    bodyHtml: construirHtmlPagoRecibido({ ...params, nombreDestino: contacto.nombre }),
                    ...(logo ? { attachments: [logo] } : {}),
                });
            }
            catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            const datos = {
                razonSocial: params.razonSocial,
                nombreDestino: contacto.nombre,
                asunto,
                estado: error ? "ERROR" : "ENVIADO",
                automatico: true,
                montoTotal: params.montoPago,
                enviadoAt: error ? null : new Date(),
                error,
                intentos: SIN_REINTENTOS,
                procesandoAt: null,
                ultimoIntentoAt: new Date(),
            };
            await prisma.rcvRecordatorioEnvio.upsert({
                where: { empresaKey_tipoRcv_tipoDoc_folio_rutContraparte_cicloVencimiento_tipoRecordatorio_emailDestino: clave },
                create: { ...clave, ...datos },
                update: datos,
            });
            if (error)
                resultado.errores.push({ email, error });
            else
                resultado.enviados.push(email);
            console.log(error ? "[PAGO RECIBIDO] ❌ Error" : "[PAGO RECIBIDO] ✅ Enviado", {
                empresa: params.empresaKey,
                documento: `${params.tipoDoc}-${params.folio}`,
                email,
                destinatarioReal: testEmail || email,
                ...(error ? { error } : {}),
            });
        }
    }
    catch (e) {
        resultado.errores.push({ email: "-", error: e instanceof Error ? e.message : String(e) });
        console.error("[PAGO RECIBIDO] ❌ Error preparando el aviso", e);
    }
    return resultado;
}
/** Texto corto para la pantalla. */
export function resumenAvisoPago(aviso) {
    if (!aviso)
        return "";
    if (aviso.enviados.length > 0)
        return `Aviso de pago enviado a ${aviso.enviados.join(", ")}.`;
    if (aviso.errores.length > 0)
        return `No se pudo enviar el aviso de pago: ${aviso.errores[0]?.error ?? "error"}.`;
    return aviso.omitido ? `Sin aviso de pago: ${aviso.omitido}` : "";
}
//# sourceMappingURL=pago-recibido.service.js.map