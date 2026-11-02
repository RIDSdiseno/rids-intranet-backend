// src/types/express.d.ts

import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: number;
      rol: string;
      empresaId: number | null;
      email: string | null;
    };
  }
}