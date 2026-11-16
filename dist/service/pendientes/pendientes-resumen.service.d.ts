import { obtenerCotizacionesBorrador, obtenerOrdenesTallerPendientes, obtenerTicketsActivos, obtenerVisitasVencidas } from "../../controllers/recordatorios.controller.js";
import { vencimientosSuscripcionesCampana } from "../suscripciones-contratos/suscripciones-vencimientos.service.js";
import { type CompletitudFichaEmpresa } from "../empresas/empresa-ficha-completitud.service.js";
type Tickets = Awaited<ReturnType<typeof obtenerTicketsActivos>>;
type Visitas = Awaited<ReturnType<typeof obtenerVisitasVencidas>>;
type Taller = Awaited<ReturnType<typeof obtenerOrdenesTallerPendientes>>;
type Suscripciones = Awaited<ReturnType<typeof vencimientosSuscripcionesCampana>>;
type Cotizaciones = Awaited<ReturnType<typeof obtenerCotizacionesBorrador>>;
type FichaIncompleta = {
    empresaId: number;
    empresaNombre: string;
    completitud: CompletitudFichaEmpresa;
};
export type DatosResumenPendientes = {
    /** YYYY-MM-DD (Chile) */
    hoy: string;
    tickets: Tickets;
    visitas: Visitas;
    taller: Taller;
    suscripciones: Suscripciones;
    cotizaciones: Cotizaciones;
    fichas: FichaIncompleta[];
};
export type ResultadoResumenPendientes = {
    hoy: string;
    enviado: boolean;
    motivo: string;
    destinatarios: string[];
    conteos: {
        tickets: number;
        visitas: number;
        taller: number;
        suscripciones: number;
        cotizaciones: number;
        fichas: number;
    };
    /** Solo con simular: el HTML que se enviaría. */
    html?: string;
};
export declare function correosResumenPendientes(): string[];
export declare function construirCorreoPendientes(datos: DatosResumenPendientes): {
    asunto: string;
    html: string;
};
export declare function obtenerDatosResumenPendientes(): Promise<DatosResumenPendientes>;
export declare function procesarResumenPendientes(opciones?: {
    simular?: boolean;
}): Promise<ResultadoResumenPendientes>;
export {};
//# sourceMappingURL=pendientes-resumen.service.d.ts.map