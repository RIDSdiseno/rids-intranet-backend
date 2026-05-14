import { getBaseApiRcvDashboard } from "../../service/baseapi/baseapi-rcv-dashboard.service.js";
function parseEmpresa(value) {
    const empresa = String(value ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }
    return empresa;
}
function parseTipo(value) {
    const tipo = String(value ?? "ventas").toLowerCase();
    if (tipo !== "ventas" && tipo !== "compras") {
        throw new Error("Tipo inválido. Usa tipo=ventas o tipo=compras");
    }
    return tipo;
}
function parsePeriodo(req) {
    const mes = String(req.query.mes ?? "").padStart(2, "0");
    const ano = String(req.query.ano ?? "");
    if (!/^\d{4}$/.test(ano)) {
        throw new Error("Año inválido");
    }
    if (!/^\d{2}$/.test(mes)) {
        throw new Error("Mes inválido");
    }
    const mesNum = Number(mes);
    if (mesNum < 1 || mesNum > 12) {
        throw new Error("Mes fuera de rango");
    }
    return { mes, ano };
}
export async function getBaseApiRcvDashboardController(req, res) {
    try {
        const empresa = parseEmpresa(req.query.empresa);
        const tipo = parseTipo(req.query.tipo);
        const { mes, ano } = parsePeriodo(req);
        const data = await getBaseApiRcvDashboard({
            empresa,
            tipo,
            mes,
            ano,
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
            ok: true,
            provider: "baseapi",
            data,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
        });
    }
}
//# sourceMappingURL=baseapi-rcv-dashboard.controller.js.map