import { Prisma } from "@prisma/client";
import { type EmpresaBaseApiKey } from "./baseapi.empresas.js";
export type ConsultarDtePorFolioParams = {
    empresa: EmpresaBaseApiKey;
    periodo: string;
    folio: string | number;
    tipoDTE?: string | number;
    forceRefresh?: boolean;
};
export declare function parseDteXmlForDb(xmlRaw: string): {
    factura: {
        tipoDTE: number;
        folio: number;
        tipoDTEString: string;
        estado: string;
        tipoVenta: string;
        fechaEmision: Date | null;
        fechaVencimiento: Date | null;
        rutEmisor: string;
        razonSocialEmisor: string;
        giroEmisor: string;
        rutReceptor: string;
        razonSocialReceptor: string;
        giroReceptor: string;
        direccionReceptor: string;
        comunaReceptor: string;
        ciudadReceptor: string;
        montoExento: number;
        montoNeto: number;
        montoIVA: number;
        montoTotal: number;
    };
    items: {
        linea: number;
        codigo: string | null;
        nombre: string;
        descripcion: string | null;
        cantidad: Prisma.Decimal | null;
        unidadMedida: string | null;
        precioUnitario: number;
        descuentoMonto: number;
        recargoMonto: number;
        montoItem: number;
    }[];
    referencias: {
        nroLinRef: number;
        tipoDocRef: string | null;
        folioRef: string | null;
        fechaRef: string | null;
        codigoRef: string | null;
        razonRef: string | null;
    }[];
};
export declare function extractTedXml(xmlRaw: string): string | null;
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
                fecha_vencimiento: any;
                estado: any;
                tipo_venta: any;
                rut_emisor: any;
                razon_social_emisor: any;
                giro_emisor: any;
                rut_receptor: any;
                razon_social_receptor: any;
                giro_receptor: any;
                direccion_receptor: any;
                comuna_receptor: any;
                ciudad_receptor: any;
                monto_exento: any;
                monto_neto: any;
                monto_iva: any;
                monto_total: any;
                xml_base64: string | null;
                ted_xml: string | null;
                items: any;
            };
        };
    };
}>;
//# sourceMappingURL=baseapi-dte.service.d.ts.map