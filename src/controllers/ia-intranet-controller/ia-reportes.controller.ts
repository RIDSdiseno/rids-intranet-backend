import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

import { buildReporteEmpresaData } from "../../service/ia-metricas-reportes/reportEmpresa.service.js";
import { generarAnalisisIA } from "../../service/ia-metricas-reportes/ia-reportes.service.js";

export async function generarInformeOperativoIA(
    req: Request,
    res: Response
) {
    try {

        const empresaId = Number(req.params.empresaId);
        const year = Number(req.params.year);
        const month = Number(req.params.month);

        if (!empresaId || !year || !month) {
            return res.status(400).json({
                error: "Parámetros inválidos"
            });
        }

        const periodo =
            `${year}-${String(month).padStart(2, "0")}`;

        /* ========================================
           1️⃣ Revisar cache
        ======================================== */
        const existente = await prisma.reporteIA.findUnique({
            where: {
                empresaId_periodo: {
                    empresaId,
                    periodo
                }
            }
        });

        if (existente) {

            console.log("⚡ Informe IA obtenido desde cache");

            return res.json({
                cached: true,
                empresaId,
                periodo,
                data: existente.contenido
            });

        }

        /* ========================================
           2️⃣ Construir dataset completo
        ======================================== */
        console.log("📊 Construyendo dataset del reporte...");

        const reporte =
            await buildReporteEmpresaData(empresaId, periodo);

        /* ========================================
           3️⃣ Generar análisis IA
        ======================================== */
        console.log("🤖 Generando análisis con IA...");

        const analisis =
            await generarAnalisisIA(reporte);

        /* ========================================
           4️⃣ Guardar cache
        ======================================== */
        await prisma.reporteIA.create({

            data: {
                empresaId,
                periodo,
                contenido: analisis
            }

        });

        console.log("💾 Informe IA guardado en cache");

        /* ========================================
           5️⃣ Respuesta
        ======================================== */
        return res.json({

            cached: false,
            empresaId,
            periodo,
            data: analisis

        });

    } catch (error) {

        console.error("❌ generarInformeOperativoIA error:", error);

        return res.status(500).json({
            error: "Error generando informe IA"
        });

    }
}