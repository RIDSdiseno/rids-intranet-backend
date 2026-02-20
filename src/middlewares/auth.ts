// src/middlewares/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";

interface JwtPayloadCustom {
  sub: string;
  email: string;
  rol?: string;
  empresaId?: number | null;
}

export function auth(required = true): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      if (!required) return next();
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = header.slice(7);

    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayloadCustom;

      (req as any).user = {
        id: Number(payload.sub),
        rol: payload.rol ?? "TECNICO",
        empresaId: payload.empresaId ?? null,
      };

      return next();
    } catch {
      if (!required) return next();
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  };
}