// src/middlewares/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";

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
      const payload = jwt.verify(token, process.env.JWT_SECRET!);
      (req as any).userId = Number(payload.sub);
      return next();
    } catch {
      if (!required) return next();
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  };
}
