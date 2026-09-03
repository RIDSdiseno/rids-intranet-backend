import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

export const syncAccess: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const internalKey =
    req.header(
      "x-internal-api-key",
    );

  const expected =
    process.env
      .INTRANET_INTERNAL_API_KEY;

  /* =========================================
     BACKEND MÓVIL
  ========================================= */

  if (
    expected &&
    internalKey === expected
  ) {
    next();
    return;
  }

  /* =========================================
     USUARIO INTRANET
  ========================================= */

  const user =
    (req as any).user;

  if (
    user &&
    [
      "ADMIN",
      "ADMINISTRACION",
    ].includes(user.rol)
  ) {
    next();
    return;
  }

  res.status(403).json({
    error:
      "No autorizado para sincronizar solicitantes",
  });
};