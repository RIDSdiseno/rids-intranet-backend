type SolicitudRevisionParams = {
    destinatarioEmail: string;
    destinatarioNombre: string;
    solicitadoPorNombre: string;
    bitacoraId: number;
    tituloBitacora?: string | null;
    etapa: string;
    comentarioSolicitud?: string | null;
};
type ResultadoRevisionParams = {
    destinatarioEmail: string;
    destinatarioNombre: string;
    revisorNombre: string;
    bitacoraId: number;
    tituloBitacora?: string | null;
    etapa: string;
    aprobada: boolean;
    comentarioRespuesta?: string | null;
};
export declare function enviarCorreoSolicitudRevisionBitacora(params: SolicitudRevisionParams): Promise<void>;
export declare function enviarCorreoResultadoRevisionBitacora(params: ResultadoRevisionParams): Promise<void>;
export {};
//# sourceMappingURL=bitacora-mail.service.d.ts.map