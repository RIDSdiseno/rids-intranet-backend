import { Router } from "express";
import { listTickets, createTicket, inboundEmail } from "../controllers/tickets-rids/ticketera.controller.js";
const router = Router();

// Ruta para obtener el listado (GET http://localhost:4000/api/tickets)
router.get("/", listTickets);

// Ruta para crear el ticket con IA y Email (POST http://localhost:4000/api/tickets)
router.post("/", createTicket);

// Ruta para que el mensaje automatizado sea personalizado 
router.post("/inbound", inboundEmail);

export default router;