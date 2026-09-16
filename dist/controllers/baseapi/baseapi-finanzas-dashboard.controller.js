import { obtenerDashboardFinanzas, } from "../../service/baseapi/finanzas/finanzas-dashboard.service.js";
function parseEmpresa(value) {
    const empresa = String(value ??
        "")
        .trim()
        .toLowerCase();
    if (empresa !==
        "econnet" &&
        empresa !==
            "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids.");
    }
    return empresa;
}
function parseAno(value) {
    const ano = Number(value);
    if (!Number.isInteger(ano) ||
        ano <
            2000 ||
        ano >
            2100) {
        throw new Error("Año inválido.");
    }
    return ano;
}
export async function getFinanzasDashboard(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query
            .empresa);
        const ano = parseAno(req.query
            .ano);
        const data = await obtenerDashboardFinanzas({
            empresaKey,
            ano,
        });
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[FINANZAS DASHBOARD] Error:", error);
        return res
            .status(500)
            .json({
            ok: false,
            error: message,
            message,
        });
    }
}
//# sourceMappingURL=baseapi-finanzas-dashboard.controller.js.map