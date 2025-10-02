import { Router } from "express";
// imports relativos con .js por NodeNext (ESM)
import { register, login, refresh, logout, me } from "../controllers/auth.controller.js";
import auth from "../middlewares/auth.js";


export const authRouter = Router();

// públicas
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);

// protegidas
authRouter.get("/me", auth, me);
