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
    // Header
    for (let c = 0; c < cols; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (!cell) continue;
        cell.s = {
            fill: { fgColor: { rgb: colors.header } },
            font: { bold: true, color: { rgb: "FFFFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
    }

    // Body
    for (let r = 1; r <= rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) continue;
            cell.s = {
                fill: { fgColor: { rgb: colors.body } },
            };
        }
    }

    // Autofiltro
    ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: rows, c: cols - 1 },
        }),
    };

    // Anchos automáticos
    ws["!cols"] = Array.from({ length: cols }).map(() => ({ wch: 18 }));
}

/* ======================================================
   🧠 Construcción del Excel (reutilizable)
====================================================== */
function buildInventarioExcel(
    equipos: Awaited<ReturnType<typeof getInventarioByEmpresa>>,
    mes: string
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

        if (rows.length === 0) continue;

        const headers = [
            "N°",
            "USUARIO",
            "CORREO",
            "SERIAL",
            "MARCA",
            "MODELO",
            "CPU",
            "RAM",
            "DISCO",
            "SO",
            "OFFICE",
            "TEAMVIEWER",
            "MAC WIFI",
            "PROPIEDAD",
        ];

        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

        styleSheet(
            ws,
            rows.length,
            headers.length,
            getEmpresaStyle(empresa)
        );

        XLSX.utils.book_append_sheet(
            wb,
            ws,
            empresa.substring(0, 31) // límite Excel
        );
    }

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/* ======================================================
   📥 Export MANUAL (Front / Navegador)
   GET /api/inventario/export
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

        const mes =
            typeof req.query.mes === "string" && /^\d{4}-\d{2}$/.test(req.query.mes)
                ? req.query.mes
                : "SIN_MES";

        const equipos = await getInventarioByEmpresa(params);
        const buffer = buildInventarioExcel(equipos, mes);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=Inventario_${mes}.xlsx`
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return res.send(buffer);
    } catch (err) {
        console.error("❌ ERROR EXPORT INVENTARIO:", err);
        return res.status(500).json({ error: "Error exportando inventario" });
    }
}

/* ======================================================
   🤖 Export AUTOMÁTICO (Power Automate / SharePoint)
   POST /api/inventario/export/sharepoint
====================================================== */
export async function exportInventarioForSharepoint(
    req: Request,
    res: Response
): Promise<Response> {
    try {
        const mes = req.body?.mes;

        if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
            return res.status(400).json({ ok: false, error: "Mes requerido (YYYY-MM)" });
        }

        const equipos = await getInventarioByEmpresa({});

        // 🔹 validar que haya inventario
        if (!equipos || equipos.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "No hay inventario para exportar"
            });
        }

        // 🔹 agrupar por empresa
        const porEmpresa: Record<string, typeof equipos> = {};

        for (const e of equipos) {
            const empresa = e.solicitante?.empresa?.nombre ?? "SIN_EMPRESA";
            porEmpresa[empresa] ??= [];
            porEmpresa[empresa].push(e);
        }

        // 🔹 validar que haya empresas con inventario
        if (Object.keys(porEmpresa).length === 0) {
            return res.status(404).json({
                ok: false,
                error: "No se encontraron empresas con inventario"
            });
        }

        // 🔹 generar un archivo por empresa
        const archivos = Object.entries(porEmpresa)
            .filter(([_, items]) => items.length > 0)
            .map(([empresa, items]) => {
                const buffer = buildInventarioExcel(items, mes);

                return {
                    empresa,
                    fileName: `Inventario_${empresa}_${mes}.xlsx`,
                    contentBase64: buffer.toString("base64"),
                };
            });

        // 🔹 validar que se hayan generado archivos
        if (archivos.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "No se generaron archivos de inventario"
            });
        }

        // 🔹 responder con los archivos generados
        return res.json({
            ok: true,
            totalArchivos: archivos.length,
            empresas: archivos.map(a => a.empresa),
            archivos
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
}

// ======================================================
/* 📋 Obtener Inventario
   GET /api/inventario
====================================================== */
export async function getInventario(
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

        const data = equipos.map(e => ({
            id_equipo: e.id_equipo,
            empresa: e.solicitante?.empresa?.nombre ?? null,
            usuario: e.solicitante?.nombre ?? null,
            correo: e.solicitante?.email ?? null,
            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,
            so: e.equipo?.[0]?.so ?? null,
            office: e.equipo?.[0]?.office ?? null,
            teamViewer: e.equipo?.[0]?.teamViewer ?? null,
            macWifi: e.equipo?.[0]?.macWifi ?? null,
            propiedad: e.propiedad
        }));

        return res.json({
            ok: true,
            total: data.length,
            data
        });
    } catch (err) {
        console.error("❌ ERROR GET INVENTARIO:", err);
        return res.status(500).json({ ok: false, error: "Error obteniendo inventario" });
    }
}

