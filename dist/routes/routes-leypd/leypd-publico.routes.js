// src/routes/routes-leypd/leypd-publico.routes.ts
import { Router, } from "express";
import { getFichaLeypdPublica, putFichaLeypdPublica, postEnviarFichaLeypdPublica, } from "../../controllers/controllers-leypd/leypd-ficha.controller.js";
const router = Router();
/* =====================================================
   FICHA PÚBLICA
===================================================== */
router.get("/ficha/:token", getFichaLeypdPublica);
router.put("/ficha/:token", putFichaLeypdPublica);
router.post("/ficha/:token/enviar", postEnviarFichaLeypdPublica);
export default router;
//# sourceMappingURL=leypd-publico.routes.js.map