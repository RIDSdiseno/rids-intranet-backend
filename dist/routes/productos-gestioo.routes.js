// src/routes/productos.routes.ts
import { Router } from "express";
import { seedProductos, createProducto, getProductos, getProductoById, updateProducto, deleteProducto, } from "../controllers/productos-gestioo.controller.js";
const productosGestiooRouter = Router();
/* ============================
   RUTAS DE POBLADO DE PRODUCTOS
   ============================ */
// Poblar productos desde JSON
productosGestiooRouter.post("/seed-productos", seedProductos);
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