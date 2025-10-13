import { Router } from "express";
import {
  createCliente,
  getClientes,
  getClienteById,
  updateCliente,
  deleteCliente,
} from "controllers/clientes.controller.js";

export const clientesRouter = Router();

clientesRouter.get("/", getClientes);
clientesRouter.post("/", createCliente);
clientesRouter.get("/:id", getClienteById);
clientesRouter.put("/:id", updateCliente);
clientesRouter.delete("/:id", deleteCliente);