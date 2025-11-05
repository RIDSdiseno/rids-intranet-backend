// src/controllers/auth.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import argon2 from "argon2";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

/* ================ CONSTANTES Y CONFIGURACIÓN ================ */
const ACCESS_TTL = process.env.ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TTL || "7d";

// AGREGAR ESTO - CONFIGURACIÓN ARGON2 OPTIMIZADA


const ARGON_REFRESH_TOKEN_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 512,     // Aún más optimizado para tokens
  timeCost: 1,
  parallelism: 1,
  hashLength: 32
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
  nombre: z.string().min(2, "nombre demasiado corto"),
  email: z.string().email("email inválido"),
  password: z.string().min(6, "password mínimo 6 caracteres"),
});

const loginSchema = z.object({
  email: z.string().email("email inválido"),
  password: z.string().min(1, "password requerido"),
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
    s: 1000, m: 60000, h: 3600000, d: 86400000
  };

  return n * (map[u] ?? 86400000);
}

// CORRECCIÓN: Funciones de token con tipos correctos
function signAccessToken(userId: number, email: string): string {
  return jwt.sign(
    { email },
    getJwtSecret(),
    {
      subject: String(userId),
      expiresIn: ACCESS_TTL, // Ahora funciona sin error
      algorithm: 'HS256'
    } as jwt.SignOptions // CORRECCIÓN: Cast del objeto completo
  );
}

function signRefreshToken(userId: number, tokenId?: number): string {
  const payload = tokenId ? { tid: tokenId } : {};
  return jwt.sign(
    payload,
    getRefreshSecret(),
    {
      subject: String(userId),
      expiresIn: REFRESH_TTL, // Ahora funciona sin error
      algorithm: 'HS256'
    } as jwt.SignOptions // CORRECCIÓN: Cast del objeto completo
  );
}

function getClientInfo(req: Request) {
  const userAgent = req.get("user-agent") || "unknown";
  const ip = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  ).replace(/^::ffff:/, ""); // Normalizar IPv6-mapped IPv4

  return { userAgent, ip };
}

function getRefreshFromRequest(req: Request): string | null {
  // Priorizar header sobre cookie
  const fromHeader = req.get("x-refresh-token");
  if (fromHeader) return fromHeader;

  // @ts-ignore si usas cookie-parser
  return req.cookies?.rt || null;
}

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

export const register = async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
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
      select: { id_tecnico: true }
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
      parallelism: 1
    });

    const tecnico = await prisma.tecnico.create({
      data: {
        nombre: nombre.trim(),
        email: emailNorm,
        passwordHash,
        status: true
      },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true,
        status: true
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

export const login = async (req: Request, res: Response) => {
  const start = Date.now();  // Medir el tiempo de inicio

  try {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const emailNorm = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    // Consulta optimizada - traer solo lo necesario
    const tecnico = await prisma.tecnico.findUnique({
      where: { email: emailNorm },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true,
        passwordHash: true
      }
    });

    if (!tecnico) {
      // Pequeño delay para prevenir timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
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

    // Generar tokens
    const accessToken = signAccessToken(tecnico.id_tecnico, tecnico.email);
    const refreshRaw = signRefreshToken(tecnico.id_tecnico);

    // ✅ OPTIMIZADO: Usar configuración optimizada para refresh tokens
    const rtHash = await argon2.hash(refreshRaw, ARGON_REFRESH_TOKEN_OPTIONS);

    const { userAgent, ip } = getClientInfo(req);
    const expiresAt = new Date(Date.now() + REFRESH_MS);

    // Insertar token sin esperar respuesta (fire and forget para mejor performance)
    prisma.refreshToken.create({
      data: {
        userId: tecnico.id_tecnico,
        rtHash,
        expiresAt,
        userAgent,
        ip
      },
      select: { id: true },
    }).catch(console.error);

    setRefreshCookie(res, refreshRaw);

    const end = Date.now();  // Medir el tiempo final
    // En la función login, después del hash:
    const hashStart = Date.now();
    const hashEnd = Date.now();
    console.log(`⏱️  Tiempo hash Argon2: ${hashEnd - hashStart}ms`);
    console.log(`Tiempo de respuesta del login: ${end - start} ms`);
    return res.json({
      accessToken,
      refreshToken: refreshRaw,
      tecnico: {
        id_tecnico: tecnico.id_tecnico,
        nombre: tecnico.nombre,
        email: tecnico.email
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

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
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { id: true, rtHash: true },
      orderBy: { id: "desc" },
      take: 10,
    });

    // Buscar token válido
    let matchedToken: { id: number } | null = null;

    for (const rt of candidates) {
      if (await argon2.verify(rt.rtHash, token)) {
        matchedToken = { id: rt.id };
        break;
      }
    }

    if (!matchedToken) {
      // Revocar tokens en segundo plano sin bloquear respuesta
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch(console.error);

      return res.status(401).json({
        error: "Refresh no reconocido (revocados los activos)"
      });
    }

    // Obtener datos del usuario
    const tecnico = await prisma.tecnico.findUnique({
      where: { id_tecnico: userId },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true
      }
    });

    if (!tecnico) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    // Generar nuevos tokens
    const newAccess = signAccessToken(tecnico.id_tecnico, tecnico.email);
    const newRefreshRaw = signRefreshToken(tecnico.id_tecnico);

    // ✅ OPTIMIZADO: Usar configuración optimizada para refresh tokens
    const newHash = await argon2.hash(newRefreshRaw, ARGON_REFRESH_TOKEN_OPTIONS);

    const { userAgent, ip } = getClientInfo(req);
    const expiresAt2 = new Date(Date.now() + REFRESH_MS);

    // Transacción optimizada
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          ip
        },
      });
    }, {
      timeout: 10000
    });

    setRefreshCookie(res, newRefreshRaw);
    return res.json({
      accessToken: newAccess,
      refreshToken: newRefreshRaw
    });

  } catch (error) {
    console.error("Error en refresh:", error);
    return res.status(401).json({ error: "Refresh inválido o expirado" });
  }
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie("rt", { path: "/" });
  return res.json({ ok: true });
};

export const me = async (req: Request, res: Response) => {
  const userId = (req as any).userId as number | undefined;
  if (!userId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const tecnico = await prisma.tecnico.findUnique({
    where: { id_tecnico: userId },
    select: {
      id_tecnico: true,
      nombre: true,
      email: true,
      status: true
    },
  });

  if (!tecnico) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json({ tecnico });
};

// Limpiar cache periódicamente
setInterval(() => {
  emailCheckCache.clear();
}, CACHE_TTL * 2);