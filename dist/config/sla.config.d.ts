export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export declare const SLA_DEFAULTS: Record<Priority, {
    firstResponseMinutes: number;
    resolutionMinutes: number;
}>;
export declare function getSlaConfigFromDB(): Promise<Record<Priority, {
    firstResponseMinutes: number;
    resolutionMinutes: number;
}>>;
//# sourceMappingURL=sla.config.d.ts.map