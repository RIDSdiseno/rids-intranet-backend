import type { Request, Response, NextFunction } from "express";

export function onlyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.rol;

    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ message: "No tienes permisos" });
      return;
    }

    next();
  };
}