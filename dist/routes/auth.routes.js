import { Router } from "express";
import { register, login, refresh, logout, me, changePassword } from "../controllers/auth.controller.js";
import { auth } from "../middlewares/auth.js"; // <- nombrado
export const authRouter = Router();
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.put("/change-password", auth(), changePassword);
// protegidas
authRouter.get("/me", auth(), me); // <- llama a la factor
//# sourceMappingURL=auth.routes.js.map