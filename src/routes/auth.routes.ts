import { Router } from "express";
import { register, login, refresh, logout, me, changePassword } from "../controllers/auth.controller.js";
import { auth } from "../middlewares/auth.js";   // <- nombrado
import { loginMicrosoft } from "../controllers/auth.controller.js";
import { forgotPassword, resetPassword } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/microsoft", loginMicrosoft)
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);

authRouter.put("/change-password", auth(), changePassword);

// protegidas
authRouter.get("/me", auth(), me);               // <- llama a la factor
