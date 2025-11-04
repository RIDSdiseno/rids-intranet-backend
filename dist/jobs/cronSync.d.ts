type CronStatus = {
    job: "syncGoogleUsers";
    valid: boolean;
    expression: string;
    timezone: string;
    running: boolean;
    lastStart?: string;
    lastEnd?: string;
    lastExitCode?: number | null;
    lastError?: string | null;
    runs: number;
    lastDurationMs?: number;
    lastStdout?: string;
    lastStderr?: string;
};
export declare const syncGoogleUsersStatus: CronStatus;
export declare function runOnce(): void;
export {};
//# sourceMappingURL=cronSync.d.ts.map