// src/routes/productos.routes.ts
import { Router } from "express";
import { requireAuth, soloLecturaCliente } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { seedProductos, createProducto, getProductos, getProductoById, updateProducto, deleteProducto, } from "../controllers/productos-gestioo.controller.js";
const productosGestiooRouter = Router();
/* Catálogo: antes sin autenticación. Exige sesión; CLIENTE solo lectura */
productosGestiooRouter.use(requireAuth);
productosGestiooRouter.use(soloLecturaCliente);
/* ============================
   RUTAS DE POBLADO DE PRODUCTOS
   ============================ */
// Poblar productos desde JSON
productosGestiooRouter.post("/seed-productos", onlyRole("ADMIN", "ADMINISTRACION"), seedProductos);
/* ============================
   CRUD
============================ */
productosGestiooRouter.post("/", createProducto);
productosGestiooRouter.get("/", getProductos);
productosGestiooRouter.get("/:id", getProductoById);
productosGestiooRouter.put("/:id", updateProducto);
productosGestiooRouter.delete("/:id", deleteProducto);
export default productosGestiooRouter;
//# sourceMappingURL=productos-gestioo.routes.js.map