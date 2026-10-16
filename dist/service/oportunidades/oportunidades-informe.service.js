import { prisma, } from "../../lib/prisma.js";
import { transporter, } from "../../lib/mailer.js";
import { OportunidadNoEncontradaError, } from "./oportunidades.service.js";
import { oportunidadInformeInclude, } from "./oportunidades-informe.types.js";
import { buildOportunidadFunnelPdf, } from "./buildOportunidadFunnelPdf.js";
/* =========================================================
   HELPERS
========================================================= */
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function sanitizeFileName(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}
const ETAPA_LABELS = {
    NUEVA: "Nueva",
    COTIZACION_PREPARACION: "Cotización en preparación",
    COTIZACION_ENVIADA: "Cotización enviada",
    NEGOCIACION: "Negociación",
    GANADA: "Ganada",
    PERDIDA: "Perdida",
    POSTERGADA: "Postergada",
};
function getEtapaLabel(etapa) {
    return ETAPA_LABELS[etapa] ??
        etapa;
}
/* =========================================================
   OBTENER INFORMACIÓN COMPLETA
========================================================= */
export async function obtenerDatosInformeOportunidad(oportunidadId) {
    const oportunidad = await prisma
        .oportunidadVenta
        .findUnique({
        where: {
            id: oportunidadId,
        },
        include: oportunidadInformeInclude,
    });
    if (!oportunidad) {
        throw new OportunidadNoEncontradaError();
    }
    return oportunidad;
}
/* =========================================================
   GENERAR + ENVIAR
========================================================= */
export async function enviarInformeOportunidad(input) {
    /*
     * =====================================================
     * 1. OBTENER DATOS
     * =====================================================
     */
    const oportunidad = await obtenerDatosInformeOportunidad(input.oportunidadId);
    /*
     * =====================================================
     * 2. GENERAR PDF
     *
     * El PDF existe solamente como Buffer en memoria.
     * No se guarda en BD, disco ni Supabase.
     * =====================================================
     */
    const pdfBuffer = await buildOportunidadFunnelPdf(oportunidad);
    /*
     * =====================================================
     * 3. CONFIGURAR REMITENTE
     * =====================================================
     */
    const from = process.env.SMTP_FROM
        ?.trim() ||
        process.env.SMTP_USER
            ?.trim();
    if (!from) {
        throw new Error("SMTP_FROM o SMTP_USER no está configurado.");
    }
    /*
     * =====================================================
     * 4. NOMBRE DEL ARCHIVO
     * =====================================================
     */
    const codigoSeguro = sanitizeFileName(oportunidad.codigo);
    const nombreArchivo = `Informe_Funnel_${codigoSeguro}.pdf`;
    /*
     * =====================================================
     * 5. MENSAJE OPCIONAL
     * =====================================================
     */
    const mensajeHtml = input.mensaje
        ?.trim()
        ? `
                <p
                    style="
                        margin: 0 0 16px;
                        white-space: pre-line;
                    "
                >
                    ${escapeHtml(input.mensaje.trim())}
                </p>
            `
        : "";
    /*
     * =====================================================
     * 6. CUERPO DEL CORREO
     * =====================================================
     */
    const cliente = oportunidad.entidad
        ?.nombre ??
        "Sin cliente";
    const proyecto = oportunidad.proyecto ??
        "Sin proyecto";
    const bodyHtml = `
        <!doctype html>

        <html lang="es">
            <body
                style="
                    margin: 0;
                    padding: 24px;
                    background: #f8fafc;
                    font-family:
                        Arial,
                        Helvetica,
                        sans-serif;
                    color: #334155;
                "
            >

                <div
                    style="
                        max-width: 680px;
                        margin: 0 auto;
                        background: #ffffff;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 24px;
                    "
                >

                    <h2
                        style="
                            margin: 0 0 8px;
                            color: #0f172a;
                        "
                    >
                        Informe de trazabilidad comercial
                    </h2>


                    <p
                        style="
                            margin: 0 0 20px;
                            color: #64748b;
                        "
                    >
                        Funnel comercial RIDS
                    </p>


                    ${mensajeHtml}


                    <p>
                        Se adjunta el informe de respaldo de la
                        siguiente oportunidad comercial:
                    </p>


                    <table
                        style="
                            width: 100%;
                            border-collapse: collapse;
                            margin: 18px 0;
                        "
                    >

                        <tr>
                            <td
                                style="
                                    padding: 7px;
                                    font-weight: bold;
                                    color: #475569;
                                "
                            >
                                Oportunidad
                            </td>

                            <td
                                style="
                                    padding: 7px;
                                "
                            >
                                ${escapeHtml(oportunidad.codigo)}
                            </td>
                        </tr>


                        <tr>
                            <td
                                style="
                                    padding: 7px;
                                    font-weight: bold;
                                    color: #475569;
                                "
                            >
                                Título
                            </td>

                            <td
                                style="
                                    padding: 7px;
                                "
                            >
                                ${escapeHtml(oportunidad.titulo)}
                            </td>
                        </tr>


                        <tr>
                            <td
                                style="
                                    padding: 7px;
                                    font-weight: bold;
                                    color: #475569;
                                "
                            >
                                Cliente
                            </td>

                            <td
                                style="
                                    padding: 7px;
                                "
                            >
                                ${escapeHtml(cliente)}
                            </td>
                        </tr>


                        <tr>
                            <td
                                style="
                                    padding: 7px;
                                    font-weight: bold;
                                    color: #475569;
                                "
                            >
                                Proyecto
                            </td>

                            <td
                                style="
                                    padding: 7px;
                                "
                            >
                                ${escapeHtml(proyecto)}
                            </td>
                        </tr>


                        <tr>
                            <td
                                style="
                                    padding: 7px;
                                    font-weight: bold;
                                    color: #475569;
                                "
                            >
                                Etapa actual
                            </td>

                            <td
                                style="
                                    padding: 7px;
                                "
                            >
                                ${escapeHtml(getEtapaLabel(oportunidad.etapa))}
                            </td>
                        </tr>

                    </table>


                    <p
                        style="
                            margin-top: 20px;
                        "
                    >
                        El documento adjunto contiene:
                    </p>


                    <ul
                        style="
                            padding-left: 22px;
                            line-height: 1.7;
                        "
                    >
                        <li>
                            datos generales de la oportunidad;
                        </li>

                        <li>
                            cotizaciones relacionadas;
                        </li>

                        <li>
                            historial de envío de cotizaciones;
                        </li>

                        <li>
                            seguimientos y tareas;
                        </li>

                        <li>
                            resultados y motivos de cancelación;
                        </li>

                        <li>
                            cambios de etapa y sus motivos;
                        </li>

                        <li>
                            línea de tiempo del proceso comercial.
                        </li>
                    </ul>


                    <p
                        style="
                            margin-top: 24px;
                            font-size: 12px;
                            color: #94a3b8;
                        "
                    >
                        Informe generado automáticamente por el
                        sistema RIDS.
                    </p>

                </div>

            </body>
        </html>
        `;
    /*
     * =====================================================
     * 7. ENVÍO SMTP
     *
     * Nodemailer acepta directamente un Buffer.
     *
     * No hace falta:
     *
     * pdfBuffer.toString("base64")
     *
     * porque no estamos usando tu capa de correo masivo,
     * sino transporter.sendMail directamente.
     * =====================================================
     */
    const info = await transporter.sendMail({
        from,
        to: input.destinatarios
            .join(", "),
        subject: `Informe Funnel · ${oportunidad.codigo} · ${oportunidad.titulo}`,
        html: bodyHtml,
        attachments: [
            {
                filename: nombreArchivo,
                content: pdfBuffer,
                contentType: "application/pdf",
            },
        ],
    });
    /*
     * =====================================================
     * 8. RESPONSE
     *
     * Importante:
     * no guardamos el PDF.
     * =====================================================
     */
    return {
        enviado: true,
        oportunidadId: oportunidad.id,
        codigo: oportunidad.codigo,
        destinatarios: input.destinatarios,
        nombreArchivo,
        messageId: info.messageId,
    };
}
//# sourceMappingURL=oportunidades-informe.service.js.map