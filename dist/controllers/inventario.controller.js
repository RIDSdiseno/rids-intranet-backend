import XLSX from "xlsx-js-style";
import { getInventarioByEmpresa } from "../service/inventario.service.js";
/* ===== estilos por empresa ===== */
function getEmpresaStyle(nombre) {
    const n = nombre.toLowerCase();
    if (n.includes("alianz"))
        return { header: "FF2563EB", body: "FFDBEAFE" };
    if (n.includes("infinet"))
        return { header: "FF1E40AF", body: "FFE0E7FF" };
    if (n.includes("rids"))
        return { header: "FF059669", body: "FFD1FAE5" };
    return { header: "FF334155", body: "FFF1F5F9" };
}
function styleSheet(XLSX, ws, rows, cols, colors) {
    for (let c = 0; c < cols; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (!cell)
            continue;
        cell.s = {
            fill: { fgColor: { rgb: colors.header } },
            font: { bold: true, color: { rgb: "FFFFFFFF" } },
            alignment: { horizontal: "center" },
        };
    }
    for (let r = 1; r <= rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell)
                continue;
            cell.s = {
                fill: { fgColor: { rgb: colors.body } },
            };
        }
    }
    ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: rows, c: cols - 1 },
        }),
    };
}
/* ===== controller ===== */
export async function exportInventario(req, res) {
    try {
        const params = {};
        if (req.query.empresaId)
            params.empresaId = Number(req.query.empresaId);
        const mes = typeof req.query.mes === "string" ? req.query.mes : "SIN_MES";
        const equipos = await getInventarioByEmpresa(params);
        // Agrupar por empresa
        const porEmpresa = {};
        for (const e of equipos) {
            const nombre = e.solicitante?.empresa?.nombre ?? "SIN_EMPRESA";
            porEmpresa[nombre] ??= [];
            porEmpresa[nombre].push(e);
        }
        const wb = XLSX.utils.book_new();
        for (const [empresa, items] of Object.entries(porEmpresa)) {
            const rows = items.map((e, i) => ({
                "N°": i + 1,
                "USUARIO": e.solicitante?.nombre ?? "",
                "CORREO": e.solicitante?.email ?? "",
                "SERIAL": e.serial ?? "",
                "MARCA": e.marca ?? "",
                "MODELO": e.modelo ?? "",
                "CPU": e.procesador ?? "",
                "RAM": e.ram ?? "",
                "DISCO": e.disco ?? "",
                "SO": e.equipo?.[0]?.so ?? "",
                "OFFICE": e.equipo?.[0]?.office ?? "",
                "TEAMVIEWER": e.equipo?.[0]?.teamViewer ?? "",
                "MAC WIFI": e.equipo?.[0]?.macWifi ?? "",
                "PROPIEDAD": e.propiedad ?? "",
            }));
            const headers = Object.keys(rows[0] ?? {});
            const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
            styleSheet(XLSX, ws, rows.length, headers.length, getEmpresaStyle(empresa));
            XLSX.utils.book_append_sheet(wb, ws, empresa.substring(0, 31));
        }
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", `attachment; filename=Inventario_${mes}.xlsx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error exportando inventario" });
    }
}
//# sourceMappingURL=inventario.controller.js.map