import { type EmpresaBaseApiKey } from "./baseapi.empresas.js";
export type ConsultarDtePorFolioParams = {
    empresa: EmpresaBaseApiKey;
    periodo: string;
    folio: string | number;
    tipoDTE?: string | number;
    forceRefresh?: boolean;
};
export declare function consultarDtePorFolioBaseApi(params: ConsultarDtePorFolioParams): Promise<{
    cached: boolean;
    data: {
        success: boolean;
        data: {
            documento: {
                tipo_dte: any;
                tipo_dte_nombre: any;
                folio: any;
                fecha: any;
                rut_receptor: any;
                razon_social_receptor: any;
                monto_total: any;
                estado: any;
                xml_base64: string | null;
                items: any;
            };
        };
    };
}>;
//# sourceMappingURL=baseapi-dte.service.d.ts.map