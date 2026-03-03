import type { Request, Response } from "express";
export declare function syncTeamViewer(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function runTeamViewerSyncInternal(): Promise<{
    ok: boolean;
    totalRecibidas: number;
    creadas?: never;
    yaExistian?: never;
    sinEmpresa?: never;
} | {
    ok: boolean;
    totalRecibidas: number;
    creadas: number;
    yaExistian: number;
    sinEmpresa: number;
}>;
//# sourceMappingURL=teamviewer.controller.d.ts.map