import { Router } from "express";
import { listClientes, getClienteById, createCliente, updateCliente, deleteCliente, } from "../../controllers/controller-clientes/clientes.controller.js";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
const clientesExtRouter = Router();
clientesExtRouter.get("/", auth(), onlyRole("ADMIN", "TECNICO"), listClientes);
clientesExtRouter.get("/:id", auth(), onlyRole("ADMIN", "TECNICO"), getClienteById);
clientesExtRouter.post("/", auth(), onlyRole("ADMIN"), createCliente);
clientesExtRouter.put("/:id", auth(), onlyRole("ADMIN"), updateCliente);
clientesExtRouter.delete("/:id", auth(), onlyRole("ADMIN"), deleteCliente);
export default clientesExtRouter;
//# sourceMappingURL=clientes.routes.js.map