import { Router } from "express";
import { listTickets, createTicket, inboundEmail } from "../controllers/tickets-rids/ticketera.controller.js";
const router = Router();
// Ruta para obtener el listado (GET http://localhost:4000/api/tickets)
router.get("/", listTickets);
router.post("/", createTicket);
router.post("/inbound", inboundEmail);
export default router;
//# sourceMappingURL=tickets.routes.js.map