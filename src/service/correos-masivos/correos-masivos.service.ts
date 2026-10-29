// src/service/correos-masivos/correos-masivos.service.ts
import {
    sendEmail,
} from "./masivos-email-sender.service.js";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    createMailerJob,
    getMailerJob,
} from "./correos-masivos-job.service.js";

import type {
    MailerJob,
} from "./correos-masivos-job.service.js";

import {
    prepararFirmaParaEnvio,
    prepararPlantillaParaEnvio,
} from "./correos-masivos-template.service.js";

import {
    ticketEmailTemplateService,
} from "../email/reply-templates/ticket-email-template.service.js";

// =====================================================
// TYPES
// =====================================================

export type MailAttachment = {
    name: string;

    contentType: string;

    contentBytes: string;

    size?: number;

    isInline?: boolean;

    contentId?: string;
};

type MailTarget = {
    id?: number;

    nombre?: string;

    email?: string;

    attachments?:
    MailAttachment[];
};

type MailerUser = {
    id?:
    number |
    string;

    email?: string;
};

type MailerSender = {
    id:
    number;

    nombre:
    string |
    null;

    email:
    string |
    null;

    cargo:
    string |
    null;

    area:
    string |
    null;

    firmaTexto:
    string |
    null;

    firmaPath:
    string |
    null;
};

type EnvioMasivoInput = {
    targets:
    MailTarget[];

    subject:
    string;

    bodyHtml?:
    string;

    plantillaId?:
    number;

    attachments?:
    MailAttachment[];

    user?:
    MailerUser |
    null;
};


// =====================================================
// CONSTANTS
// =====================================================

const EMAIL_RE =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAILER_FIRMA_TECNICO_ID =
    Number(
        process.env.MAILER_FIRMA_TECNICO_ID
    );

function getMailerFirmaTecnicoId(): number {

    if (
        !Number.isInteger(
            MAILER_FIRMA_TECNICO_ID
        ) ||
        MAILER_FIRMA_TECNICO_ID <= 0
    ) {
        throw new Error(
            "MAILER_FIRMA_TECNICO_ID no está configurado correctamente"
        );
    }

    return MAILER_FIRMA_TECNICO_ID;
}

// =====================================================
// MAIN
// =====================================================

export async function iniciarEnvioMasivo({
    targets,
    subject,
    bodyHtml,
    plantillaId,
    attachments = [],
    user,
}: EnvioMasivoInput) {

    const validTargets =
        targets
            .map(
                (
                    target
                ) => ({
                    ...target,

                    email:
                        target.email
                            ?.trim() ??
                        "",
                })
            )
            .filter(
                (
                    target
                ) =>
                    EMAIL_RE.test(
                        target.email
                    )
            );

    if (
        validTargets.length === 0
    ) {
        throw new Error(
            "No existen destinatarios válidos"
        );
    }


    // =================================================
    // CONTENIDO
    // =================================================

    let finalBodyHtml =
        bodyHtml?.trim() ??
        "";

    let templateAttachments:
        MailAttachment[] =
        [];


    // =================================================
    // PLANTILLA PRINCIPAL
    // =================================================

    if (
        plantillaId !== undefined &&
        plantillaId !== null
    ) {

        const preparada =
            await prepararPlantillaParaEnvio(
                plantillaId
            );

        finalBodyHtml =
            preparada.bodyHtml;

        templateAttachments =
            preparada.attachments;
    }


    // =================================================
    // VALIDAR CONTENIDO
    // =================================================

    if (
        !finalBodyHtml
    ) {
        throw new Error(
            "El correo debe incluir contenido HTML o una plantilla válida"
        );
    }


    // =================================================
    // USUARIO QUE REALIZA EL ENVÍO
    // =================================================

    const usuarioAutenticado =
        await resolverUsuarioAutenticado(
            user
        );


    const sentBy =
        usuarioAutenticado?.nombre ??
        usuarioAutenticado?.email ??
        user?.email ??
        null;

    // =================================================
    // FIRMA CORPORATIVA SOPORTE RIDS
    // =================================================

    const firma =
        await obtenerFirmaMailer();


    if (
        !firma.html
    ) {
        throw new Error(
            "No fue posible generar la firma corporativa de Soporte RIDS"
        );
    }


    finalBodyHtml =
        `
${finalBodyHtml}

${firma.html}
`.trim();

    // =================================================
    // ADJUNTOS
    // =================================================

    const finalAttachments:
        MailAttachment[] = [
            ...templateAttachments,
            ...attachments,
        ];


    // =================================================
    // JOB
    // =================================================

    const job =
        createMailerJob(
            validTargets.length
        );

    // =================================================
    // PRE-REGISTRO
    // =================================================

    await registrarEnviosIniciales({
        jobId:
            job.id,

        targets:
            validTargets,

        subject,

        attachments:
            finalAttachments,

        sentBy,
    });


    // =================================================
    // ENVÍO ASÍNCRONO
    // =================================================

    void procesarEnvioMasivo({
        job,

        targets:
            validTargets,

        subject,

        bodyHtml:
            finalBodyHtml,

        globalAttachments:
            finalAttachments,
    });


    return {
        queued:
            true,

        jobId:
            job.id,

        requested:
            targets.length,

        queuedCount:
            validTargets.length,

        ratePerMin:
            0,

        estimatedCompletionMs:
            0,
    };
}


