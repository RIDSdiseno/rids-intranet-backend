import type { Request, Response } from "express";
import { buildReporteEmpresaData } from "../service/reportEmpresa.service.js";
import { buildReporteEmpresaDocx } from "../reports/buildReporteEmpresaDocx.js";
import { resolveSharepointPathReporte } from "../utils/sharepointPaths.js";

/* ======================================================
   🧹 Normalización nombre empresa (igual que inventarios)
====================================================== */
function normalizeEmpresa(nombre: string): string {
    return nombre
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

type SharepointArchivo = {
    empresa: string;
    sharepointPath: string;
    fileName: string;
    contentBase64: string;
};

/* ======================================================
   🤖 Export AUTOMÁTICO – Reportes a SharePoint
   POST /api/reportes/export/sharepoint
====================================================== */
export async function exportReportesForSharepoint(
    req: Request,
    res: Response
) {
    try {
        /* =====================
           Mes (YYYY-MM)
        ===================== */
        const now = new Date();
        const mes =
            typeof req.body?.month === "string" &&
                /^\d{4}-\d{2}$/.test(req.body.month)
                ? req.body.month
                : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const timestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD

        /* =====================
           Empresas activas
        ===================== */
        const empresas = await req.app
            .get("prisma")
            .empresa.findMany({
                select: {
                    id_empresa: true,
                    nombre: true,
                },
            });

        if (!empresas.length) {
            return res.status(404).json({
                ok: false,
                error: "No hay empresas para procesar",
            });
        }

        /* =====================
           Construcción archivos
        ===================== */
        const archivos: SharepointArchivo[] = [];

        for (const empresa of empresas) {
            const sharepointPath = resolveSharepointPathReporte(
                empresa.nombre
            );

            if (!sharepointPath) {
                console.warn(
                    `⚠️ Empresa sin ruta SharePoint (Reporte): ${empresa.nombre}`
                );
                continue;
            }

            // PASO 1
            const data = await buildReporteEmpresaData(
                empresa.id_empresa,
                mes
            );

            // PASO 2
            const buffer = await buildReporteEmpresaDocx(data);

            archivos.push({
                empresa: empresa.nombre,
                sharepointPath,
                fileName: `Reporte_${normalizeEmpresa(
                    empresa.nombre
                )}_${mes}_${timestamp}.docx`,
                contentBase64: buffer.toString("base64"),
            });
        }

        if (!archivos.length) {
            return res.status(404).json({
                ok: false,
                error: "Ninguna empresa tiene ruta SharePoint definida",
            });
        }

        /* =====================
           Respuesta para Power Automate
        ===================== */
        return res.json({
            ok: true,
            mes,
            totalArchivos: archivos.length,
            archivos,
        });
    } catch (err: any) {
        console.error("❌ EXPORT REPORTES SP ERROR:");
        console.error(err);
        console.error(err?.stack);

        return res.status(500).json({
            ok: false,
            error: err?.message ?? "Error interno",
        });
    }

}
