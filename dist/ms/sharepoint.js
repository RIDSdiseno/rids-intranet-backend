// src/ms/sharepoint.ts
import fetch from "node-fetch";
import { obtenerTokenSharepoint, } from "./graph.js";
const GRAPH = "https://graph.microsoft.com/v1.0";
/* =====================================================
   HTTP
===================================================== */
async function graphGet(path) {
    const token = await obtenerTokenSharepoint();
    const url = path.startsWith("http")
        ? path
        : `${GRAPH}${path}`;
    const r = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (r.ok) {
        return (await r.json());
    }
    const texto = await r.text().catch(() => "");
    if (r.status === 404) {
        throw new Error("SHAREPOINT_NO_ENCONTRADO");
    }
    if (r.status === 401 ||
        r.status === 403) {
        console.error("[SharePoint] Sin permisos:", texto.slice(0, 500));
        throw new Error("SHAREPOINT_SIN_PERMISOS");
    }
    throw new Error(`SHAREPOINT_ERROR ${r.status}: ${texto.slice(0, 300)}`);
}
const SELECT_ITEM = "$select=id,name,webUrl,size,lastModifiedDateTime,folder,file,parentReference";
function codificarSegmentos(segmentos) {
    return segmentos
        .map((s) => encodeURIComponent(s))
        .join("/");
}
/* =====================================================
   RESOLVER URL → CARPETA
===================================================== */
/**
 * Obtiene la ruta de servidor (/sites/X/Biblioteca/...) desde:
 * - URL de vista: .../Forms/AllItems.aspx?id=%2Fsites%2FX%2F...
 * - URL directa:  https://tenant.sharepoint.com/sites/X/Biblioteca/...
 */
function obtenerRutaServidor(url) {
    const id = url.searchParams.get("id");
    if (id) {
        return id;
    }
    const ruta = decodeURIComponent(url.pathname);
    if (/\/Forms\/[^/]+\.aspx$/i.test(ruta)) {
        throw new Error("SHAREPOINT_URL_INVALIDA");
    }
    return ruta;
}
/**
 * Resolución por ruta: sitio → biblioteca → carpeta.
 * Determinística y compatible con permisos app-only.
 */
async function resolverPorRuta(url) {
    const segmentos = obtenerRutaServidor(url)
        .split("/")
        .filter(Boolean);
    if (segmentos.length < 3 ||
        (segmentos[0] !== "sites" &&
            segmentos[0] !== "teams")) {
        throw new Error("SHAREPOINT_URL_INVALIDA");
    }
    const sitePath = `/${segmentos[0]}/${segmentos[1]}`;
    const site = await graphGet(`/sites/${url.hostname}:${encodeURI(sitePath)}?$select=id`);
    const drives = await graphGet(`/sites/${site.id}/drives?$select=id,webUrl`);
    const bibliotecaUrl = segmentos[2];
    /*
     * La biblioteca se identifica por el segmento de su URL
     * (p.ej. "Documentos compartidos" o "Shared Documents"),
     * no por su nombre visible.
     */
    const drive = drives.value.find((d) => {
        const partes = decodeURIComponent(new URL(d.webUrl).pathname)
            .split("/")
            .filter(Boolean);
        return (partes[2]?.toLowerCase() ===
            bibliotecaUrl.toLowerCase());
    });
    if (!drive) {
        throw new Error("SHAREPOINT_NO_ENCONTRADO");
    }
    const rutaRelativa = segmentos.slice(3);
    const item = rutaRelativa.length === 0
        ? await graphGet(`/drives/${drive.id}/root?${SELECT_ITEM}`)
        : await graphGet(`/drives/${drive.id}/root:/${codificarSegmentos(rutaRelativa)}?${SELECT_ITEM}`);
    if (!item.folder) {
        throw new Error("SHAREPOINT_NO_ES_CARPETA");
    }
    return {
        driveId: drive.id,
        itemId: item.id,
        nombre: item.name,
        webUrl: item.webUrl,
    };
}
/**
 * Resolución de enlaces de uso compartido (/:f:/s/...).
 */
async function resolverPorEnlaceCompartido(urlTexto) {
    const codificado = "u!" +
        Buffer.from(urlTexto, "utf8")
            .toString("base64")
            .replace(/=+$/, "")
            .replace(/\//g, "_")
            .replace(/\+/g, "-");
    const item = await graphGet(`/shares/${codificado}/driveItem?${SELECT_ITEM}`);
    if (!item.folder) {
        throw new Error("SHAREPOINT_NO_ES_CARPETA");
    }
    const driveId = item.parentReference?.driveId;
    if (!driveId) {
        throw new Error("SHAREPOINT_NO_ENCONTRADO");
    }
    return {
        driveId,
        itemId: item.id,
        nombre: item.name,
        webUrl: item.webUrl,
    };
}
/**
 * Convierte una URL de SharePoint (copiada del navegador
 * o un enlace compartido) en la carpeta correspondiente.
 */
export async function resolverCarpetaDesdeUrl(urlTexto) {
    let url;
    try {
        url = new URL(urlTexto.trim());
    }
    catch {
        throw new Error("SHAREPOINT_URL_INVALIDA");
    }
    if (!/\.sharepoint\.com$/i.test(url.hostname)) {
        throw new Error("SHAREPOINT_URL_INVALIDA");
    }
    /*
     * Enlaces compartidos: https://x.sharepoint.com/:f:/s/...
     */
    if (url.pathname.startsWith("/:")) {
        return resolverPorEnlaceCompartido(urlTexto.trim());
    }
    return resolverPorRuta(url);
}
/* =====================================================
   LISTAR HIJOS
===================================================== */
export async function listarHijosCarpeta(driveId, itemId) {
    const items = [];
    let siguiente = `/drives/${driveId}/items/${itemId}/children?${SELECT_ITEM}&$top=200`;
    while (siguiente) {
        const pagina = await graphGet(siguiente);
        items.push(...pagina.value);
        siguiente =
            pagina["@odata.nextLink"] ??
                null;
    }
    return items;
}
//# sourceMappingURL=sharepoint.js.map