// tickets.routes.ts
import { Router } from "express";
import { listTickets } from "../controllers/tickets.controller.js";
const router = Router();
router.get("/", listTickets);
export default router;
//# sourceMappingURL=tickets.routes.js.map