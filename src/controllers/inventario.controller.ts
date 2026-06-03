// src/controllers/inventario.controller.ts
import type { Request, Response } from "express";
import XLSX from "xlsx-js-style";
import { getInventarioByEmpresa } from "../service/inventario.service.js";

/* ======================================================
   Estilos por empresa (Excel)
====================================================== */
function getEmpresaStyle(nombre: string) {
    const n = nombre.toLowerCase();
    if (n.includes("alianz")) return { header: "FF2563EB", body: "FFDBEAFE" };
    if (n.includes("infinet")) return { header: "FF1E40AF", body: "FFE0E7FF" };
    if (n.includes("rids")) return { header: "FF059669", body: "FFD1FAE5" };
    return { header: "FF334155", body: "FFF1F5F9" };
}

/* ======================================================
  Estilos de hoja Excel
====================================================== */
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

    // Columnas
    ws["!cols"] = Array.from({ length: cols }).map(() => ({ wch: 18 }));
}

// ======================================================
/*  Normalización de nombres de empresa
====================================================== */
function normalizeEmpresa(nombre: string): string {
    return nombre
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");;
}

/* ======================================================
    Resolución de rutas SharePoint (CLAVE)
====================================================== */
function resolveSharepointPath(empresa: string): string | null {
    const key = normalizeEmpresa(empresa);

    const map: Record<string, string> = {
        // CLIENTES DIRECTOS
        "ALIANZ":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ALIANZ/Inventario",

        "ASUR":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ASUR/Inventario",

        "BERCIA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BERCIA/Inventario",

        "BDK":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BDK/Inventario",

        "RWAY":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/RWAY/Inventario",

        "CINTAX":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CINTAX/Inventario",

        "GRUPO COLCHAGUA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO COLCHAGUA/Inventario",

        "FIJACIONES PROCRET":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/PROCRET/Inventario",

        // GRUPO T-SALES
        "T-SALES":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/T-SALES/Inventario",

        "INFINET":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/INFINET/Inventario",

        "VPRIME":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/VPRIME/Inventario",

        // GRUPO JPL
        "JPL":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO JPL/JPL/Inventario",

        // GRUPO PINI
        "PINI":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO PINI/PINI Y CIA/Inventario",

        // CLÍNICA NACE
        "CLN ALAMEDA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/1-ALAMEDA/Inventario",

        "CLN PROVIDENCIA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/2-PROVIDENCIA/Inventario",
    };

    return map[key] ?? null;
}

function formatTipoEquipo(tipo?: string | null): string {
    if (!tipo) return "";

    const map: Record<string, string> = {
        GENERICO: "Genérico",
        NOTEBOOK: "Notebook",
        ALL_IN_ONE: "All in One",
        DESKTOP: "Desktop",
        CPU: "CPU",
        EQUIPO_ARMADO: "Equipo armado",
        IMPRESORA: "Impresora",
        SCANNER: "Scanner",
        LASER: "Láser",
        LED: "LED",
        MONITOR: "Monitor",
        NAS: "NAS",
        ROUTER: "Router",
        DISCO_DURO_EXTERNO: "Disco duro externo",
        CARGADOR: "Cargador",
        INSUMOS_COMPUTACIONALES: "Insumos computacionales",
        RELOJ_CONTROL: "Reloj control",
        OTRO: "Otro",
    };

    return map[tipo] ?? tipo;
}

function formatEstadoEquipo(estado?: string | null): string {
    if (!estado) return "";

    const map: Record<string, string> = {
        ACTIVO: "Activo",
        EN_STOCK: "En stock",
        DADO_DE_BAJA: "Dado de baja",
        EN_RIDS: "En RIDS",
    };

    return map[estado] ?? estado;
}

function formatFechaChile(value?: Date | string | null): string {
    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const parts = formatter.formatToParts(date);

    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year = parts.find((p) => p.type === "year")?.value ?? "";

    if (!day || !month || !year) return "";

    return `${day}/${month}/${year}`;
}

function formatRevisado(value?: string | null): string {
    if (!value) return "";

    const raw = String(value).trim();

    // Si viene como fecha ISO o fecha parseable, la formatea.
    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
        return formatFechaChile(parsed);
    }

    // Si viene como texto tipo "SI", "NO", "Revisado", etc., lo deja igual.
    return raw;
}

function parseDateQuery(value: unknown): Date | undefined {
    if (typeof value !== "string") return undefined;
    if (!value.trim()) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    return date;
}

