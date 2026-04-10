// src/controllers/auth.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import argon2 from "argon2";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { transporter } from "../lib/mailer.js";

/* ================ CONSTANTES Y CONFIGURACIÓN ================ */
const ACCESS_TTL = process.env.ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TTL || "7d";

// ✅ Rol fijo para Tecnico (evita depender de campo inexistente en Prisma)
const ROL_DEFAULT = "TECNICO";

const ARGON_REFRESH_TOKEN_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 512, // optimizado para tokens
  timeCost: 1,
  parallelism: 1,
  hashLength: 32,
};

// Pre-calcular valores que no cambian
const REFRESH_MS = ttlToMs(REFRESH_TTL);
const IS_PROD = process.env.NODE_ENV === "production";

// CORRECCIÓN: Declarar variables con tipos correctos
let JWT_SECRET: string;
let REFRESH_SECRET: string;

// CORRECCIÓN: Inicializar las variables al cargar el módulo
function initializeSecrets(): void {
  JWT_SECRET = process.env.JWT_SECRET!;
  REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

  if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
  if (!REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET is required");
}

// Inicializar al cargar
initializeSecrets();

// CORRECCIÓN: Funciones simplificadas sin cache
function getJwtSecret(): string {
  return JWT_SECRET;
}

function getRefreshSecret(): string {
  return REFRESH_SECRET;
}

/* ================ SCHEMAS CACHEADOS ================ */
const registerSchema = z.object({
  nombre: z.string().min(2, "Nombre demasiado corto"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Password requerido"),
});

/* ================ UTILS OPTIMIZADOS ================ */
function ttlToMs(ttl: string): number {
  const s = ttl.toString().trim();

  // Cache simple para valores comunes
  if (s === "15m") return 15 * 60 * 1000;
  if (s === "7d") return 7 * 24 * 60 * 60 * 1000;
  if (s === "1h") return 60 * 60 * 1000;

  if (/^\d+$/.test(s)) return Number(s) * 1000;

  const m = s.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;

  const n = Number(m[1]);
  const u = (m[2] ?? "d").toLowerCase();
  const map: Record<string, number> = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  };

  return n * (map[u] ?? 86400000);
}

// CORRECCIÓN: Funciones de token con tipos correctos
function signAccessToken(
  userId: number,
  email: string,
  rol: string,
  empresaId?: number | null
): string {
  return jwt.sign(
    {
      email,
      rol,
      empresaId: empresaId ?? null,
    },
    getJwtSecret(),
    {
      subject: String(userId),
      expiresIn: ACCESS_TTL,
      algorithm: "HS256",
    } as jwt.SignOptions
  );
}

// CORRECCIÓN: Configuración del transporter con tipos correctos
function signRefreshToken(userId: number, tokenId?: number): string {
  const payload = tokenId ? { tid: tokenId } : {};
  return jwt.sign(
    payload,
    getRefreshSecret(),
    {
      subject: String(userId),
      expiresIn: REFRESH_TTL,
      algorithm: "HS256",
    } as jwt.SignOptions
  );
}

// CORRECCIÓN: Configuración del transporter con tipos correctos
function getClientInfo(req: Request) {
  const userAgent = req.get("user-agent") || "unknown";
  const ip = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  ).replace(/^::ffff:/, ""); // Normalizar IPv6-mapped IPv4

  return { userAgent, ip };
}

// CORRECCIÓN: Configuración del transporter con tipos correctos
function getRefreshFromRequest(req: Request): string | null {
  // Priorizar header sobre cookie
  const fromHeader = req.get("x-refresh-token");
  if (fromHeader) return fromHeader;

  // @ts-ignore si usas cookie-parser
  return req.cookies?.rt || null;
}

// CORRECCIÓN: Configuración del transporter con tipos correctos
function setRefreshCookie(res: Response, token: string): void {
  res.cookie("rt", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    path: "/",
    maxAge: REFRESH_MS,
  });
}

/* ================ CONTROLADORES OPTIMIZADOS ================ */

