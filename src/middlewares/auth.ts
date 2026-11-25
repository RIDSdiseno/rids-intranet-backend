// src/middlewares/auth.ts
import type { Request, Response, NextFunction, RequestHandler, RequestParamHandler } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { asyncLocalStorage, setRequestContext, clearRequestContext } from "../lib/request-context.js";
import { clientePuedeVerEmpresa } from "../service/empresas/alcance-cliente.service.js";

/**
 * Grupos de empresas (G2a): un CLIENTE con «Ver todo el grupo» puede pedir otra
 * empresa de su grupo con el header `X-Empresa-Id`. Si está permitida, para esa
 * request `req.user.empresaId` pasa a ser la empresa elegida (así todo el código
 * existente que filtra por `user.empresaId` / `onlyOwnEmpresa` sigue igual).
 * `req.user.empresaIdPropia` conserva la empresa del token.
 */
function leerEmpresaSolicitada(req: Request): number | null {
  const raw = req.headers["x-empresa-id"];
  const valor = Array.isArray(raw) ? raw[0] : raw;
  if (!valor) return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface JwtPayloadCustom {
  sub: string;
  email: string;
  rol?: string;
  empresaId?: number | null;
}

/**
 * Exige un usuario autenticado. Se usa en routers montados después de
 * `api.use(auth(false))`, que deja pasar requests sin token.
 */
export const requireAuth: RequestHandler = (req, res, next): void => {
  if (!(req as any).user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

/**
 * El rol CLIENTE solo puede leer (GET/HEAD). Se usa en routers que el portal
 * muestra en modo «solo visualización» (p. ej. la ficha de empresa).
 */
export const soloLecturaCliente: RequestHandler = (req, res, next): void => {
  const user = (req as any).user;

  if (user?.rol === "CLIENTE" && req.method !== "GET" && req.method !== "HEAD") {
    res.status(403).json({ error: "Tu cuenta solo puede visualizar esta información" });
    return;
  }

  next();
};

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

      if (!userId || Number.isNaN(userId)) {
        res.status(401).json({ error: "INVALID_TOKEN_PAYLOAD" });
        return;
      }


      const requestId = randomUUID();
      const rol = payload.rol ?? "TECNICO";
      const empresaIdPropia = payload.empresaId ?? null;

      (req as any).user = {
        id: userId,
        rol,
        empresaId: empresaIdPropia,
        empresaIdPropia,
        email: payload.email ?? null,
      };

      const continuar = (): void => {
        setRequestContext(requestId, userId);

        asyncLocalStorage.run({ userId, requestId }, () => {
          res.on("finish", () => clearRequestContext(requestId));
          next();
        });
      };

      const empresaSolicitada =
        rol === "CLIENTE" ? leerEmpresaSolicitada(req) : null;

      if (empresaSolicitada === null || empresaSolicitada === empresaIdPropia) {
        continuar();
        return;
      }

      clientePuedeVerEmpresa(userId, empresaSolicitada)
        .then((permitida) => {
          if (!permitida) {
            res.status(403).json({
              code: "EMPRESA_NO_PERMITIDA",
              error: "No tienes acceso a esa empresa",
            });
            return;
          }

          (req as any).user.empresaId = empresaSolicitada;
          continuar();
        })
        .catch((errAlcance: unknown) => {
          console.error("[auth] Error validando la empresa del cliente:", errAlcance);
          res.status(500).json({ error: "Error al validar la empresa" });
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

/**
 * G2c: valida el `:empresaId` de la URL para el rol CLIENTE.
 * `onlyOwnEmpresa()` corre a nivel de `api`, donde `req.params` todavía está vacío,
 * así que cada router con `:empresaId` lo registra con
 * `router.param("empresaId", validarEmpresaParam)`. Compara contra `req.user.empresaId`,
 * que ya trae la empresa elegida con `X-Empresa-Id` (G2a). Para roles internos no hace nada.
 */
export const validarEmpresaParam: RequestParamHandler = (req, res, next, valor) => {
  const user = (req as any).user;

  if (!user || user.rol !== "CLIENTE") {
    next();
    return;
  }

  if (Number(valor) !== user.empresaId) {
    res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
    return;
  }

  next();
};

export function onlyOwnEmpresa(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    // Solo aplica a CLIENTEs
    if (!user || user.rol !== "CLIENTE") {
      next();
      return;
    }

    // Si el cliente no tiene empresaId en su token, bloquear
    if (!user.empresaId) {
      res.status(403).json({ error: "Tu cuenta no está asociada a ninguna empresa" });
      return;
    }

    // Forzar el empresaId del token en la request para que los
    // controllers lo usen directamente
    req.query.empresaId = String(user.empresaId);

    // Si hay empresaId en params o body que no coincide, bloquear
    const paramId = req.params.empresaId;
    const bodyId = req.body?.empresaId;

    if (paramId && Number(paramId) !== user.empresaId) {
      res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
      return;
    }

    if (bodyId && Number(bodyId) !== user.empresaId) {
      res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
      return;
    }

    next();
  };
}