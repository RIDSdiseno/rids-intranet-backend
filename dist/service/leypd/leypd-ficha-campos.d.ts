export type TipoCampoFichaLeypd = "text" | "textarea" | "email" | "number" | "boolean" | "date" | "select" | "multiselect";
export type GrupoFichaLeypd = "DATOS_EMPRESA" | "SITIO_WEB" | "RESPONSABLES" | "TRATAMIENTO_DATOS" | "APROBACIONES_FECHAS";
export type CondicionFichaLeypd = "RUBRO_SALUD" | "EMPRESA_PERSONAS" | "VENTA_ONLINE";
export type FormatoCampoFichaLeypd = "rut" | "email" | "url_o_no_tiene" | "fecha";
export interface OpcionCampoFichaLeypd {
    value: string;
    label: string;
}
export interface CampoFichaLeypd {
    /**
     * Posición oficial dentro de la ficha.
     * Debe ir de 1 a 24 sin repetidos.
     */
    numero: number;
    /**
     * Key estable persistida dentro de LeypdFicha.datos.
     *
     * IMPORTANTE:
     * una vez usada en producción no conviene cambiarla,
     * porque también será utilizada por generación documental.
     */
    key: string;
    grupo: GrupoFichaLeypd;
    label: string;
    descripcion?: string;
    tipo: TipoCampoFichaLeypd;
    obligatorio: boolean;
    /**
     * Elementos Ley PD que utilizan esta respuesta.
     */
    elementos: number[];
    /**
     * Indica que el CRM puede sugerir inicialmente
     * esta información.
     */
    precarga: boolean;
    /**
     * Pregunta condicional según características
     * de la empresa.
     */
    condicion?: CondicionFichaLeypd;
    opciones?: OpcionCampoFichaLeypd[];
    placeholder?: string;
    /**
     * Validación de formato (backend y frontend).
     * Los valores vacíos no se validan por formato.
     */
    formato?: FormatoCampoFichaLeypd;
    /**
     * Largo máximo. Por defecto:
     * text = 300, textarea = 2000.
     */
    maxLength?: number;
}
export interface GrupoFichaLeypdConfig {
    key: GrupoFichaLeypd;
    orden: number;
    titulo: string;
    descripcion?: string;
}
export declare const FICHA_LEYPD_GRUPOS: GrupoFichaLeypdConfig[];
export declare const FICHA_LEYPD_CAMPOS: CampoFichaLeypd[];
export declare const TOTAL_CAMPOS_FICHA_LEYPD: number;
export declare const TOTAL_GRUPOS_FICHA_LEYPD: number;
export declare function obtenerCampoFichaLeypd(key: string): CampoFichaLeypd | undefined;
export declare function obtenerCampoFichaLeypdPorNumero(numero: number): CampoFichaLeypd | undefined;
export declare function obtenerCamposGrupoFichaLeypd(grupo: GrupoFichaLeypd): CampoFichaLeypd[];
export declare function obtenerCamposElementoLeypd(elementoNumero: number): CampoFichaLeypd[];
export declare function obtenerCamposConPrecargaLeypd(): CampoFichaLeypd[];
export declare function obtenerCamposCondicionalesLeypd(): CampoFichaLeypd[];
export declare function validarCatalogoFichaLeypd(): void;
//# sourceMappingURL=leypd-ficha-campos.d.ts.map