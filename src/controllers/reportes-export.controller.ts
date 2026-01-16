import type { Request, Response } from "express";
import * as XLSX from "xlsx-js-style";
import { prisma } from "../lib/prisma.js";
import { buildReporteEmpresaData } from "../service/reportEmpresa.service.js";

/**
 * POST /api/reportes/export/sharepoint
 * body: { month: "YYYY-MM" }
 */
export async function exportReportesForSharepoint(
    req: Request,
    res: Response
) {
    try {
        const { month } = req.body;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                ok: false,
                error: "month requerido (YYYY-MM)",
            });
        }

        // 1️⃣ Obtener empresas activas
        const empresas = await prisma.empresa.findMany({
            select: {
                id_empresa: true,
                nombre: true,
            },
        });

        const archivos: {
            empresa: string;
            fileName: string;
            contentBase64: string;
        }[] = [];

        // 2️⃣ Generar un Excel por empresa
        for (const empresa of empresas) {
            const data = await buildReporteEmpresaData(
                empresa.id_empresa,
                month
            );

            // Crear Excel
            const wb = XLSX.utils.book_new();

            const wsResumen = XLSX.utils.json_to_sheet([
                { Métrica: "Empresa", Valor: data.empresa.nombre },
                { Métrica: "Periodo", Valor: month },
                { Métrica: "Visitas", Valor: data.visitas.count },
                { Métrica: "Equipos", Valor: data.equipos.count },
                { Métrica: "Tickets", Valor: data.tickets.total },
            ]);

            XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

            const buffer = XLSX.write(wb, {
                type: "buffer",
                bookType: "xlsx",
            });

            archivos.push({
                empresa: empresa.nombre,
                fileName: `Reporte_${empresa.nombre
                    .replace(/\s+/g, "_")
                    .replace(/[^\w]/g, "")}_${month}.xlsx`,
                contentBase64: buffer.toString("base64"),
            });
        }

        // 3️⃣ Respuesta para Power Automate
        return res.json({
            ok: true,
            archivos,
        });
    } catch (err) {
        console.error("❌ exportReportesForSharepoint:", err);
        return res.status(500).json({
            ok: false,
            error: "Error generando reportes",
        });
    }
}
