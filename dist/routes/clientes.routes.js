import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { createCliente, getClientes, getClienteById, updateCliente, deleteCliente, } from "../controllers/clientes.controller.js";
export const clientesRouter = Router();
/* Antes sin autenticación (CRUD público). Página /clientes: solo internos */
clientesRouter.use(requireAuth);
clientesRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
clientesRouter.get("/", getClientes);
clientesRouter.post("/", createCliente);
clientesRouter.get("/:id", getClienteById);
clientesRouter.put("/:id", updateCliente);
clientesRouter.delete("/:id", deleteCliente);
//# sourceMappingURL=clientes.routes.js.map