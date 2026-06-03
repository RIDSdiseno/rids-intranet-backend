export declare function toNumberRcv(value: any): number;
export declare function normalizarFechaRcv(value: any): Date | null;
export declare function getRutContraparteRcv(doc: any, tipoRcv: "ventas" | "compras"): any;
export declare function getMontoIvaRcv(doc: any): number;
export declare function mapRcvToConciliacionInput(params: {
    doc: any;
    empresaKey: string;
    tipoRcv: "ventas" | "compras";
}): {
    empresaKey: string;
    tipoRcv: "ventas" | "compras";
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string;
    fechaDocto: Date | null;
    montoNeto: number;
    montoIva: number;
    montoTotal: number;
    estadoRcv: any;
    origenRcv: any;
};
//# sourceMappingURL=rcv-concilacion.mapper.d.ts.map