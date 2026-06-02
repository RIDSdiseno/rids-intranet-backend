export const MAPA_TECNICOS_EMAILS_PERMITIDOS = [
  "carenas@rids.cl",
  "dlomparte@rids.cl",
  "rcalsin@rids.cl",
];

type MapaTecnicosUser = {
  rol?: string | null;
  email?: string | null;
  correo?: string | null;
  mail?: string | null;
  usuario?: string | null;
};

function normalizarRol(rol: string | undefined | null) {
  return String(rol ?? "").trim().toUpperCase();
}

function normalizarEmail(email: string | undefined | null) {
  return String(email ?? "").trim().toLowerCase();
}

function getEmailUsuario(user?: MapaTecnicosUser | null) {
  return normalizarEmail(user?.email ?? user?.correo ?? user?.mail ?? user?.usuario ?? null);
}

export function canViewMapaTecnicos(user?: MapaTecnicosUser | null) {
  const rol = normalizarRol(user?.rol);
  const email = getEmailUsuario(user);

  return rol === "ADMINISTRACION" && MAPA_TECNICOS_EMAILS_PERMITIDOS.includes(email);
}
