import { Document, Packer, Paragraph, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun, } from "docx";
import fetch from "node-fetch";
/* ======================================================
   📊 Render gráfico (QuickChart → PNG)
====================================================== */
async function renderVisitasPorTipoChart(visitasPorTipo) {
    const config = {
        type: "pie",
        data: {
            labels: visitasPorTipo.map(v => v.tipo),
            datasets: [{ data: visitasPorTipo.map(v => v.cantidad) }],
        },
        options: {
            plugins: {
                legend: { position: "bottom" },
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
    return Buffer.from(await res.arrayBuffer());
}
/* ======================================================
   🧠 BUILDER FINAL – INFORME MENSUAL
====================================================== */
export async function buildReporteEmpresaDocx(data) {
    const children = [];
    /* =====================
       PORTADA
    ===================== */
    children.push(new Paragraph({
        text: "Informe Operativo",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
    }), new Paragraph({
        text: "Asesorías RIDS — Reporte operativo",
        alignment: AlignmentType.CENTER,
    }), new Paragraph({
        text: `${data.empresa.nombre} · ${data.month}`,
        alignment: AlignmentType.CENTER,
    }), new Paragraph({
        text: `Folio: ${data.empresa.nombre}-${data.month.replace("-", "")}`,
        alignment: AlignmentType.CENTER,
    }), new Paragraph({
        text: "soporte@rids.cl",
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
    }));
    /* =====================
       RESUMEN EJECUTIVO
    ===================== */
    children.push(new Paragraph({
        text: "Resumen Ejecutivo",
        heading: HeadingLevel.HEADING_2,
    }), new Paragraph({
        text: `Durante el periodo analizado se realizaron ${data.kpis.visitas.count} visitas técnicas, con un tiempo promedio de atención de ${Math.round(data.kpis.visitas.avgMs / 60000)} minutos por visita. Actualmente se encuentran registrados ${data.kpis.equipos.count} equipos asociados a la empresa y se generaron ${data.kpis.tickets.total} tickets de soporte durante el mes.`,
        spacing: { after: 400 },
    }));
    children.push(new Paragraph({
        text: "Contexto y Alcance",
        heading: HeadingLevel.HEADING_2,
    }), new Paragraph({ text: "Antecedentes", heading: HeadingLevel.HEADING_3 }), new Paragraph({
        text: "El presente informe resume solicitudes, tickets y actividades del periodo indicado.",
    }), new Paragraph({ text: "Objetivos", heading: HeadingLevel.HEADING_3 }), new Paragraph({
        text: "Prestar soporte informático externo asegurando continuidad operacional y cumplimiento de SLA.",
    }), new Paragraph({ text: "Métodos", heading: HeadingLevel.HEADING_3 }), new Paragraph({ text: "• Atención de incidencias vía HelpDesk." }), new Paragraph({ text: "• Mantenimientos preventivos a equipos." }), new Paragraph({ text: "• Emisión de informes mensuales." }));
    children.push(new Paragraph({
        text: "Análisis Operacional",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 600 },
    }), new Paragraph({
        text: "A continuación se presenta un análisis basado en la actividad operacional del periodo. Se incluyen gráficos de solicitudes, actividades de mantenimiento y equipamiento.",
        spacing: { after: 300 },
    }));
    /* =====================
       TABLA KPIs
    ===================== */
    children.push(new Paragraph({
        text: "Indicadores Clave de Gestión",
        heading: HeadingLevel.HEADING_2,
    }), new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            ["Indicador", "Valor"],
            ["Total de visitas", data.kpis.visitas.count],
            [
                "Duración promedio por visita",
                `${Math.round(data.kpis.visitas.avgMs / 60000)} min`,
            ],
            ["Equipos registrados", data.kpis.equipos.count],
            ["Tickets generados", data.kpis.tickets.total],
        ].map(row => new TableRow({
            children: row.map((cell) => new TableCell({
                children: [new Paragraph(String(cell))],
            })),
        })),
    }));
    /* =====================
       GRÁFICO VISITAS
    ===================== */
    if (data.visitasPorTipo?.length) {
        const chart = await renderVisitasPorTipoChart(data.visitasPorTipo);
        children.push(new Paragraph({
            text: "Distribución de Visitas por Tipo",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 500 },
        }), new Paragraph({
            text: "El siguiente gráfico presenta la proporción de visitas programadas y adicionales realizadas durante el periodo.",
            spacing: { after: 300 },
        }), new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new ImageRun({
                    data: chart,
                    type: "png",
                    transformation: { width: 500, height: 350 },
                }),
            ],
        }));
    }
    /* =====================
       DETALLE DE VISITAS
    ===================== */
    if (data.visitasDetalle?.length) {
        children.push(new Paragraph({
            text: "Detalle de Visitas Técnicas",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 500 },
        }), new Paragraph({
            text: "A continuación se detalla cada visita realizada, incluyendo fecha, técnico responsable, sucursal y observaciones relevantes.",
            spacing: { after: 300 },
        }), new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                ["Fecha", "Técnico", "Sucursal", "Observación"],
                ...data.visitasDetalle.map((v) => [
                    new Date(v.inicio).toLocaleDateString(),
                    v.tecnico?.nombre ?? "-",
                    v.sucursal?.nombre ?? "-",
                    v.otrosDetalle ?? "",
                ]),
            ].map(row => new TableRow({
                children: row.map((cell) => new TableCell({
                    children: [new Paragraph(String(cell))],
                })),
            })),
        }));
    }
    /* =====================
       INVENTARIO
    ===================== */
    if (data.inventarioDetalle?.length) {
        children.push(new Paragraph({
            text: "Inventario de Equipos",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 500 },
        }), new Paragraph({
            text: "Listado de equipos actualmente registrados y asociados a la empresa.",
            spacing: { after: 300 },
        }), new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                ["Tipo", "Marca", "Modelo", "Usuario"],
                ...data.inventarioDetalle.map((e) => [
                    e.tipo,
                    e.marca,
                    e.modelo,
                    e.solicitante ?? "-",
                ]),
            ].map(row => new TableRow({
                children: row.map((cell) => new TableCell({
                    children: [new Paragraph(String(cell))],
                })),
            })),
        }));
    }
    /* =====================
       TICKETS
    ===================== */
    if (data.ticketsDetalle?.length) {
        children.push(new Paragraph({
            text: "Detalle de Tickets de Soporte",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 500 },
        }), new Paragraph({
            text: "Registro de tickets generados durante el periodo, incluyendo tipo y estado.",
            spacing: { after: 300 },
        }), new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                ["Fecha", "Tipo", "Estado"],
                ...data.ticketsDetalle.map((t) => [
                    new Date(t.createdAt).toLocaleDateString(),
                    t.type ?? "-",
                    t.status ?? "-",
                ]),
            ].map(row => new TableRow({
                children: row.map((cell) => new TableCell({
                    children: [new Paragraph(String(cell))],
                })),
            })),
        }));
    }
    /* =====================
       CIERRE EJECUTIVO
    ===================== */
    children.push(new Paragraph({
        text: "Conclusión",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 600 },
    }), new Paragraph({
        text: "El presente informe permite visualizar el estado general del soporte TI entregado durante el periodo evaluado, facilitando la toma de decisiones y el seguimiento de la operación. Este documento se genera de manera automática a partir de los registros del sistema, garantizando consistencia y trazabilidad de la información.",
    }));
    /* =====================
       DOCUMENTO FINAL
    ===================== */
    const doc = new Document({
        sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
}
//# sourceMappingURL=buildReporteEmpresaDocx.js.map