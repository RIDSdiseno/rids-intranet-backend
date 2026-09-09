import "isomorphic-fetch";
export type GraphFinanzasAttachment = {
    name: string;
    contentType: string;
    contentBytes: string;
};
export type EnviarGraphFinanzasParams = {
    to: string | string[];
    cc?: string[];
    subject: string;
    bodyHtml: string;
    attachments?: GraphFinanzasAttachment[];
};
export type ResultadoGraphFinanzas = {
    ok: true;
    duracionMs: number;
};
declare class GraphFinanzasService {
    private client;
    private getSenderEmail;
    private getClient;
    sendMail(params: EnviarGraphFinanzasParams): Promise<ResultadoGraphFinanzas>;
}
export declare const graphFinanzasService: GraphFinanzasService;
export {};
//# sourceMappingURL=graph-finanzas.service.d.ts.map