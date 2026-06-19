export const MAPA_TECNICOS_EMAILS_PERMITIDOS = [
    "carenas@rids.cl",
    "dlomparte@rids.cl",
    "rcalsin@rids.cl",
    "dbravo@rids.cl"
];
function normalizarRol(rol) {
    return String(rol ?? "").trim().toUpperCase();
}
function normalizarEmail(email) {
    return String(email ?? "").trim().toLowerCase();
}
function getEmailUsuario(user) {
    return normalizarEmail(user?.email ?? user?.correo ?? user?.mail ?? user?.usuario ?? null);
}
export function canViewMapaTecnicos(user) {
    const rol = normalizarRol(user?.rol);
    const email = getEmailUsuario(user);
    return rol === "ADMINISTRACION" && MAPA_TECNICOS_EMAILS_PERMITIDOS.includes(email);
}
//# sourceMappingURL=canViewMapaTecnicos.js.map