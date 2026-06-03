import { consultarDtePorFolioBaseApi } from "../../service/baseapi/baseapi-dte.service.js";
import { chromium } from "playwright";
function parseEmpresa(value) {
    const empresa = String(value ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }
    return empresa;
}
// Función para parsear el periodo desde la query, aceptando tanto el formato "periodo=YYYY-MM" como "mes=MM&ano=YYYY", y validando que el formato sea correcto.
function parsePeriodoFromQuery(req) {
    const periodoRaw = String(req.query.periodo ?? "").trim();
    if (/^\d{4}-\d{2}$/.test(periodoRaw)) {
        return periodoRaw;
    }
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
    return `${ano}-${mes}`;
}
function parseTipoDTE(value) {
    const tipoDTE = Number(value ?? 33);
    if (!Number.isFinite(tipoDTE) || tipoDTE <= 0) {
        throw new Error("tipoDTE inválido");
    }
    return tipoDTE;
}
function parseForceRefresh(value) {
    return String(value ?? "false").toLowerCase() === "true";
}
// Función para consultar un DTE por folio en BaseAPI, dado la empresa, el periodo, el folio, el tipo de DTE, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
export async function getDtePorFolioBaseApi(req, res) {
    try {
        const empresa = parseEmpresa(req.query.empresa);
        const periodo = parsePeriodoFromQuery(req);
        const folio = String(req.params.folio ?? "").trim();
        const tipoDTE = parseTipoDTE(req.query.tipoDTE);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);
        if (!folio) {
            res.status(400).json({
                ok: false,
                provider: "baseapi",
                error: "Folio requerido",
            });
            return;
        }
        const resultado = await consultarDtePorFolioBaseApi({
            empresa,
            periodo,
            folio,
            tipoDTE,
            forceRefresh,
        });
        res.json({
            ok: true,
            provider: "baseapi",
            empresa,
            periodo,
            folio,
            tipoDTE,
            cached: resultado.cached,
            data: resultado.data,
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
export async function getDtePdfPorFolioBaseApi(req, res) {
    try {
        const empresa = parseEmpresa(req.query.empresa);
        const periodo = parsePeriodoFromQuery(req);
        const folio = String(req.params.folio ?? "").trim();
        const tipoDTE = parseTipoDTE(req.query.tipoDTE);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);
        if (!folio) {
            res.status(400).json({ ok: false, error: "Folio requerido" });
            return;
        }
        const resultado = await consultarDtePorFolioBaseApi({
            empresa,
            periodo,
            folio,
            tipoDTE,
            forceRefresh,
        });
        const factura = resultado.data?.documento ?? {};
        const items = factura.items ?? [];
        const html = `
            <html>
            <head>
                <meta charset="utf-8" />
                <style>
                    @page { size: A4; margin: 30mm 20mm 20mm 20mm; }
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#111; }
                    .wrapper { width: 100%; }
                    .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8mm; }

                    /* Logo / Emisor */
                    .logo-area { width:60%; }
                    .logo-title { font-size:28px; font-weight:800; letter-spacing:1px; }
                    .logo-sub { font-size:10px; margin-top:4px; }

                    /* Caja roja con RUT / tipo / folio */
                    .info-box { width:36%; border:2px solid #d33; padding:10px; color:#d33; text-align:center; }
                    .info-box .rut { font-weight:800; font-size:16px; }
                    .info-box .title { font-weight:800; font-size:14px; margin-top:6px; }
                    .info-box .folio { font-size:20px; font-weight:900; color:#c00; margin-top:6px; }
                    .info-box .sii { font-size:11px; color:#c00; margin-top:6px; }

                    .emisor-meta { margin-top:6px; font-size:11px; }

                    .receptor { margin-top:6mm; margin-bottom:6mm; font-size:12px; }
                    .receptor .left { width:65%; display:inline-block; vertical-align:top; }
                    .receptor .right { width:33%; display:inline-block; vertical-align:top; text-align:right; }

                    /* Tabla items */
                    .items { width:100%; border-collapse:collapse; margin-top:6mm; }
                    .items th { background:#fff; border:1px solid #000; padding:8px; font-weight:700; }
                    .items td { border:1px solid #000; padding:8px; vertical-align:top; }
                    .col-desc { width:62%; }
                    .col-cant { width:8%; text-align:center; }
                    .col-ppu { width:15%; text-align:right; }
                    .col-total { width:15%; text-align:right; }

                    /* Totales */
                    .summary { margin-top:8mm; display:flex; justify-content:flex-end; }
                    .summary table { border-collapse:collapse; width:40%; }
                    .summary td { padding:6px 8px; }
                    .summary .label { text-align:left; }
                    .summary .value { text-align:right; font-weight:700; }

                    /* Timbre */
                    .timbre { margin-top:8mm; display:flex; gap:12mm; align-items:flex-start; }
                    .timbre .box { width:120px; height:80px; border:1px solid #000; }
                    .timbre .verify { font-size:10px; color:#444; }

                    footer { position:fixed; bottom:10mm; left:20mm; right:20mm; font-size:10px; color:#666; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="top">
                        <div class="logo-area">
                            <div class="logo-title">${escapeHtml(factura.razon_social_emisor ?? factura.razonSocialEmisor ?? 'ECONNET')}</div>
                            <div class="logo-sub">${escapeHtml((factura.giro_emisor ?? factura.giroEmisor) || '')}</div>
                            <div class="emisor-meta">
                                <div>R.U.T.: ${escapeHtml(factura.rut_emisor ?? factura.rutEmisor ?? '')}</div>
                                <div>${escapeHtml(factura.direccion_emisor ?? factura.direccionEmisor ?? '')}</div>
                                <div>${escapeHtml((factura.comuna_emisor ?? factura.comunaEmisor) || '')} - ${escapeHtml((factura.ciudad_emisor ?? factura.ciudadEmisor) || '')}</div>
                            </div>
                        </div>

                        <div class="info-box">
                            <div class="rut">R.U.T.: ${escapeHtml(factura.rut_emisor ?? factura.rutEmisor ?? '')}</div>
                            <div class="title">FACTURA ELECTRÓNICA</div>
                            <div class="folio">Nº ${escapeHtml(String(factura.folio ?? ''))}</div>
                            <div class="sii">S.I.I. - ${escapeHtml(String((factura.sucursal ?? factura.sucursalSii ?? '')))}</div>
                        </div>
                    </div>

                    <div class="receptor">
                        <div class="left">
                            <strong>R.U.T. / Razón social receptor</strong>
                            <div>${escapeHtml(factura.rut_receptor ?? factura.rutReceptor ?? '')} : ${escapeHtml(factura.razon_social_receptor ?? factura.razonSocialReceptor ?? '')}</div>
                            <div>${escapeHtml(factura.direccion_receptor ?? factura.direccionReceptor ?? '')}</div>
                        </div>
                        <div class="right">
                            <div>Fecha: ${escapeHtml(String(factura.fecha ?? factura.fechaEmision ?? ''))}</div>
                            <div>Vence: ${escapeHtml(String(factura.fecha_vencimiento ?? factura.fechaVencimiento ?? '-'))}</div>
                            <div>Venta: ${escapeHtml(String(factura.tipo_dte_nombre ?? factura.tipo_dte ?? ''))}</div>
                        </div>
                    </div>

                    <table class="items">
                        <thead>
                            <tr>
                                <th style="width:6%">Ítem</th>
                                <th class="col-desc">Descripción</th>
                                <th class="col-cant">Cant.</th>
                                <th class="col-ppu">P. unitario</th>
                                <th class="col-total">Total item</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((it, i) => `
                                <tr>
                                    <td style="text-align:center">${escapeHtml(String(it.linea ?? it.line ?? i + 1))}</td>
                                    <td>${escapeHtml(String(it.nombre ?? it.descripcion ?? ''))}</td>
                                    <td style="text-align:center">${escapeHtml(String(it.cantidad ?? ''))}</td>
                                    <td style="text-align:right">${escapeHtml(String(it.precioUnitario ?? it.precioUnitario ?? ''))}</td>
                                    <td style="text-align:right">${escapeHtml(String(it.montoItem ?? it.montoItem ?? ''))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="summary">
                        <table>
                            <tr><td class="label">Monto Neto $ :</td><td class="value">${escapeHtml(String(factura.monto_neto ?? factura.montoNeto ?? factura.monto_neto ?? ''))}</td></tr>
                            <tr><td class="label">IVA (19%) $ :</td><td class="value">${escapeHtml(String(factura.monto_iva ?? factura.montoIVA ?? ''))}</td></tr>
                            <tr><td class="label"><strong>Total $ :</strong></td><td class="value"><strong>${escapeHtml(String(factura.monto_total ?? factura.montoTotal ?? ''))}</strong></td></tr>
                        </table>
                    </div>

                    <div class="timbre">
                        <div class="box"></div>
                        <div class="verify">Timbre Electrónico SII<br/>Verifique documento: www.sii.cl</div>
                    </div>

                    <footer>Documento generado por sistema - ${escapeHtml(String(new Date().toLocaleString()))}</footer>
                </div>
            </body>
            </html>
        `;
        const browser = await chromium.launch({ args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });
        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
        await browser.close();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="factura-${empresa}-${folio}.pdf"`);
        res.send(pdfBuffer);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("❌ Error generando PDF DTE:", message);
        res.status(500).json({ ok: false, error: message });
    }
}
function escapeHtml(input) {
    if (input === undefined || input === null)
        return "";
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
//# sourceMappingURL=baseapi-dte.controller.js.map