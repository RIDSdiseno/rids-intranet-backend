// src/middlewares/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { asyncLocalStorage, setRequestContext, clearRequestContext } from "../lib/request-context.js";

interface JwtPayloadCustom {
  sub: string;
  email: string;
  rol?: string;
  empresaId?: number | null;
}

// Middleware de autenticación que verifica el token JWT y enriquece el request con la información del usuario
export function auth(required = true): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      if (!required) {
        const requestId = randomUUID();
        setRequestContext(requestId, null);
        asyncLocalStorage.run({ userId: null, requestId }, () => {
          res.on("finish", () => clearRequestContext(requestId));
          next();
        });
        return;
      }
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = header.slice(7);
    
    // Verificamos el token JWT
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayloadCustom;

      const userId = Number(payload.sub);
      const requestId = randomUUID();

      (req as any).user = {
        id: userId,
        rol: payload.rol ?? "TECNICO",
        empresaId: payload.empresaId ?? null,
        email: payload.email ?? null,
      };

      setRequestContext(requestId, userId);

      asyncLocalStorage.run({ userId, requestId }, () => {
        res.on("finish", () => clearRequestContext(requestId));
        next();
      });
      return;
    } catch (err: any) {
      if (!required) {
        const requestId = randomUUID();
        setRequestContext(requestId, null);
        asyncLocalStorage.run({ userId: null, requestId }, () => {
          res.on("finish", () => clearRequestContext(requestId));
          next();
        });
        return;
      }

      if (err?.name === "TokenExpiredError") {
        res.status(401).json({ error: "TOKEN_EXPIRED" });
        return;
      }

      res.status(401).json({ error: "INVALID_TOKEN" });
      return;
    }
  };
}