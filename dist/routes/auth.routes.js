// Rutas para manejo de autenticación, con endpoints para registro, login (incluyendo Microsoft), refresh de tokens, logout, recuperación de contraseña y cambio de contraseña. Las rutas protegidas requieren autenticación mediante el middleware correspondiente.
import { Router } from "express";
import { register, login, refresh, logout, me, changePassword } from "../controllers/auth.controller.js";
import { auth } from "../middlewares/auth.js"; // <- nombrado
import { onlyRole } from "../middlewares/roles.js";
import { loginMicrosoft } from "../controllers/auth.controller.js";
import { forgotPassword, resetPassword } from "../controllers/auth.controller.js";
export const authRouter = Router();
/* Antes público: cualquiera podía crear una cuenta (rol por defecto TECNICO, activa)
   y entrar al CRM. Los usuarios se crean desde Técnicos / Clientes externos. */
authRouter.post("/register", auth(), onlyRole("ADMIN", "ADMINISTRACION"), register);
authRouter.post("/login", login);
authRouter.post("/microsoft", loginMicrosoft);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.put("/change-password", auth(), changePassword);
// protegidas
authRouter.get("/me", auth(), me); // <- llama a la factor
//# sourceMappingURL=auth.routes.js.map