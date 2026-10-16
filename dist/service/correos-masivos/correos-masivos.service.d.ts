import type { MailerJob } from "./correos-masivos-job.service.js";
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
    attachments?: MailAttachment[];
};
type MailerUser = {
    id?: number | string;
    email?: string;
};
type EnvioMasivoInput = {
    targets: MailTarget[];
    subject: string;
    bodyHtml?: string;
    plantillaId?: number;
    usarFirmaTecnico?: boolean;
    firmaTecnicoId?: number;
    attachments?: MailAttachment[];
    user?: MailerUser | null;
};
export declare function iniciarEnvioMasivo({ targets, subject, bodyHtml, usarFirmaTecnico, firmaTecnicoId, plantillaId, attachments, user, }: EnvioMasivoInput): Promise<{
    queued: boolean;
    jobId: string;
    requested: number;
    queuedCount: number;
    ratePerMin: number;
    estimatedCompletionMs: number;
}>;
export declare function obtenerMailerJob(id: string): MailerJob | undefined;
export declare function obtenerFirmaMailer({ user, firmaTecnicoId, }: {
    user?: MailerUser | null;
    firmaTecnicoId?: number;
}): Promise<{
    tecnico: {
        id: number;
        nombre: string | null;
        email: string | null;
        cargo: string | null;
        area: string | null;
        firmaPath: string | null;
    } | null;
    html: string;
}>;
export {};
//# sourceMappingURL=correos-masivos.service.d.ts.map