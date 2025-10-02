// src/controllers/auth.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import argon2 from "argon2";
import bcrypt from "bcrypt"; // compat usuarios viejos
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

/* ================ Helpers de ENV ================ */
const ACCESS_TTL  = process.env.ACCESS_TTL  || "15m";
const REFRESH_TTL = process.env.REFRESH_TTL || "7d";

function getJwtSecret(): jwt.Secret {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required");
  return s;
}
function getRefreshSecret(): jwt.Secret {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error("JWT_REFRESH_SECRET is required");
  return s;
}

/* ================ Schemas (Zod) ================ */
const registerSchema = z.object({
  nombre: z.string().min(2, "nombre demasiado corto"),
  email: z.string().email("email inválido"),
  password: z.string().min(6, "password mínimo 6 caracteres"),
});

const loginSchema = z.object({
  email: z.string().email("email inválido"),
  password: z.string().min(1, "password requerido"),
});

/* ================ Utils ================ */
// Access: usa "subject" estándar (sub como string). En payload solo metemos lo necesario (email).
function signAccessToken(userId: number, email: string) {
  return jwt.sign(
    { email },
    getJwtSecret(),
    { subject: String(userId), expiresIn: ACCESS_TTL } as jwt.SignOptions
  );
}

// Refresh: también con "subject"; si quisieras encadenar, puedes incluir un tid.
function signRefreshToken(userId: number, tokenId?: number) {
  const payload = tokenId ? { tid: tokenId } : {};
  return jwt.sign(
    payload,
    getRefreshSecret(),
    { subject: String(userId), expiresIn: REFRESH_TTL } as jwt.SignOptions
  );
}

function ttlToMs(ttl: string): number {
  const s = ttl.toString().trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const m = s.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const u = (m[2] ?? "d").toLowerCase();
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (map[u] ?? 86400000);
}

function getClientInfo(req: Request) {
  const userAgent = req.get("user-agent") || null;
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  return { userAgent, ip };
}

function getRefreshFromRequest(req: Request): string | null {
  const fromHeader = req.get("x-refresh-token");
  if (fromHeader) return fromHeader;
  // @ts-ignore si usas cookie-parser
  const fromCookie = req.cookies?.rt;
  return fromCookie || null;
}

function setRefreshCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("rt", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: ttlToMs(REFRESH_TTL),
  });
}

/* ================ Controladores ================ */
export const register = async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { nombre, email, password } = parsed.data;
  const emailNorm = email.trim().toLowerCase();

  const exists = await prisma.tecnico.findUnique({ where: { email: emailNorm } });
  if (exists) return res.status(409).json({ error: "El email ya está registrado" });

  const passwordHash = await argon2.hash(password);
  const tecnico = await prisma.tecnico.create({
    data: { nombre: nombre.trim(), email: emailNorm, passwordHash, status: true },
    select: { id_tecnico: true, nombre: true, email: true, status: true },
  });

  return res.status(201).json({ tecnico });
};

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const password  = parsed.data.password;

  const tecnico = await prisma.tecnico.findFirst({
    where: { email: { equals: emailNorm, mode: "insensitive" } },
  });
  if (!tecnico) return res.status(401).json({ error: "Credenciales inválidas" });

  // Detecta hash (argon2 o bcrypt)
  const hash = tecnico.passwordHash ?? "";
  let ok = false;
  if (hash.startsWith("$argon2")) {
    ok = await argon2.verify(hash, password);
  } else if (hash.startsWith("$2")) {
    ok = await bcrypt.compare(password, hash);
  }

  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

  // === Tokens ===
  const accessToken = signAccessToken(tecnico.id_tecnico, tecnico.email);
  const refreshRaw  = signRefreshToken(tecnico.id_tecnico);

  // Guarda hash del refresh en DB
  const rtHash = await argon2.hash(refreshRaw);
  const { userAgent, ip } = getClientInfo(req);
  const expiresAt = new Date(Date.now() + ttlToMs(REFRESH_TTL));

  await prisma.refreshToken.create({
    data: { userId: tecnico.id_tecnico, rtHash, expiresAt, userAgent, ip },
    select: { id: true },
  });

  setRefreshCookie(res, refreshRaw);
  return res.json({
    accessToken,
    refreshToken: refreshRaw,
    tecnico: { id_tecnico: tecnico.id_tecnico, nombre: tecnico.nombre, email: tecnico.email },
  });
};

export const refresh = async (req: Request, res: Response) => {
  const token = getRefreshFromRequest(req);
  if (!token) return res.status(401).json({ error: "Refresh token requerido" });

  try {
    const decoded = jwt.verify(token, getRefreshSecret()) as jwt.JwtPayload;
    const userId = Number(decoded.sub);
    if (!userId) return res.status(401).json({ error: "Refresh inválido" });

    // Busca refresh tokens vigentes del usuario
    const candidates = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { id: "desc" },
      take: 25,
    });

    // Compara hash
    let matched: { id: number } | null = null;
    for (const rt of candidates) {
      if (await argon2.verify(rt.rtHash, token)) {
        matched = { id: rt.id };
        break;
      }
    }

    if (!matched) {
      // Revoca todos si el recibido no coincide con ninguno (posible robo)
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.status(401).json({ error: "Refresh no reconocido (revocados los activos)" });
    }

    const tecnico = await prisma.tecnico.findUnique({ where: { id_tecnico: userId } });
    if (!tecnico) return res.status(401).json({ error: "Usuario no encontrado" });

    // Rotación: crear nuevos tokens
    const newAccess     = signAccessToken(tecnico.id_tecnico, tecnico.email);
    const newRefreshRaw = signRefreshToken(tecnico.id_tecnico);
    const newHash       = await argon2.hash(newRefreshRaw);
    const { userAgent, ip } = getClientInfo(req);
    const expiresAt2    = new Date(Date.now() + ttlToMs(REFRESH_TTL));

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.refreshToken.update({
        where: { id: matched!.id },
        data: { revokedAt: new Date(), replacedByTokenId: null },
      });
      const created = await tx.refreshToken.create({
        data: { userId: tecnico.id_tecnico, rtHash: newHash, expiresAt: expiresAt2, userAgent, ip },
        select: { id: true },
      });
      await tx.refreshToken.update({
        where: { id: matched!.id },
        data: { replacedByTokenId: created.id },
      });
    });

    setRefreshCookie(res, newRefreshRaw);
    return res.json({ accessToken: newAccess, refreshToken: newRefreshRaw });
  } catch {
    return res.status(401).json({ error: "Refresh inválido o expirado" });
  }
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie("rt", { path: "/" });
  return res.json({ ok: true });
};

export const me = async (req: Request, res: Response) => {
  const userId = (req as any).userId as number | undefined;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const tecnico = await prisma.tecnico.findUnique({
    where: { id_tecnico: userId },
    select: { id_tecnico: true, nombre: true, email: true, status: true },
  });
  if (!tecnico) return res.status(404).json({ error: "Usuario no encontrado" });

  return res.json({ tecnico });
};
