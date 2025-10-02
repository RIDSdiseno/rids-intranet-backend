// src/middlewares/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const sh = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required");
  return s; // No hagas trim: arregla el .env si tiene espacios
}

export default function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Falta token de acceso" });

    if (process.env.NODE_ENV !== "production") {
      console.log("[AUTH] verify using JWT_SECRET#:", sh(getJwtSecret()));
      console.log("[AUTH] header payload (decode):", jwt.decode(token));
    }

    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || typeof decoded === "string" || typeof decoded !== "object") {
      return res.status(401).json({ error: "Token inválido" });
    }

    const subRaw = (decoded as jwt.JwtPayload).sub;
    const userId =
      typeof subRaw === "string" ? Number(subRaw) :
      typeof subRaw === "number" ? subRaw : NaN;

    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: "Token sin subject válido" });
    }

    (req as any).userId = userId;
    next();
  } catch (err: any) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[AUTH] verify failed:", err?.name, err?.message);
    }
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
