import { obtenerAlcanceCliente } from "../../service/empresas/alcance-cliente.service.js";
/* =======================================================
   GET /api/portal/mis-empresas
   Siempre se calcula sobre la empresa del token (no sobre X-Empresa-Id).
   ======================================================= */
export async function getMisEmpresasCliente(req, res) {
    try {
        const user = req.user;
        if (!user || user.rol !== "CLIENTE") {
            res.status(403).json({ success: false, error: "Solo para usuarios cliente" });
            return;
        }
        const alcance = await obtenerAlcanceCliente(user.id);
        res.json({
            success: true,
            data: {
                empresaIdPropia: alcance.empresaIdPropia,
                empresaIdActual: user.empresaId,
                verTodoGrupo: alcance.verTodoGrupo,
                grupo: alcance.grupo,
                empresas: alcance.empresas,
            },
        });
    }
    catch (error) {
        console.error("[portal-cliente] mis-empresas:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
//# sourceMappingURL=portal-cliente.controller.js.map