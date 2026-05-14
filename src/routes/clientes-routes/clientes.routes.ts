import { Router } from "express";
import {
    listClientes,
    getClienteById,
    createCliente,
    updateCliente,
    deleteCliente,
} from "../../controllers/controller-clientes/clientes.controller.js";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";

const clientesExtRouter = Router();

clientesExtRouter.get("/", auth(), onlyRole("ADMINISTRACION","ADMIN", "TECNICO"), listClientes);
clientesExtRouter.get("/:id", auth(), onlyRole("ADMINISTRACION","ADMIN", "TECNICO"), getClienteById);
clientesExtRouter.post("/", auth(), onlyRole("ADMINISTRACION","ADMIN"), createCliente);
clientesExtRouter.put("/:id", auth(), onlyRole("ADMINISTRACION","ADMIN"), updateCliente);
clientesExtRouter.delete("/:id", auth(), onlyRole("ADMINISTRACION","ADMIN"), deleteCliente);

export default clientesExtRouter;