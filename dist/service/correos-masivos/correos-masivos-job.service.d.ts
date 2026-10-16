export type MailerJobStatus = "queued" | "processing" | "done";
export type MailerJobFailure = {
    to?: string;
    error: string;
};
export type MailerJob = {
    id: string;
    createdAt: number;
    ratePerMin: number;
    total: number;
    successes: string[];
    failures: MailerJobFailure[];
    completed: number;
    status: MailerJobStatus;
};
export declare function createMailerJob(total: number): MailerJob;
export declare function getMailerJob(id: string): MailerJob | undefined;
export declare function deleteMailerJob(id: string): boolean;
//# sourceMappingURL=correos-masivos-job.service.d.ts.map