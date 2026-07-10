type EnviarInformeResumenEmailParams = {
    to: string;
    subject: string;
    mensaje?: string;
    fileName: string;
    mimeType: string;
    fileBase64: string;
    empresa?: string | null;
    periodo?: string | null;
};
export declare function enviarInformeResumenPorCorreo(params: EnviarInformeResumenEmailParams): Promise<void>;
export {};
//# sourceMappingURL=reportes-email.service.d.ts.map