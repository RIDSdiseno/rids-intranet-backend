import { Router } from "express";
import { wcReceive } from "../controllers/whatchimp.controller.js";

const r = Router();
r.post("/webhooks/whatchimp", wcReceive);
export default r;