// Cache para verificación de emails existentes (short-lived)
const emailCheckCache = new Map<string, boolean>();
const CACHE_TTL = 30000; // 30 segundos

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const register = async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Datos inválidos",
      });
    }

    const { nombre, email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();

    // Verificar cache primero
    const cacheKey = `email:${emailNorm}`;
    if (emailCheckCache.has(cacheKey)) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    // Consulta optimizada - solo necesitamos saber si existe
    const exists = await prisma.tecnico.findUnique({
      where: { email: emailNorm },
      select: { id_tecnico: true },
    });

    if (exists) {
      // Actualizar cache
      emailCheckCache.set(cacheKey, true);
      setTimeout(() => emailCheckCache.delete(cacheKey), CACHE_TTL);

      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    const tecnico = await prisma.tecnico.create({
      data: {
        nombre: nombre.trim(),
        email: emailNorm,
        passwordHash,
        status: true,
      },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true,
        status: true,
      },
    });

    // Limpiar cache de verificación de email
    emailCheckCache.delete(cacheKey);

    return res.status(201).json({ tecnico });
  } catch (error) {
    console.error("Error en registro:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const login = async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Datos inválidos",
      });
    }

    const emailNorm = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    // ✅ Traer solo lo necesario (sin rol, porque Tecnico no lo tiene)
    const tecnico = await prisma.tecnico.findUnique({
      where: { email: emailNorm },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true,
        passwordHash: true,
        status: true,
        empresaId: true,
        rol: true,
      },
    });

    if (!tecnico) {
      // Pequeño delay para prevenir timing attacks
      await new Promise((resolve) => setTimeout(resolve, 100));
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Verificación de password optimizada
    const hash = tecnico.passwordHash ?? "";
    let isValid = false;

    if (hash.startsWith("$argon2")) {
      isValid = await argon2.verify(hash, password);
    } else if (hash.startsWith("$2")) {
      isValid = await bcrypt.compare(password, hash);
    }

    if (!isValid) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (!tecnico.status) {
      return res.status(403).json({ error: "Usuario inactivo, contacte al administrador. "});
    }

    // ✅ Rol fijo
    const rol = tecnico.rol ?? ROL_DEFAULT;

    // Generar tokens
    const accessToken = signAccessToken(
      tecnico.id_tecnico,
      tecnico.email,
      rol,
      tecnico.empresaId
    );
    const refreshRaw = signRefreshToken(tecnico.id_tecnico);

    const hashStart = Date.now();
    const rtHash = await argon2.hash(refreshRaw, ARGON_REFRESH_TOKEN_OPTIONS);
    const hashEnd = Date.now();

    const { userAgent, ip } = getClientInfo(req);
    const expiresAt = new Date(Date.now() + REFRESH_MS);

    // Insertar token sin bloquear la respuesta
    prisma.refreshToken
      .create({
        data: {
          userId: tecnico.id_tecnico,
          rtHash,
          expiresAt,
          userAgent,
          ip,
        },
        select: { id: true },
      })
      .catch(console.error);

    setRefreshCookie(res, refreshRaw);

    const end = Date.now();
    console.log(`⏱️ Tiempo hash Argon2 refresh: ${hashEnd - hashStart}ms`);
    console.log(`⏱️ Tiempo de respuesta del login: ${end - start}ms`);

    return res.json({
      accessToken,
      refreshToken: refreshRaw,
      tecnico: {
        id_tecnico: tecnico.id_tecnico,
        nombre: tecnico.nombre,
        email: tecnico.email,
        rol, // ✅ fijo
        empresaId: tecnico.empresaId,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const refresh = async (req: Request, res: Response) => {
  const token = getRefreshFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Refresh token requerido" });
  }

  try {
    // Verificar token JWT primero (más rápido que consultar DB)
    const decoded = jwt.verify(token, getRefreshSecret()) as jwt.JwtPayload;
    const userId = Number(decoded.sub);

    if (!userId) {
      return res.status(401).json({ error: "Refresh inválido" });
    }

    // Consulta optimizada con límite más pequeño
    const candidates = await prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, rtHash: true, revokedAt: true, replacedByTokenId: true },
      orderBy: { id: "desc" },
      take: 10,
    });

    // Buscar token válido
    let matchedToken: { id: number } | null = null;

    for (const rt of candidates) {
      if (await argon2.verify(rt.rtHash, token)) {
        matchedToken = rt;
        break;
      }
    }

    if (!matchedToken) {
      // Revocar tokens en segundo plano sin bloquear respuesta
      prisma.refreshToken
        .updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(console.error);

      return res
        .status(401)
        .json({ error: "Refresh no reconocido (revocados los activos)" });
    }

    // ✅ Obtener datos mínimos para generar access token (sin rol)
    const tecnico = await prisma.tecnico.findUnique({
      where: { id_tecnico: userId },
      select: {
        id_tecnico: true,
        email: true,
        empresaId: true,
      },
    });

    if (!tecnico) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const newAccess = signAccessToken(
      tecnico.id_tecnico,
      tecnico.email,
      ROL_DEFAULT,
      tecnico.empresaId
    );

    const newRefreshRaw = signRefreshToken(tecnico.id_tecnico);

    const newHash = await argon2.hash(
      newRefreshRaw,
      ARGON_REFRESH_TOKEN_OPTIONS
    );

    const { userAgent, ip } = getClientInfo(req);
    const expiresAt2 = new Date(Date.now() + REFRESH_MS);

    // Transacción optimizada
    await prisma.$transaction(
      async (tx) => {
        await tx.refreshToken.update({
          where: { id: matchedToken!.id },
          data: { revokedAt: new Date() },
        });

        await tx.refreshToken.create({
          data: {
            userId: tecnico.id_tecnico,
            rtHash: newHash,
            expiresAt: expiresAt2,
            userAgent,
            ip,
          },
        });
      },
      { timeout: 10000 }
    );

    setRefreshCookie(res, newRefreshRaw);
    return res.json({
      accessToken: newAccess,
      refreshToken: newRefreshRaw,
    });
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "REFRESH_EXPIRED" });
    }

    return res.status(401).json({ error: "REFRESH_INVALID" });
  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const logout = async (req: Request, res: Response) => {
  const token = getRefreshFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, getRefreshSecret()) as jwt.JwtPayload;
      await prisma.refreshToken.updateMany({
        where: { userId: Number(decoded.sub), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch { /* token inválido, no importa */ }
  }
  res.clearCookie("rt", { path: "/" });
  return res.json({ ok: true });
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const loginMicrosoft = async (req: Request, res: Response) => {
  console.log("🔥 loginMicrosoft llamado", req.body);
  try {

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: "Token de Microsoft requerido"
      });
    }

    // Leer el token
    const decoded: any = jwt.decode(idToken);

    if (!decoded) {
      return res.status(401).json({
        error: "Token inválido"
      });
    }

    const email = decoded.preferred_username;

    if (!email) {
      return res.status(401).json({
        error: "No se pudo obtener el correo del usuario"
      });
    }

    //  Validar que sea correo de RIDS
    if (!email.endsWith("@rids.cl")) {
      return res.status(403).json({
        error: "Acceso denegado. Solo usuarios de RIDS pueden ingresar."
      });
    }

    //  Buscar usuario en tu base de datos
    let tecnico = await prisma.tecnico.findUnique({
      where: { email }
    });

    if (!tecnico) {
  tecnico = await prisma.tecnico.create({
    data: {
      nombre: decoded.name || email,
      email: email,
      status: true,
      passwordHash: "",
    }
  });
}

    //  Crear JWT de tu sistema
    const accessToken = jwt.sign(
      { id: tecnico.id_tecnico },
      process.env.JWT_SECRET!,
      { expiresIn: "8h" }
    );

    return res.json({
      accessToken,
      tecnico
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Error autenticando con Microsoft"
    });

  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const me = async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user?.id) {
    return res.status(401).json({ error: "No autenticado" });
  }

  //  sin rol en select
  const tecnico = await prisma.tecnico.findUnique({
    where: { id_tecnico: user.id },
    select: {
      id_tecnico: true,
      nombre: true,
      email: true,
      status: true,
      empresaId: true,
    },
  });

  if (!tecnico) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json({
    tecnico: {
      ...tecnico,
      rol: ROL_DEFAULT,
    },
  });
};

