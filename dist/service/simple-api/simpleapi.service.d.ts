interface SimpleAPIConfig {
    url: string;
    apiKey: string;
    rutEmpresa: string;
    razonSocial: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad: string;
    certBase64: string;
    certPassword: string;
    certRut: string;
    ambiente: 0 | 1;
    cafXml: string | undefined;
    cafXmlBase64: string | undefined;
}
interface DTEGenerado {
    xml: string;
    folio: number;
    trackId?: string;
    raw?: any;
}
export interface VentaRCV {
    folio: number;
    tipoDTE: number;
    rutReceptor: string;
    razonSocialReceptor: string;
    fechaEmision: string;
    montoNeto: number;
    montoIVA: number;
    montoTotal: number;
    estado: string;
}
export interface ResultadoVentasRCV {
    rut: string;
    mes: string;
    ano: string;
    ventas: VentaRCV[];
    total: number;
}
export declare function getSimpleAPIConfig(): SimpleAPIConfig;
export declare function generarDTE(config: SimpleAPIConfig, factura: any): Promise<DTEGenerado>;
export declare function generarSobre(config: SimpleAPIConfig, dteGenerado: DTEGenerado): Promise<string>;
export declare function enviarAlSII(config: SimpleAPIConfig, sobreGenerado?: string): Promise<{
    trackId: string;
    estado: string;
    raw?: any;
}>;
export declare function consultarEstadoEnvio(config: SimpleAPIConfig, trackId: string): Promise<any>;
export declare function consultarVentasRCV(mes: string, ano: string, rutEmpresaOverride?: string, forceRefresh?: boolean): Promise<ResultadoVentasRCV>;
export declare function consultarResumenVentasRCV(mes: string, ano: string, rutEmpresaOverride?: string): Promise<any>;
export {};
//# sourceMappingURL=simpleapi.service.d.ts.map