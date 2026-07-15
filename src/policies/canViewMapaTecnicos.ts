type MapaTecnicosUser = {
  rol?: string | null;
};

function normalizarRol(rol: string | undefined | null) {
  return String(rol ?? "").trim().toUpperCase();
}

export function canViewMapaTecnicos(user?: MapaTecnicosUser | null) {
  return normalizarRol(user?.rol) === "ADMINISTRACION";
}
