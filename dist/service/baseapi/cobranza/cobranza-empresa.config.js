// src/service/baseapi/cobranza/cobranza-empresa.config.ts
/* =========================================================
   CONFIGURACIÓN POR EMPRESA
========================================================= */
const EMPRESAS_CORREO = {
    econnet: {
        nombre: "ECONNET",
        colorPrimario: "#2563EB",
        colorFondoSuave: "#EFF6FF",
        colorBorde: "#BFDBFE",
        correo: "carenas@rids.cl",
        telefono: "",
        datosPago: {
            beneficiario: "Econnet SPA",
            rut: "76.758.352-4",
            banco: "BANCO ITAÚ",
            tipoCuenta: "Cuenta Corriente",
            numeroCuenta: "0213150814",
            emailPago: "carenas@rids.cl",
            observacion: "Favor indicar el número de factura en el detalle de la transferencia.",
        },
    },
    rids: {
        nombre: "ASESORÍAS RIDS LTDA.",
        colorPrimario: "#0F766E",
        colorFondoSuave: "#ECFDF5",
        colorBorde: "#A7F3D0",
        correo: "pagos@rids.cl",
        telefono: "+56 9 8823 1976",
        datosPago: {
            beneficiario: "ASESORÍAS RIDS LTDA.",
            rut: "77.825.186-8",
            banco: "BANCO ITAÚ",
            tipoCuenta: "Cuenta Corriente",
            numeroCuenta: "226746680",
            emailPago: "pagos@rids.cl",
            observacion: "Favor responder este correo adjuntando el comprobante de transferencia.",
        },
    },
};
/* =========================================================
   HELPERS
========================================================= */
export function getConfigCorreoEmpresa(empresaKey) {
    const config = EMPRESAS_CORREO[empresaKey];
    if (!config) {
        throw new Error(`No existe configuración de cobranza para la empresa "${empresaKey}".`);
    }
    return config;
}
export function getDatosPagoEmpresa(empresaKey) {
    return getConfigCorreoEmpresa(empresaKey).datosPago;
}
export function getNombreEmpresaCobranza(empresaKey) {
    return getConfigCorreoEmpresa(empresaKey).nombre;
}
//# sourceMappingURL=cobranza-empresa.config.js.map