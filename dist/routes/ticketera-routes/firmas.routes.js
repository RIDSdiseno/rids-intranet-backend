// Rutas para gestión de firmas digitales (subida, listado, etc.) en Ticketera RIDS
import { Router } from "express";
import { localUpload } from "../../config/multer-local.js";
import { subirFirma } from "../../controllers/tickets-rids/firmas.controller.js";
const FirmasRouter = Router();
const uploadFirma = localUpload("firmas");
FirmasRouter.post("/", uploadFirma.single("file"), subirFirma);
export default FirmasRouter;
//# sourceMappingURL=firmas.routes.js.map