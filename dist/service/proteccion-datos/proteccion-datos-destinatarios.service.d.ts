import type { AgregarDestinatariosCampaniaInput, ResultadoAgregarDestinatariosCampania } from "./proteccion-datos.types.js";
export declare function agregarDestinatariosCampania(campaniaId: number, input: AgregarDestinatariosCampaniaInput): Promise<ResultadoAgregarDestinatariosCampania>;
export declare function listarDestinatariosCampania(campaniaId: number): Promise<{
    campania: {
        id: number;
        nombre: string;
        estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    };
    total: number;
    destinatarios: {
        nombre: string | null;
        email: string;
        empresaId: number | null;
        createdAt: Date;
        updatedAt: Date;
        solicitanteId: number | null;
        id: number;
        estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
        empresaNombre: string | null;
        fechaEnvio: Date | null;
        fechaAperturaFormulario: Date | null;
        fechaRespuesta: Date | null;
        fechaRevocacion: Date | null;
        aceptado: boolean | null;
        versionDocumento: string;
        documentoHash: string;
        respuestaJson: import("@prisma/client/runtime/library").JsonValue;
        evidenciaPath: string | null;
    }[];
}>;
export declare function listarEventosConsentimiento(campaniaId: number, consentimientoId: number): Promise<{
    consentimiento: {
        id: number;
        estadoActual: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
        aceptadoOriginalmente: boolean | null;
        fechaRespuesta: Date | null;
        fechaRevocacion: Date | null;
    };
    eventos: {
        createdAt: Date;
        id: number;
        tipo: import("@prisma/client").$Enums.TipoEventoConsentimientoDatos;
        userAgent: string | null;
        detalle: import("@prisma/client/runtime/library").JsonValue;
        ip: string | null;
    }[];
}>;
export declare function quitarDestinatarioCampania(campaniaId: number, consentimientoId: number): Promise<{
    ok: boolean;
    consentimientoId: number;
}>;
//# sourceMappingURL=proteccion-datos-destinatarios.service.d.ts.map