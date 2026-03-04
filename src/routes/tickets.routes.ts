import { Router } from "express";
import { listTickets, createTicket } from "../controllers/tickets.controller.js";

const router = Router();

// Ruta para obtener el listado (GET http://localhost:4000/api/tickets)
router.get("/", listTickets);

// Ruta para crear el ticket con IA y Email (POST http://localhost:4000/api/tickets)
router.post("/", createTicket);

export default router;