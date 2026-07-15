// src/service/baseapi/baseapi.empresas.ts
// Configuración de las empresas para BaseAPI, obteniendo los datos necesarios desde las variables de entorno, y validando que estén presentes.
const EMPRESAS_BASEAPI = {
    econnet: {
        empresaKey: "econnet",
        // Empresa consultada en RCV
        rutEmpresa: process.env.ECONNET_RUT_EMPRESA ??
            process.env.RUT_EMPRESA ??
            "",
        // RUT que inicia sesión en SII
        rutSii: process.env.ECONNET_SII_RUT ??
            process.env.ECONNET_RUT_EMPRESA ??
            process.env.RUT_EMPRESA ??
            "",
        // Clave tributaria SII del rutSii
        passwordSii: process.env.ECONNET_SII_PASSWORD ??
            process.env.ECONNET_SII_CLAVE ??
            process.env.ECONNET_CLAVE_SII ??
            process.env.ECCONET_SII_PASSWORD ??
            "",
    },
    rids: {
        empresaKey: "rids",
        // Empresa consultada en RCV
        rutEmpresa: process.env.RIDS_RUT_EMPRESA ??
            process.env.RUT_EMPRESA_RIDS ??
            "",
        // RUT que inicia sesión en SII
        rutSii: process.env.RIDS_SII_RUT ??
            process.env.RIDS_RUT_EMPRESA ??
            process.env.RUT_EMPRESA_RIDS ??
            "",
        // Clave tributaria SII del rutSii
        passwordSii: process.env.RIDS_SII_PASSWORD ??
            process.env.RIDS_SII_CLAVE ??
            process.env.RIDS_CLAVE_SII ??
            "",
    },
};
// Función para obtener la configuración de BaseAPI para una empresa dada, validando que la empresa sea válida y que tenga toda la información necesaria configurada, y lanzando errores descriptivos si no es así.
export function getEmpresaBaseApiConfig(empresaRaw) {
    const empresa = String(empresaRaw ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida para BaseAPI. Usa econnet o rids.");
    }
    const config = EMPRESAS_BASEAPI[empresa];
    if (!config.rutEmpresa) {
        throw new Error(`No existe RUT empresa configurado para ${empresa}`);
    }
    if (!config.rutSii) {
        throw new Error(`No existe RUT SII configurado para ${empresa}`);
    }
    if (!config.passwordSii) {
        throw new Error(`No existe password SII configurada para ${empresa}`);
    }
    // Validación adicional: para el flujo MiPyME de BaseAPI, el rut que autentica (rutSii)
    // debe ser distinto al rut de la empresa (rutEmpresa). Detectar malconfiguraciones
    // en variables de entorno y producir un error descriptivo en lugar del 400 de BaseAPI.
    const normalize = (v) => String(v ?? "").replace(/\.|\-|\s/g, "").toUpperCase();
    try {
        const rSii = normalize(config.rutSii);
        const rEmp = normalize(config.rutEmpresa);
        if (rSii && rEmp && rSii === rEmp) {
            throw new Error(`Configuración inválida BaseAPI para ${empresa}: 'rutSii' (SII login) ` +
                `es igual a 'rutEmpresa'. Para el flujo MiPyME ambos deben ser distintos. ` +
                `Revisa las variables de entorno (ECONNET_SII_RUT / ECONNET_RUT_EMPRESA o RIDS_SII_RUT / RIDS_RUT_EMPRESA).`);
        }
    }
    catch (e) {
        // Re-lanzar error descriptivo
        if (e instanceof Error)
            throw e;
    }
    return config;
}
//# sourceMappingURL=baseapi.empresas.js.map