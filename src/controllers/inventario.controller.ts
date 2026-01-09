import type { Request, Response } from "express";
import XLSX from "xlsx-js-style";
import { getInventarioByEmpresa } from "../service/inventario.service.js";

/* ======================================================
   🎨 Estilos por empresa
====================================================== */
function getEmpresaStyle(nombre: string) {
  const n = nombre.toLowerCase();
  if (n.includes("alianz")) return { header: "FF2563EB", body: "FFDBEAFE" };
  if (n.includes("infinet")) return { header: "FF1E40AF", body: "FFE0E7FF" };
  if (n.includes("rids")) return { header: "FF059669", body: "FFD1FAE5" };
  return { header: "FF334155", body: "FFF1F5F9" };
}

function styleSheet(
  ws: XLSX.WorkSheet,
  rows: number,
  cols: number,
  colors: { header: string; body: string }
) {
  for (let c = 0; c < cols; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    cell.s = {
      fill: { fgColor: { rgb: colors.header } },
      font: { bold: true, color: { rgb: "FFFFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }

  for (let r = 1; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = { fill: { fgColor: { rgb: colors.body } } };
    }
  }

  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows, c: cols - 1 },
    }),
  };

  ws["!cols"] = Array.from({ length: cols }).map(() => ({ wch: 18 }));
}

/* ======================================================
   🧠 Excel builder
====================================================== */
function buildInventarioExcel(
  equipos: Awaited<ReturnType<typeof getInventarioByEmpresa>>
): Buffer {
  const porEmpresa: Record<string, typeof equipos> = {};

  for (const e of equipos) {
    const empresa = e.solicitante?.empresa?.nombre ?? "SIN_EMPRESA";
    porEmpresa[empresa] ??= [];
    porEmpresa[empresa].push(e);
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

    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

    styleSheet(ws, rows.length, headers.length, getEmpresaStyle(empresa));
    XLSX.utils.book_append_sheet(wb, ws, empresa.substring(0, 31));
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/* ======================================================
   📥 Export manual
====================================================== */
export async function exportInventario(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const params: { empresaId?: number } = {};

    if (req.query.empresaId) {
      const id = Number(req.query.empresaId);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: "empresaId inválido" });
      }
      params.empresaId = id;
    }

    const equipos = await getInventarioByEmpresa(params);
    const buffer = buildInventarioExcel(equipos);

    res.setHeader("Content-Disposition", "attachment; filename=Inventario.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error exportando inventario" });
  }
}

/* ======================================================
   🤖 Export Power Automate
====================================================== */
export async function exportInventarioForSharepoint(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { mes } = req.body;

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({
        ok: false,
        error: "Mes requerido (YYYY-MM)",
      });
    }

    const equipos = await getInventarioByEmpresa({});
    const buffer = buildInventarioExcel(equipos);

    return res.json({
      ok: true,
      fileName: `Inventario_${mes}.xlsx`,
      contentBase64: buffer.toString("base64"),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Error interno",
    });
  }
}
