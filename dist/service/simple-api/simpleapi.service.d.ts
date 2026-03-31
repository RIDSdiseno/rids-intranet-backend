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
export declare function getSimpleAPIConfig(): SimpleAPIConfig;
export declare function generarDTE(config: SimpleAPIConfig, factura: any): Promise<DTEGenerado>;
export declare function generarSobre(config: SimpleAPIConfig, dteGenerado: DTEGenerado): Promise<string>;
export declare function enviarAlSII(config: SimpleAPIConfig, sobreGenerado?: string): Promise<{
    trackId: string;
    estado: string;
    raw?: any;
}>;
export declare function consultarEstadoEnvio(config: SimpleAPIConfig, trackId: string): Promise<any>;
export {};
//# sourceMappingURL=simpleapi.service.d.ts.map