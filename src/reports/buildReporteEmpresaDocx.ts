import {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ImageRun,
} from "docx";
import fetch from "node-fetch";
import type { FileChild } from "docx";

/* ======================================================
   📊 Render gráfico (QuickChart → PNG)
====================================================== */
async function renderVisitasPorTipoChart(
    visitasPorTipo: { tipo: string; cantidad: number }[]
): Promise<Buffer> {
    const config = {
        type: "pie",
        data: {
            labels: visitasPorTipo.map(v => v.tipo),
            datasets: [
                {
                    data: visitasPorTipo.map(v => v.cantidad),
                },
            ],
        },
        options: {
            plugins: {
                legend: {
                    position: "bottom",
                },
            },
        },
    };

    const res = await fetch("https://quickchart.io/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chart: config,
            width: 600,
            height: 400,
            backgroundColor: "white",
        }),
    });

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/* ======================================================
   🧠 PASO 2 – Builder del DOCX
====================================================== */
export async function buildReporteEmpresaDocx(data: {
    empresa: { id_empresa: number; nombre: string };
    month: string;
    kpis: {
        visitas: { count: number; totalMs: number; avgMs: number };
        equipos: { count: number };
        tickets: { total: number };
    };
    visitasPorTipo: { tipo: string; cantidad: number }[];
}): Promise<Buffer> {

    /* =====================
       Contenedor del documento
    ===================== */
    const children: FileChild[] = [];

    /* =====================
       Portada
    ===================== */
    children.push(
        new Paragraph({
            text: "REPORTE MENSUAL DE SOPORTE",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
            text: data.empresa.nombre,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
            text: `Periodo: ${data.month}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
        })
    );

    /* =====================
       KPIs
    ===================== */
    children.push(
        new Paragraph({
            text: "Resumen Ejecutivo",
            heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph(`Visitas realizadas: ${data.kpis.visitas.count}`),
        new Paragraph(`Equipos registrados: ${data.kpis.equipos.count}`),
        new Paragraph(`Tickets generados: ${data.kpis.tickets.total}`),
        new Paragraph({ text: "", spacing: { after: 300 } })
    );

    /* =====================
       Tabla KPIs
    ===================== */
    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph("Indicador")],
                    }),
                    new TableCell({
                        children: [new Paragraph("Valor")],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph("Total visitas")],
                    }),
                    new TableCell({
                        children: [
                            new Paragraph(String(data.kpis.visitas.count)),
                        ],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph("Duración promedio")],
                    }),
                    new TableCell({
                        children: [
                            new Paragraph(
                                `${Math.round(
                                    data.kpis.visitas.avgMs / 60000
                                )} min`
                            ),
                        ],
                    }),
                ],
            }),
        ],
    });

    children.push(table);

    /* =====================
       Gráfico Visitas por tipo
    ===================== */
    if (data.visitasPorTipo.length > 0) {
        children.push(
            new Paragraph({
                text: "Distribución de visitas",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 400 },
            })
        );

        const chartPng = await renderVisitasPorTipoChart(
            data.visitasPorTipo
        );

        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new ImageRun({
                        data: chartPng,
                        type: "png",
                        transformation: {
                            width: 500,
                            height: 350,
                        },
                    }),
                ],
            })
        );
    }

    /* =====================
       Documento final
    ===================== */
    const doc = new Document({
        sections: [
            {
                properties: {},
                children,
            },
        ],
    });

    return Packer.toBuffer(doc);
}