// =====================================================
// JOB STATUS
// =====================================================

export function obtenerMailerJob(
    id: string
) {
    return getMailerJob(
        id
    );
}

// =====================================================
// RESOLVER REMITENTE
// =====================================================

async function resolverTecnico(
    tecnicoId: number
): Promise<
    MailerSender |
    null
> {

    try {

        if (
            !Number.isInteger(
                tecnicoId
            ) ||
            tecnicoId <= 0
        ) {
            return null;
        }


        const tecnico =
            await prisma
                .tecnico
                .findUnique({
                    where: {
                        id_tecnico:
                            tecnicoId,
                    },

                    select: {
                        id_tecnico:
                            true,

                        nombre:
                            true,

                        email:
                            true,

                        cargo:
                            true,

                        area:
                            true,

                        firmaTexto:
                            true,

                        firma: {
                            select: {
                                path:
                                    true,
                            },
                        },
                    },
                });


        if (
            !tecnico
        ) {
            return null;
        }


        return {
            id:
                tecnico.id_tecnico,

            nombre:
                tecnico.nombre,

            email:
                tecnico.email,

            cargo:
                tecnico.cargo,

            area:
                tecnico.area,

            firmaTexto:
                tecnico.firmaTexto,

            firmaPath:
                tecnico.firma?.path ??
                null,
        };

    } catch (
    error
    ) {

        console.warn(
            "[Mailer] No se pudo resolver técnico:",
            error
        );

        return null;
    }
}

async function resolverUsuarioAutenticado(
    user?:
        MailerUser |
        null
): Promise<
    MailerSender |
    null
> {

    if (
        !user?.id
    ) {
        return null;
    }


    const tecnicoId =
        Number(
            user.id
        );


    if (
        !Number.isInteger(
            tecnicoId
        ) ||
        tecnicoId <= 0
    ) {
        return null;
    }


    return resolverTecnico(
        tecnicoId
    );
}

export async function obtenerFirmaMailer() {

    const tecnicoId =
        getMailerFirmaTecnicoId();


    const tecnicoFirma =
        await resolverTecnico(
            tecnicoId
        );


    if (
        !tecnicoFirma
    ) {
        throw new Error(
            "No existe el técnico configurado como firma de Soporte RIDS"
        );
    }


    const firmaHtml =
        await ticketEmailTemplateService
            .buildFirmaHtml({
                nombre:
                    tecnicoFirma.nombre,

                email:
                    tecnicoFirma.email,

                cargo:
                    tecnicoFirma.cargo,

                area:
                    tecnicoFirma.area,

                firmaPath:
                    tecnicoFirma.firmaPath,
            });


    return {
        tecnico: {
            id:
                tecnicoFirma.id,

            nombre:
                tecnicoFirma.nombre,

            email:
                tecnicoFirma.email,

            cargo:
                tecnicoFirma.cargo,

            area:
                tecnicoFirma.area,

            firmaPath:
                tecnicoFirma.firmaPath,
        },

        html:
            firmaHtml,
    };
}

// =====================================================
// PRE-REGISTRO
// =====================================================

