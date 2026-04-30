// --- SimpleAPI Key ---
export function getSimpleApiKey() {
    const key = process.env.SIMPLEAPI_KEY;
    if (!key)
        throw new Error("SIMPLEAPI_KEY no está definida en .env");
    return key;
}
// --- Credenciales SII por empresa ---
const EMPRESA_CONFIGS = {
    econnet: () => {
        const rutEmpresa = process.env.ECONNET_RUT_EMPRESA;
        const claveSii = process.env.ECONNET_CLAVE_SII;
        const rutRepresentante = process.env.ECONNET_RUT_REPRESENTANTE;
        if (!rutEmpresa || !claveSii || !rutRepresentante) {
            throw new Error("Faltan variables de entorno para empresa 'econnet'");
        }
        return { rutEmpresa, claveSii, rutRepresentante };
    },
    rids: () => {
        const rutEmpresa = process.env.RIDS_RUT_EMPRESA;
        const claveSii = process.env.RIDS_CLAVE_SII;
        const rutRepresentante = process.env.RIDS_RUT_REPRESENTANTE;
        if (!rutEmpresa || !claveSii || !rutRepresentante) {
            throw new Error("Faltan variables de entorno para empresa 'rids'");
        }
        return { rutEmpresa, claveSii, rutRepresentante };
    },
};
export function getEmpresaConfig(empresaKey) {
    const resolver = EMPRESA_CONFIGS[empresaKey];
    if (!resolver)
        throw new Error(`Empresa desconocida: ${empresaKey}`);
    return resolver();
}
//# sourceMappingURL=sii-api-auth.service.js.map