// Limpiar cache periódicamente
setInterval(() => {
  emailCheckCache.clear();
}, CACHE_TTL * 2);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Contraseña actual requerida"),
  newPassword: z.string().min(6, "Mínimo 6 caracteres"),
});

export const changePassword = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const parsed = changePasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Datos inválidos",
      });
    }

    const { currentPassword, newPassword } = parsed.data;

    const tecnico = await prisma.tecnico.findUnique({
      where: { id_tecnico: user.id },
      select: {
        passwordHash: true,
      },
    });

    if (!tecnico || !tecnico.passwordHash) {
      return res.status(400).json({ error: "Usuario inválido" });
    }

    // Verificar contraseña actual
    let isValid = false;
    const hash = tecnico.passwordHash;

    if (hash.startsWith("$argon2")) {
      isValid = await argon2.verify(hash, currentPassword);
    } else if (hash.startsWith("$2")) {
      isValid = await bcrypt.compare(currentPassword, hash);
    }

    if (!isValid) {
      return res.status(401).json({ error: "Contraseña actual incorrecta" });
    }

    // Generar nuevo hash con argon2
    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.tecnico.update({
      where: { id_tecnico: user.id },
      data: { passwordHash: newHash },
    });

    return res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error changePassword:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requerido" });
    }

    const tecnico = await prisma.tecnico.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Siempre responder lo mismo para no revelar si el email existe
    if (!tecnico) {
      return res.json({ ok: true, message: "Si el correo existe recibirás un email" });
    }

    // Generar token único
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutos

    await prisma.passwordResetToken.create({
      data: {
        token,
        tecnicoId: tecnico.id_tecnico,
        expiresAt,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: tecnico.email,
      subject: "Recuperación de contraseña - RIDS",
      html: `
        <h2>Recuperación de contraseña</h2>
        <p>Hola ${tecnico.nombre},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para continuar:</p>
        <a href="${resetUrl}" style="background:#0891b2;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
          Restablecer contraseña
        </a>
        <p>Este enlace expira en 30 minutos.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      `,
    });

    return res.json({ ok: true, message: "Si el correo existe recibirás un email" });
  } catch (error) {
    console.error("Error forgotPassword:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Función para obtener cliente de Google Directory con impersonación basada en dominio, con manejo robusto de claves y logging detallado
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token y nueva contraseña requeridos" });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { tecnico: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: "Token inválido o expirado" });
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.tecnico.update({
      where: { id_tecnico: resetToken.tecnicoId },
      data: { passwordHash },
    });

    await prisma.passwordResetToken.update({
      where: { token },
      data: { used: true },
    });

    return res.json({ ok: true, message: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error("Error resetPassword:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};