async function registrarEnviosIniciales({
    jobId,
    targets,
    subject,
    attachments,
    sentBy,
}: {
    jobId:
    string;

    targets:
    MailTarget[];

    subject:
    string;

    attachments:
    MailAttachment[];

    sentBy:
    string |
    null;
}) {

    for (
        const target
        of targets
    ) {

        try {

            const targetAttachments =
                Array.isArray(
                    target.attachments
                )
                    ? target.attachments
                    : [];

            const combined = [
                ...attachments,
                ...targetAttachments,
            ];


            // ==========================================
            // DETECTAR COTIZACIÓN
            // ==========================================

            let cotizacionId:
                number |
                null =
                null;

            for (
                const attachment
                of combined
            ) {

                const match =
                    String(
                        attachment?.name ??
                        ""
                    ).match(
                        /Cotizacion_(\d+)\.pdf/i
                    );

                if (
                    match?.[1]
                ) {
                    cotizacionId =
                        Number(
                            match[1]
                        );

                    break;
                }
            }


            // ==========================================
            // DATOS COTIZACIÓN
            // ==========================================

            let clienteNombre:
                string |
                null =
                null;

            let creadoPor:
                string |
                null =
                null;

            let fechaCreacion:
                Date |
                null =
                null;

            if (
                cotizacionId
            ) {

                try {

                    const cotizacion =
                        await prisma
                            .cotizacionGestioo
                            .findUnique({
                                where: {
                                    id:
                                        cotizacionId,
                                },

                                include: {
                                    entidad:
                                        true,

                                    tecnico:
                                        true,
                                },
                            });

                    if (
                        cotizacion
                    ) {

                        clienteNombre =
                            cotizacion
                                .entidad
                                ?.nombre ??
                            null;

                        creadoPor =
                            cotizacion
                                .tecnico
                                ?.nombre ??
                            null;

                        fechaCreacion =
                            cotizacion.fecha ??
                            cotizacion.createdAt ??
                            null;
                    }

                } catch (
                error
                ) {

                    console.warn(
                        "[Mailer] No se pudo enriquecer cotización:",
                        cotizacionId,
                        error
                    );
                }
            }


            // ==========================================
            // EVITAR DUPLICADOS
            // ==========================================

            const existing =
                await prisma
                    .cotizacionEnviada
                    .findFirst({
                        where: {
                            jobId,

                            to:
                                target.email ??
                                null,

                            cotizacionId,
                        },
                    });

            if (
                existing
            ) {
                continue;
            }


            // ==========================================
            // REGISTRAR
            // ==========================================

            await prisma
                .cotizacionEnviada
                .create({
                    data: {
                        cotizacionId,

                        to:
                            target.email ??
                            null,

                        subject,

                        sentBy,

                        jobId,

                        meta: {
                            attachments:
                                combined.length,
                        },

                        clienteNombre,

                        creadoPor,

                        fechaCreacion,
                    },
                });

        } catch (
        error
        ) {

            console.warn(
                "[Mailer] Error pre-registrando envío:",
                target.email,
                error
            );
        }
    }
}


// =====================================================
// PROCESAR ENVÍO
// =====================================================

async function procesarEnvioMasivo({
    job,
    targets,
    subject,
    bodyHtml,
    globalAttachments,
}: {
    job:
    MailerJob;

    targets:
    MailTarget[];

    subject:
    string;

    bodyHtml:
    string;

    globalAttachments:
    MailAttachment[];
}) {

    job.status =
        "processing";

    try {

        const results =
            await Promise.allSettled(
                targets.map(
                    async (
                        target
                    ) => {

                        const perTargetAttachments =
                            Array.isArray(
                                target.attachments
                            )
                                ? target.attachments
                                : [];

                        const attachments = [
                            ...globalAttachments,
                            ...perTargetAttachments,
                        ].map(
                            (
                                attachment
                            ) => ({
                                name:
                                    attachment.name,

                                contentType:
                                    attachment.contentType,

                                contentBytes:
                                    attachment.contentBytes,

                                ...(attachment.isInline !== undefined
                                    ? {
                                        isInline:
                                            attachment.isInline,
                                    }
                                    : {}),

                                ...(attachment.contentId !== undefined
                                    ? {
                                        contentId:
                                            attachment.contentId,
                                    }
                                    : {}),
                            })
                        );

                        await sendEmail({
                            to:
                                target.email!,

                            subject,

                            bodyHtml,

                            attachments,
                        });

                        job.successes.push(
                            target.email!
                        );
                    }
                )
            );

        results.forEach(
            (
                result,
                index
            ) => {

                if (
                    result.status !==
                    "rejected"
                ) {
                    return;
                }

                const error =
                    result.reason;

                const targetEmail =
                    targets[index]
                        ?.email;

                job.failures.push({
                    ...(targetEmail
                        ? {
                            to:
                                targetEmail,
                        }
                        : {}),

                    error:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),
                });
            }
        );

        job.completed =
            targets.length;

        job.status =
            "done";

        console.log(
            `[Mailer] Job ${job.id} completado: ` +
            `${job.successes.length} ok, ` +
            `${job.failures.length} errores`
        );

    } catch (
    error
    ) {

        console.error(
            `[Mailer] Error inesperado en job ${job.id}:`,
            error
        );

        job.failures.push({
            error:
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    ),
        });

        job.completed =
            targets.length;

        job.status =
            "done";
    }
}