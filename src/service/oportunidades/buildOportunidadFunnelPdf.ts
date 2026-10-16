// src/service/oportunidades/buildOportunidadFunnelPdf.ts
import PDFDocument
    from "pdfkit";

import type {
    OportunidadInformeData,
} from "./oportunidades-informe.types.js";


/* =========================================================
   LABELS
========================================================= */

const ETAPA_LABELS:
    Record<string, string> = {

    NUEVA:
        "Nueva",

    COTIZACION_PREPARACION:
        "Cotización en preparación",

    COTIZACION_ENVIADA:
        "Cotización enviada",

    NEGOCIACION:
        "Negociación",

    GANADA:
        "Ganada",

    PERDIDA:
        "Perdida",

    POSTERGADA:
        "Postergada",
};


const PRIORIDAD_LABELS:
    Record<string, string> = {

    BAJA:
        "Baja",

    MEDIA:
        "Media",

    ALTA:
        "Alta",

    URGENTE:
        "Urgente",
};


const ACCION_LABELS:
    Record<string, string> = {

    LLAMAR:
        "Llamar",

    WHATSAPP:
        "WhatsApp",

    ENVIAR_CORREO:
        "Enviar correo",

    VISITA_PRESENCIAL:
        "Visita presencial",

    CONTACTAR_CLIENTE:
        "Contactar cliente",

    LLAMAR_CLIENTE:
        "Llamar al cliente",

    VOLVER_LLAMAR_CLIENTE:
        "Llamar nuevamente",

    HACER_SEGUIMIENTO:
        "Hacer seguimiento",

    AGENDAR_REUNION:
        "Agendar reunión",

    REVISAR_COTIZACION:
        "Revisar cotización",

    AJUSTAR_PROPUESTA:
        "Ajustar propuesta",

    ESPERAR_RESPUESTA:
        "Esperar respuesta",

    NEGOCIAR:
        "Negociar",

    SOLICITAR_APROBACION:
        "Solicitar aprobación",

    CONFIRMAR_COMPRA:
        "Confirmar compra",

    CERRAR_OPORTUNIDAD:
        "Cerrar oportunidad",
};

function normalizarTextoPdf(
    value:
        string |
        null |
        undefined
): string {

    if (
        !value
    ) {
        return "";
    }

    return value
        .replace(
            /→/g,
            "->"
        )
        .replace(
            /⇒/g,
            "=>"
        )
        .replace(
            /•/g,
            "-"
        );
}


/* =========================================================
   HELPERS
========================================================= */

function texto(
    value:
        unknown
): string {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    return String(
        value
    );
}


function formatFecha(
    value:
        Date |
        string |
        null |
        undefined
): string {

    if (
        !value
    ) {
        return "—";
    }


    const fecha =
        new Date(
            value
        );


    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {
        return "—";
    }


    return new Intl.DateTimeFormat(
        "es-CL",
        {
            day:
                "2-digit",

            month:
                "2-digit",

            year:
                "numeric",

            timeZone:
                "America/Santiago",
        }
    ).format(
        fecha
    );
}


function formatFechaHora(
    value:
        Date |
        string |
        null |
        undefined
): string {

    if (
        !value
    ) {
        return "—";
    }


    const fecha =
        new Date(
            value
        );


    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {
        return "—";
    }


    return new Intl.DateTimeFormat(
        "es-CL",
        {
            day:
                "2-digit",

            month:
                "2-digit",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false,

            timeZone:
                "America/Santiago",
        }
    ).format(
        fecha
    );
}


function formatMonto(
    value:
        unknown,

    moneda:
        string = "CLP"
): string {

    if (
        value === null ||
        value === undefined
    ) {
        return "—";
    }


    const numero =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numero
        )
    ) {
        return "—";
    }


    if (
        moneda ===
        "USD"
    ) {
        return `US$${numero.toLocaleString(
            "es-CL",
            {
                minimumFractionDigits:
                    0,

                maximumFractionDigits:
                    2,
            }
        )} USD`;
    }


    return `$${Math.round(
        numero
    ).toLocaleString(
        "es-CL"
    )} CLP`;
}


