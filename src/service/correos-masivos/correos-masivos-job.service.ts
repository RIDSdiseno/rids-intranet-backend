export type MailerJobStatus =
    | "queued"
    | "processing"
    | "done";

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

const mailerJobs =
    new Map<string, MailerJob>();

export function createMailerJob(
    total: number
): MailerJob {

    const id =
        `mailjob-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    const job: MailerJob = {
        id,

        createdAt:
            Date.now(),

        ratePerMin:
            0,

        total,

        successes:
            [],

        failures:
            [],

        completed:
            0,

        status:
            "queued",
    };

    mailerJobs.set(
        id,
        job
    );

    return job;
}

export function getMailerJob(
    id: string
): MailerJob | undefined {

    return mailerJobs.get(
        id
    );
}

export function deleteMailerJob(
    id: string
): boolean {

    return mailerJobs.delete(
        id
    );
}