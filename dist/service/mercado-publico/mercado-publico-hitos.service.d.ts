import { Prisma } from "@prisma/client";
import { type MercadoPublicoLicitacionApi } from "./mercado-publico-api.service.js";
export declare const TIPOS_HITO_LICITACION: readonly ["FINAL_PREGUNTAS", "PUBLICACION_RESPUESTAS", "VISITA_TERRENO", "ENTREGA_ANTECEDENTES", "SOPORTE_FISICO", "CIERRE", "APERTURA_TECNICA", "APERTURA_ECONOMICA", "ADJUDICACION", "FIRMA_CONTRATO", "OTRO"];
export type TipoHitoLicitacion = (typeof TIPOS_HITO_LICITACION)[number];
export declare const ETIQUETA_HITO: Record<TipoHitoLicitacion, string>;
export declare const CODIGOS_ESTADO_FINALES: readonly number[];
export declare const CODIGOS_ESTADO_CERRADA: readonly number[];
export declare const VIGENCIAS_MERCADO_PUBLICO: readonly ["vigentes", "cerradas", "todas"];
export type VigenciaMercadoPublico = (typeof VIGENCIAS_MERCADO_PUBLICO)[number];
export declare function whereVigenciaLicitacion(vigencia: VigenciaMercadoPublico, ahora?: Date): Prisma.OportunidadMercadoPublicoWhereInput;
export declare class LicitacionNoEncontradaError extends Error {
    constructor(message?: string);
}
export declare class DetalleLicitacionNoDisponibleError extends Error {
    constructor(codigo: string);
}
/** Hitos que informa el detalle de la API (solo los que traen fecha válida). */
export declare function extraerHitosDeDetalle(detalle: MercadoPublicoLicitacionApi): Array<{
    tipo: Exclude<TipoHitoLicitacion, "OTRO">;
    fecha: Date;
}>;
export type ResultadoSincronizacionHitos = {
    id: number;
    codigoExterno: string;
    creados: number;
    actualizados: number;
    desactivados: number;
    sinCambios: number;
    /** Distinto de null si la API informa un CodigoEstado diferente al guardado. */
    cambioEstado: {
        anterior: number | null;
        nuevo: number;
        texto: string | null;
    } | null;
};
/**
 * Consulta el detalle (o usa el entregado) y deja los hitos API
 * iguales a lo que informa Mercado Público. Actualiza también
 * estado, fechaCierre, fechaPublicacion y rawJson de la licitación.
 */
export declare function sincronizarHitosLicitacion(id: number, detallePrevio?: MercadoPublicoLicitacionApi | null): Promise<ResultadoSincronizacionHitos>;
export declare function whereLicitacionesVigentes(): Prisma.OportunidadMercadoPublicoWhereInput;
export declare function sincronizarHitosLicitacionesVigentes(): Promise<{
    candidatas: number;
    sincronizadas: number;
    hitosCreados: number;
    hitosActualizados: number;
    hitosDesactivados: number;
    cambiosEstado: {
        anterior?: number | null;
        nuevo?: number;
        texto?: string | null;
        id: number;
        codigoExterno: string;
    }[];
    errores: {
        codigoExterno: string;
        error: string;
    }[];
}>;
/** Días hacia adelante en que una NUEVA se considera "por cerrar". */
export declare const DIAS_NUEVAS_POR_CERRAR = 8;
/**
 * NUEVA (sin revisar) con cierre pendiente y sin estado cerrado en
 * Mercado Público. Con `hastaDias`, solo las que cierran dentro de ese plazo.
 */
export declare function whereNuevasConCierrePendiente(ahora?: Date, hastaDias?: number): Prisma.OportunidadMercadoPublicoWhereInput;
/**
 * Refresca hitos (prórrogas) de las NUEVA que cierran en los próximos
 * DIAS_NUEVAS_POR_CERRAR días, las más próximas primero.
 */
export declare function sincronizarHitosNuevasPorCerrar(): Promise<{
    candidatas: number;
    sincronizadas: number;
    hitosCreados: number;
    hitosActualizados: number;
    hitosDesactivados: number;
    cambiosEstado: {
        anterior?: number | null;
        nuevo?: number;
        texto?: string | null;
        id: number;
        codigoExterno: string;
    }[];
    errores: {
        codigoExterno: string;
        error: string;
    }[];
}>;
export declare function listarHitosLicitacion(id: number): Promise<{
    createdAt: Date;
    updatedAt: Date;
    origen: string;
    id: number;
    tipo: string;
    fecha: Date;
    descripcion: string | null;
    activo: boolean;
    oportunidadMercadoPublicoId: number;
}[]>;
//# sourceMappingURL=mercado-publico-hitos.service.d.ts.map