function getEtapaLabel(
    value:
        string |
        null |
        undefined
): string {

    if (
        !value
    ) {
        return "—";
    }


    return ETAPA_LABELS[
        value
    ] ??
        value;
}


function getAccionLabel(
    value:
        string |
        null |
        undefined
): string {

    if (
        !value
    ) {
        return "—";
    }


    return ACCION_LABELS[
        value
    ] ??
        value;
}


/* =========================================================
   CREACIÓN DEL PDF
========================================================= */

export function buildOportunidadFunnelPdf(
    oportunidad:
        OportunidadInformeData
): Promise<Buffer> {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const doc =
                new PDFDocument({
                    size:
                        "A4",

                    margins: {
                        top:
                            45,

                        right:
                            45,

                        bottom:
                            45,

                        left:
                            45,
                    },

                    info: {
                        Title:
                            `Informe Funnel ${oportunidad.codigo}`,

                        Subject:
                            "Informe de trazabilidad comercial",

                        Author:
                            "RIDS",
                    },
                });


            const chunks:
                Buffer[] =
                [];


            doc.on(
                "data",
                (
                    chunk:
                        Buffer
                ) => {
                    chunks.push(
                        chunk
                    );
                }
            );


            doc.on(
                "end",
                () => {
                    resolve(
                        Buffer.concat(
                            chunks
                        )
                    );
                }
            );


            doc.on(
                "error",
                reject
            );


            /* =================================================
               HELPERS VISUALES
            ================================================= */

            function ensureSpace(
                height:
                    number = 100
            ) {

                const limite =
                    doc.page.height -
                    doc.page.margins.bottom;


                if (
                    doc.y +
                    height >
                    limite
                ) {
                    doc.addPage();
                }
            }


            function tituloSeccion(
                titulo:
                    string
            ) {

                ensureSpace(
                    60
                );


                doc
                    .moveDown(
                        0.8
                    )
                    .font(
                        "Helvetica-Bold"
                    )
                    .fontSize(
                        13
                    )
                    .text(
                        titulo
                    );


                doc
                    .moveDown(
                        0.35
                    )
                    .moveTo(
                        doc.page.margins.left,
                        doc.y
                    )
                    .lineTo(
                        doc.page.width -
                        doc.page.margins.right,
                        doc.y
                    )
                    .stroke();


                doc.moveDown(
                    0.6
                );
            }


            function campo(
                label:
                    string,

                value:
                    unknown
            ) {

                ensureSpace(
                    30
                );


                doc
                    .font(
                        "Helvetica-Bold"
                    )
                    .fontSize(
                        9.5
                    )
                    .text(
                        `${label}: `,
                        {
                            continued:
                                true,
                        }
                    )
                    .font(
                        "Helvetica"
                    )
                    .text(
                        texto(
                            value
                        )
                    );
            }


            function separador() {

                doc.moveDown(
                    0.4
                );

                doc
                    .moveTo(
                        doc.page.margins.left,
                        doc.y
                    )
                    .lineTo(
                        doc.page.width -
                        doc.page.margins.right,
                        doc.y
                    )
                    .strokeOpacity(
                        0.25
                    )
                    .stroke();

                doc.strokeOpacity(
                    1
                );

                doc.moveDown(
                    0.6
                );
            }


            /* =================================================
               CABECERA
            ================================================= */

            doc
                .font(
                    "Helvetica-Bold"
                )
                .fontSize(
                    18
                )
                .text(
                    "INFORME DE TRAZABILIDAD COMERCIAL",
                    {
                        align:
                            "center",
                    }
                );


            doc
                .moveDown(
                    0.25
                )
                .font(
                    "Helvetica"
                )
                .fontSize(
                    9
                )
                .text(
                    "Funnel comercial RIDS",
                    {
                        align:
                            "center",
                    }
                );


            doc.moveDown();


            campo(
                "Oportunidad",
                oportunidad.codigo
            );

            campo(
                "Título",
                oportunidad.titulo
            );

            campo(
                "Cliente / entidad",
                oportunidad.entidad
                    ?.nombre
            );

            campo(
                "Proyecto",
                oportunidad.proyecto
            );

            campo(
                "Responsable",
                oportunidad.responsable
                    ?.nombre
            );

            campo(
                "Etapa actual",
                getEtapaLabel(
                    oportunidad.etapa
                )
            );

            campo(
                "Prioridad",
                PRIORIDAD_LABELS[
                oportunidad.prioridad
                ] ??
                oportunidad.prioridad
            );

            campo(
                "Monto estimado",
                formatMonto(
                    oportunidad.montoEstimado,
                    oportunidad.moneda
                )
            );

            campo(
                "Fecha de creación",
                formatFechaHora(
                    oportunidad.createdAt
                )
            );

            campo(
                "Informe generado",
                formatFechaHora(
                    new Date()
                )
            );


            /* =================================================
               1. DATOS GENERALES
            ================================================= */

            tituloSeccion(
                "1. Datos generales"
            );


            campo(
                "Cliente",
                oportunidad.entidad
                    ?.nombre
            );

            campo(
                "RUT",
                oportunidad.entidad
                    ?.rut
            );

            campo(
                "Contacto",
                oportunidad.contactoNombre
            );

            campo(
                "Correo contacto",
                oportunidad.contactoEmail
            );

            campo(
                "Teléfono contacto",
                oportunidad.contactoTelefono
            );

            campo(
                "Responsable comercial",
                oportunidad.responsable
                    ?.nombre
            );

            campo(
                "Correo responsable",
                oportunidad.responsable
                    ?.email
            );

            campo(
                "Probabilidad de cierre",
                oportunidad.probabilidadCierre !==
                    null
                    ? `${oportunidad.probabilidadCierre}%`
                    : "—"
            );

            campo(
                "Fecha probable de cierre",
                formatFecha(
                    oportunidad.fechaProbableCierre
                )
            );

            campo(
                "Próxima acción",
                getAccionLabel(
                    oportunidad.proximaAccion
                )
            );

            campo(
                "Fecha próxima acción",
                formatFecha(
                    oportunidad.fechaProximaAccion
                )
            );


            if (
                oportunidad.observaciones
            ) {
                campo(
                    "Observaciones",
                    oportunidad.observaciones
                );
            }


            if (
                oportunidad.notas
            ) {
                campo(
                    "Notas",
                    oportunidad.notas
                );
            }


            /* =================================================
               2. COTIZACIONES
            ================================================= */

            tituloSeccion(
                `2. Cotizaciones relacionadas (${oportunidad.cotizaciones.length})`
            );


            if (
                oportunidad.cotizaciones.length ===
                0
            ) {

                doc
                    .font(
                        "Helvetica"
                    )
                    .fontSize(
                        9.5
                    )
                    .text(
                        "No existen cotizaciones actualmente vinculadas a esta oportunidad."
                    );

            } else {

                for (
                    const cotizacion
                    of oportunidad.cotizaciones
                ) {

                    ensureSpace(
                        130
                    );


                    doc
                        .font(
                            "Helvetica-Bold"
                        )
                        .fontSize(
                            11
                        )
                        .text(
                            `Cotización #${cotizacion.id}`
                        );


                    campo(
                        "Creada",
                        formatFechaHora(
                            cotizacion.createdAt
                        )
                    );

                    campo(
                        "Fecha cotización",
                        formatFecha(
                            cotizacion.fecha
                        )
                    );

                    campo(
                        "Estado",
                        cotizacion.estado
                    );

                    campo(
                        "Tipo",
                        cotizacion.tipo
                    );

                    campo(
                        "Cliente",
                        cotizacion.entidad
                            ?.nombre
                    );

                    campo(
                        "Responsable",
                        cotizacion.tecnico
                            ?.nombre ??
                        cotizacion.personaResponsable
                    );

                    campo(
                        "Subtotal",
                        formatMonto(
                            cotizacion.subtotal,
                            cotizacion.moneda
                        )
                    );

                    campo(
                        "IVA",
                        formatMonto(
                            cotizacion.iva,
                            cotizacion.moneda
                        )
                    );

                    campo(
                        "Total",
                        formatMonto(
                            cotizacion.total,
                            cotizacion.moneda
                        )
                    );


                    if (
                        cotizacion.comentariosCotizacion
                    ) {
                        campo(
                            "Comentarios",
                            cotizacion.comentariosCotizacion
                        );
                    }


                    /*
                     * Ítems
                     */
                    if (
                        cotizacion.items.length >
                        0
                    ) {

                        doc
                            .moveDown(
                                0.4
                            )
                            .font(
                                "Helvetica-Bold"
                            )
                            .fontSize(
                                9.5
                            )
                            .text(
                                "Detalle:"
                            );


                        for (
                            const item
                            of cotizacion.items
                        ) {

                            ensureSpace(
                                35
                            );


                            const nombreItem =
                                item.nombre ??
                                item.descripcion ??
                                `Ítem #${item.id}`;


                            doc
                                .font(
                                    "Helvetica"
                                )
                                .fontSize(
                                    9
                                )
                                .text(
                                    `• ${nombreItem} · ${item.cantidad} x ${formatMonto(
                                        item.precio,
                                        cotizacion.moneda
                                    )}`
                                );
                        }
                    }


                    /*
                     * Historial real de envío.
                     */
                    if (
                        cotizacion.envios.length >
                        0
                    ) {

                        doc
                            .moveDown(
                                0.5
                            )
                            .font(
                                "Helvetica-Bold"
                            )
                            .fontSize(
                                9.5
                            )
                            .text(
                                "Envíos registrados:"
                            );


                        for (
                            const envio
                            of cotizacion.envios
                        ) {

                            ensureSpace(
                                50
                            );


                            doc
                                .font(
                                    "Helvetica"
                                )
                                .fontSize(
                                    9
                                )
                                .text(
                                    `• ${formatFechaHora(
                                        envio.sentAt
                                    )} · Para: ${envio.to ?? "—"}`
                                );


                            if (
                                envio.subject
                            ) {
                                doc.text(
                                    `  Asunto: ${envio.subject}`
                                );
                            }


                            if (
                                envio.sentBy ||
                                envio.creadoPor
                            ) {
                                doc.text(
                                    `  Enviado por: ${envio.sentBy ??
                                    envio.creadoPor ??
                                    "—"
                                    }`
                                );
                            }
                        }
                    }


                    separador();
                }
            }


            /* =================================================
               3. SEGUIMIENTOS
            ================================================= */

            tituloSeccion(
                `3. Seguimientos y tareas (${oportunidad.seguimientos.length})`
            );


            if (
                oportunidad.seguimientos.length ===
                0
            ) {

                doc
                    .font(
                        "Helvetica"
                    )
                    .fontSize(
                        9.5
                    )
                    .text(
                        "No existen seguimientos registrados."
                    );

            } else {

                oportunidad.seguimientos.forEach(
                    (
                        seguimiento,
                        index
                    ) => {

                        ensureSpace(
                            130
                        );


                        doc
                            .font(
                                "Helvetica-Bold"
                            )
                            .fontSize(
                                10.5
                            )
                            .text(
                                `Seguimiento ${index + 1}`
                            );


                        campo(
                            "Creado",
                            formatFechaHora(
                                seguimiento.createdAt
                            )
                        );

                        campo(
                            "Registrado por",
                            seguimiento.autor
                                ?.nombre
                        );

                        campo(
                            "Acción",
                            getAccionLabel(
                                seguimiento.proximaAccion
                            )
                        );

                        campo(
                            "Fecha programada",
                            formatFecha(
                                seguimiento.fechaProximaAccion
                            )
                        );

                        campo(
                            "Estado",
                            seguimiento.estado
                        );


                        doc
                            .moveDown(
                                0.3
                            )
                            .font(
                                "Helvetica-Bold"
                            )
                            .fontSize(
                                9.5
                            )
                            .text(
                                "Detalle de la tarea:"
                            )
                            .font(
                                "Helvetica"
                            )
                            .text(
                                seguimiento.comentario
                            );


                        if (
                            seguimiento.notaEstado
                        ) {

                            doc
                                .moveDown(
                                    0.4
                                )
                                .font(
                                    "Helvetica-Bold"
                                )
                                .text(
                                    seguimiento.estado ===
                                        "COMPLETADA"
                                        ? "Resultado de la tarea:"
                                        : seguimiento.estado ===
                                            "CANCELADA"
                                            ? "Motivo de cancelación:"
                                            : "Nota del estado:"
                                )
                                .font(
                                    "Helvetica"
                                )
                                .text(
                                    seguimiento.notaEstado
                                );
                        }


                        if (
                            seguimiento.completadoAt
                        ) {

                            campo(
                                "Completada el",
                                formatFechaHora(
                                    seguimiento.completadoAt
                                )
                            );
                        }


                        separador();
                    }
                );
            }


            /* =================================================
               4. HISTORIAL DEL FUNNEL
            ================================================= */

            tituloSeccion(
                `4. Historial de etapas (${oportunidad.historialEtapas.length})`
            );


            if (
                oportunidad.historialEtapas.length ===
                0
            ) {

                doc
                    .font(
                        "Helvetica"
                    )
                    .fontSize(
                        9.5
                    )
                    .text(
                        "No existen cambios de etapa registrados."
                    );

            } else {

                for (
                    const evento
                    of oportunidad.historialEtapas
                ) {

                    ensureSpace(
                        90
                    );


                    doc
                        .font(
                            "Helvetica-Bold"
                        )
                        .fontSize(
                            10
                        )
                        .text(
                            evento.etapaAnterior
                                ? `${getEtapaLabel(
                                    evento.etapaAnterior
                                )} -> ${getEtapaLabel(
                                    evento.etapaNueva
                                )}`
                                : `Creación -> ${getEtapaLabel(
                                    evento.etapaNueva
                                )}`
                        );


                    campo(
                        "Fecha",
                        formatFechaHora(
                            evento.createdAt
                        )
                    );

                    campo(
                        "Realizado por",
                        evento.actor
                            ?.nombre ??
                        "Sistema"
                    );


                    if (
                        normalizarTextoPdf(
                            evento.nota
                        )
                    ) {

                        doc
                            .moveDown(
                                0.3
                            )
                            .font(
                                "Helvetica-Bold"
                            )
                            .fontSize(
                                9.5
                            )
                            .text(
                                "Motivo / detalle:"
                            )
                            .font(
                                "Helvetica"
                            )
                            .text(
                                normalizarTextoPdf(
                                    evento.nota
                                )
                            );
                    }


                    separador();
                }
            }


            /* =================================================
               5. LÍNEA DE TIEMPO CONSOLIDADA
            ================================================= */

            tituloSeccion(
                "5. Línea de tiempo consolidada"
            );


            type EventoTimeline = {
                fecha:
                Date;

                texto:
                string;

                detalle?:
                string;
            };


            const timeline:
                EventoTimeline[] =
                [];


            /*
             * Creación oportunidad.
             */
            timeline.push({
                fecha:
                    oportunidad.createdAt,

                texto:
                    `Oportunidad ${oportunidad.codigo} creada.`,
            });


            /*
             * Cotizaciones.
             */
            for (
                const cotizacion
                of oportunidad.cotizaciones
            ) {

                timeline.push({
                    fecha:
                        cotizacion.createdAt,

                    texto:
                        `Cotización #${cotizacion.id} creada.`,

                    detalle:
                        `${cotizacion.estado} · ${formatMonto(
                            cotizacion.total,
                            cotizacion.moneda
                        )}`,
                });


                for (
                    const envio
                    of cotizacion.envios
                ) {

                    timeline.push({
                        fecha:
                            envio.sentAt,

                        texto:
                            `Cotización #${cotizacion.id} enviada.`,

                        ...(envio.to
                            ? {
                                detalle:
                                    `Destinatario: ${envio.to}`,
                            }
                            : {}),
                    });
                }
            }


            /*
             * Seguimientos.
             */
            for (
                const seguimiento
                of oportunidad.seguimientos
            ) {

                timeline.push({
                    fecha:
                        seguimiento.createdAt,

                    texto:
                        `Tarea registrada: ${getAccionLabel(
                            seguimiento.proximaAccion
                        )}.`,

                    detalle:
                        seguimiento.comentario,
                });


                if (
                    seguimiento.completadoAt
                ) {

                    timeline.push({
                        fecha:
                            seguimiento.completadoAt,

                        texto:
                            "Tarea completada.",

                        ...(seguimiento.notaEstado
                            ? {
                                detalle:
                                    seguimiento.notaEstado,
                            }
                            : {}),
                    });
                }
            }


            /*
             * Historial de etapas.
             */
            for (
                const cambio
                of oportunidad.historialEtapas
            ) {

                timeline.push({
                    fecha:
                        cambio.createdAt,

                    texto:
                        cambio.etapaAnterior
                            ? `Etapa: ${getEtapaLabel(
                                cambio.etapaAnterior
                            )} -> ${getEtapaLabel(
                                cambio.etapaNueva
                            )}.`
                            : `Ingreso al Funnel en ${getEtapaLabel(
                                cambio.etapaNueva
                            )}.`,

                    ...(cambio.nota
                        ? {
                            detalle:
                                cambio.nota,
                        }
                        : {}),
                });
            }


            timeline.sort(
                (
                    a,
                    b
                ) =>
                    a.fecha.getTime() -
                    b.fecha.getTime()
            );


            for (
                const evento
                of timeline
            ) {

                ensureSpace(
                    55
                );


                doc
                    .font(
                        "Helvetica-Bold"
                    )
                    .fontSize(
                        9
                    )
                    .text(
                        `${formatFechaHora(
                            evento.fecha
                        )} · ${evento.texto}`
                    );


                if (
                    evento.detalle
                ) {

                    doc
                        .font(
                            "Helvetica"
                        )
                        .fontSize(
                            8.5
                        )
                        .text(
                            evento.detalle,
                            {
                                indent:
                                    12,
                            }
                        );
                }


                doc.moveDown(
                    0.35
                );
            }


            /* =================================================
               6. ESTADO ACTUAL / CIERRE
            ================================================= */

            tituloSeccion(
                "6. Estado actual"
            );


            campo(
                "Etapa",
                getEtapaLabel(
                    oportunidad.etapa
                )
            );

            campo(
                "Último contacto",
                formatFechaHora(
                    oportunidad.fechaUltimoContacto
                )
            );

            campo(
                "Próxima acción",
                getAccionLabel(
                    oportunidad.proximaAccion
                )
            );

            campo(
                "Fecha próxima acción",
                formatFecha(
                    oportunidad.fechaProximaAccion
                )
            );


            if (
                oportunidad.etapa ===
                "GANADA"
            ) {

                campo(
                    "Fecha de cierre",
                    formatFecha(
                        oportunidad.fechaCierre
                    )
                );

                campo(
                    "Monto final",
                    formatMonto(
                        oportunidad.montoFinal,
                        oportunidad.moneda
                    )
                );
            }


            if (
                oportunidad.etapa ===
                "PERDIDA"
            ) {

                campo(
                    "Fecha de cierre",
                    formatFecha(
                        oportunidad.fechaCierre
                    )
                );

                campo(
                    "Motivo de pérdida",
                    oportunidad.motivoPerdida
                );
            }


            if (
                oportunidad.etapa ===
                "POSTERGADA"
            ) {

                campo(
                    "Motivo de postergación",
                    oportunidad.motivoPostergacion
                );

                campo(
                    "Fecha de reactivación",
                    formatFecha(
                        oportunidad.fechaReactivacion
                    )
                ); " -> "
            }


            doc
                .moveDown(
                    1.5
                )
                .font(
                    "Helvetica"
                )
                .fontSize(
                    7.5
                )
                .text(
                    "Documento generado automáticamente desde el Funnel comercial de RIDS. La información corresponde a los datos registrados en el sistema al momento de su generación.",
                    {
                        align:
                            "center",
                    }
                );


            /*
             * Finaliza el stream.
             */
            doc.end();
        }
    );
}