/* ======================================================
    Construcción del Excel
====================================================== */
function buildInventarioExcel(
    equipos: Awaited<ReturnType<typeof getInventarioByEmpresa>>,
    mes: string
): Buffer {
    const porEmpresa: Record<string, typeof equipos> = {};

    for (const e of equipos) {
        const empresa = normalizeEmpresa(
            e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? "SIN_EMPRESA"
        );
        porEmpresa[empresa] ??= [];
        porEmpresa[empresa].push(e);
    }

    const wb = XLSX.utils.book_new();

    for (const [empresa, items] of Object.entries(porEmpresa)) {
        if (items.length === 0) continue;
        const rows = items.map((e, i) => ({
            "Código": i + 1,
            "USUARIO": e.solicitante?.nombre ?? "",
            "CORREO": e.solicitante?.email ?? "",
            "ESTADO EQUIPO": formatEstadoEquipo(e.estado),
            "SERIAL": e.serial ?? "",
            "MARCA": e.marca ?? "",
            "MODELO": e.modelo ?? "",
            "CPU": e.procesador ?? "",
            "RAM": e.ram ?? "",
            "DISCO": e.disco ?? "",
            "SISTEMA OPERATIVO": e.detalle?.so ?? "",
        }));

        const headers = [
            "Código",
            "USUARIO",
            "CORREO",
            "ESTADO EQUIPO",
            "SERIAL",
            "MARCA",
            "MODELO",
            "CPU",
            "RAM",
            "DISCO",
            "SISTEMA OPERATIVO",
        ];

        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

        styleSheet(
            ws,
            rows.length,
            headers.length,
            getEmpresaStyle(empresa)
        );

        XLSX.utils.book_append_sheet(wb, ws, empresa.substring(0, 31));
    }

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/* ======================================================
    Export MANUAL (Web)
   GET /api/inventario/export
====================================================== */
export async function exportInventario(req: Request, res: Response) {
    try {
        const user = (req as any).user;

        const mes =
            typeof req.query.mes === "string" && /^\d{4}-\d{2}$/.test(req.query.mes)
                ? req.query.mes
                : "SIN_MES";

        let empresaId: number | undefined = undefined;

        // Si es cliente → forzar su empresa
        if (user?.rol === "CLIENTE") {
            empresaId = user.empresaId;
        } else {
            //  Técnico puede usar filtro opcional
            if (req.query.empresaId) {
                const id = Number(req.query.empresaId);
                if (!Number.isNaN(id)) {
                    empresaId = id;
                }
            }
        }

        const createdFrom = parseDateQuery(req.query.createdFrom);
        const createdTo = parseDateQuery(req.query.createdTo);
        const updatedFrom = parseDateQuery(req.query.updatedFrom);
        const updatedTo = parseDateQuery(req.query.updatedTo);

        const equipos = await getInventarioByEmpresa({
            ...(empresaId ? { empresaId } : {}),

            ...(createdFrom ? { createdFrom } : {}),
            ...(createdTo ? { createdTo } : {}),
            ...(updatedFrom ? { updatedFrom } : {}),
            ...(updatedTo ? { updatedTo } : {}),
        });

        const buffer = buildInventarioExcel(equipos, mes);

        const fileName = empresaId
            ? `Inventario_${empresaId}_${mes}.xlsx`
            : `Inventario_TODAS_${mes}.xlsx`;

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=${fileName}`
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return res.send(buffer);
    } catch (err) {
        console.error("❌ EXPORT INVENTARIO:", err);
        return res.status(500).json({ error: "Error exportando inventario" });
    }
}

/* ======================================================
    Export AUTOMÁTICO (Power Automate)
   POST /api/inventario/export/sharepoint
====================================================== */
export async function exportInventarioForSharepoint(
    req: Request,
    res: Response
) {
    try {
        // Mes actual
        const now = new Date();
        const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const timestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD

        const equipos = await getInventarioByEmpresa({});
        if (!equipos.length) {
            return res.status(404).json({ ok: false, error: "Sin inventario" });
        }

        const porEmpresa: Record<string, typeof equipos> = {};
        for (const e of equipos) {
            const empresa = normalizeEmpresa(
                e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? "SIN_EMPRESA"
            );
            porEmpresa[empresa] ??= [];
            porEmpresa[empresa].push(e);
        }

        // Construir archivos por empresa
        const archivos = Object.entries(porEmpresa)
            .map(([empresa, items]) => {
                const sharepointPath = resolveSharepointPath(empresa);
                if (!sharepointPath) {
                    console.warn(`⚠️ Empresa sin ruta SharePoint: ${empresa}`);
                    return null;
                }

                const buffer = buildInventarioExcel(items, mes);

                return {
                    empresa,
                    sharepointPath,
                    fileName: `Inventario_${empresa}_${mes}_${timestamp}.xlsx`,
                    contentBase64: buffer.toString("base64"),
                };
            })
            .filter(Boolean);

        // Verificar si hay archivos para subir
        if (!archivos.length) {
            return res.status(404).json({
                ok: false,
                error: "Ninguna empresa tiene ruta SharePoint definida",
            });
        }

        // Responder con los archivos listos para subir a SharePoint
        return res.json({
            ok: true,
            mes,
            totalArchivos: archivos.length,
            archivos,
        });
    } catch (err) {
        console.error("❌ EXPORT SP:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
}

// ======================================================
/*  Obtener Inventario
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
            empresa: e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? null,
            usuario: e.solicitante?.nombre ?? null,
            correo: e.solicitante?.email ?? null,

            usuarioEmpresa: e.detalle?.usuarioEmpresa ?? null,
            usuarioRids: e.detalle?.adminRidsUsuario ?? null,

            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,

            so: e.detalle?.so ?? null,
            licenciaUsuario: e.detalle?.office ?? null,
            teamViewer: e.detalle?.teamViewer ?? null,
            claveTeamViewer: e.detalle?.claveTv ?? null,
            macWifi: e.detalle?.macWifi ?? null,

            propiedad: e.propiedad,
            estadoEquipo: e.estado,
            anioPc: e.anioPc ?? null,
            tipoEquipo: e.tipo,
            fechaIngreso: formatFechaChile(e.createdAt),
            revisado: formatRevisado(e.detalle?.revisado),
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