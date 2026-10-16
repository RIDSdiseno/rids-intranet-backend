const mailerJobs = new Map();
export function createMailerJob(total) {
    const id = `mailjob-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    const job = {
        id,
        createdAt: Date.now(),
        ratePerMin: 0,
        total,
        successes: [],
        failures: [],
        completed: 0,
        status: "queued",
    };
    mailerJobs.set(id, job);
    return job;
}
export function getMailerJob(id) {
    return mailerJobs.get(id);
}
export function deleteMailerJob(id) {
    return mailerJobs.delete(id);
}
//# sourceMappingURL=correos-masivos-job.service.js.map