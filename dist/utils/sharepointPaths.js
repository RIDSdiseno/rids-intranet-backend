function normalizeEmpresa(nombre) {
    return nombre
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}
export function resolveSharepointPathReporte(empresa) {
    const key = normalizeEmpresa(empresa);
    const map = {
        "ALIANZ": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ALIANZ/Informes",
        "ASUR": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ASUR/Informes",
        "BERCIA": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BERCIA/Informes",
        "BDK": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BDK/Informes",
        "RWAY": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/RWAY/Informes",
        "CINTAX": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CINTAX/Informes",
        "GRUPO COLCHAGUA": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO COLCHAGUA/Informes",
        "FIJACIONES PROCRET": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/PROCRET/Informes",
        "T-SALES": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/T-SALES/Informes",
        "INFINET": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/INFINET/Informes",
        "VPRIME": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/VPRIME/Informes",
        "JPL": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO JPL/JPL/Informes",
        "PINI": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO PINI/PINI Y CIA/Informes",
        "CLN ALAMEDA": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/1-ALAMEDA/Informes",
        "CLN PROVIDENCIA": "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/2-PROVIDENCIA/Informes",
    };
    return map[key] ?? null;
}
//# sourceMappingURL=sharepointPaths.js.map