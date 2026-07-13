function normalizarRol(rol) {
    return String(rol ?? "").trim().toUpperCase();
}
export function canViewMapaTecnicos(user) {
    return normalizarRol(user?.rol) === "ADMINISTRACION";
}
//# sourceMappingURL=canViewMapaTecnicos.js.map