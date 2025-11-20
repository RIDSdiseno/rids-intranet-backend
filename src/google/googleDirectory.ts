import { google } from "googleapis";

/** Lee el subject (admin a impersonar) según dominio, con fallback */
function subjectForDomain(domain?: string): string {
  const fallback = process.env.GOOGLE_IMPERSONATED_ADMIN;
  const raw = process.env.GOOGLE_IMPERSONATED_MAP || "";

  if (!domain) {
    if (!fallback) throw new Error("Falta GOOGLE_IMPERSONATED_ADMIN en .env");
    return fallback;
  }

  // Parsea "alianz.cl:admin@alianz.cl,fijacionesprocret.cl:admin@fijacionesprocret.cl"
  const map = raw.split(",").reduce<Record<string, string>>((acc, pair) => {
    const [d, s] = pair.split(":").map(x => x?.trim()).filter(Boolean) as [string, string?];
    if (d && s) acc[d.toLowerCase()] = s;
    return acc;
  }, {});

  const subject = map[domain.toLowerCase()] || fallback;
  if (!subject) {
    throw new Error(
      `No hay subject para el dominio "${domain}". Define GOOGLE_IMPERSONATED_MAP o GOOGLE_IMPERSONATED_ADMIN.`
    );
  }
  return subject;
}

/** Autenticación por Service Account + impersonación del admin (por dominio) */
export function getDirectoryClient(domain?: string) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL!;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const subject = subjectForDomain(domain);

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
    subject,
  });

  return google.admin({ version: "directory_v1", auth });
}

/** Lista todos los usuarios de un dominio */
export async function listAllUsers(domain: string) {
  if (!domain) throw new Error("domain requerido");
  const admin = getDirectoryClient(domain);

  const users: any[] = [];
  let pageToken: string | undefined;

  do {
    // construye params sin poner pageToken si es undefined (evita TS exactOptionalPropertyTypes)
    const params: any = {
      domain,
      maxResults: 200,
      orderBy: "email",
      projection: "full",
      viewType: "admin_view",
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await admin.users.list(params as any);
    users.push(...(res.data.users ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // normaliza el shape que usaremos en el upsert
  return users.map(u => ({
    id: String(u.id),
    primaryEmail: String(u.primaryEmail),
    name: {
      fullName: u.name?.fullName ?? undefined,
      givenName: u.name?.givenName ?? undefined,
      familyName: u.name?.familyName ?? undefined,
    },
    suspended: Boolean(u.suspended),
  }));
}
