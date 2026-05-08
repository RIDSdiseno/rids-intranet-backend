// src/routes/permisos-routes/role-permissions.routes.ts

import { Router } from "express";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import {
  listRolePermissions,
  setRolePermissions,
} from "../../controllers/permisos-controller/role-permissions.controller.js";

const router = Router();

router.get("/", auth(), onlyRole("ADMIN"), listRolePermissions);
router.put("/", auth(), onlyRole("ADMIN"), setRolePermissions);

export default router;