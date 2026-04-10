import type { Request, Response } from "express";
export declare function getTeamViewerHistoricalTotalsByEmpresa(params: {
    empresaId: number;
    fromDate?: string;
    toDate?: string;
}): Promise<{
    ok: boolean;
    empresaId: number;
    totalSesiones: number;
    totalMinutos: number;
    totalHoras: number;
    sesiones: {
        id: string;
        inicio: string;
        fin: string | null;
        deviceId: string | null;
        deviceNombre: string | null;
        minutos: number;
    }[];
}>;
export declare function syncTeamViewerHistorical(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getTeamViewerTotalsByEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getTeamViewerMonthlyAverages(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getTeamViewerMonthlyBreakdown(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function runBackfillTeamViewerDurationsInternal(params: {
    empresaId?: number;
    fromDate: string;
    toDate: string;
}): Promise<{
    ok: boolean;
    empresaId: number | null;
    totalFaltantes: number;
    actualizadas: number;
    sinMatch: number;
    sinDuracionConfiable: number;
}>;
export declare function backfillTeamViewerDurations(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=teamviewer-data.controller.d.ts.map