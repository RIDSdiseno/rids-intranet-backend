import type { Request, Response } from "express";
export declare function syncTeamViewer(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function runTeamViewerSyncInternal(opts?: {
    fromDate?: string;
    toDate?: string;
    fullHistorical?: boolean;
}): Promise<{
    ok: boolean;
    totalRecibidas: number;
    creadas: number;
    yaExistian: number;
    sinEmpresa: number;
    backfill: {
        ok: boolean;
        empresaId: number | null;
        totalFaltantes: number;
        actualizadas: number;
        sinMatch: number;
        sinDuracionConfiable: number;
    } | {
        ok: false;
        error: string;
    } | null;
}>;
//# sourceMappingURL=teamviewer.controller.d.ts.map