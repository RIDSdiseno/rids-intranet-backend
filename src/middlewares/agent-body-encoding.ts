// src/middlewares/agent-body-encoding.ts
//
// Cuerpo de los envíos del agente de inventario (Windows).
//
// Los agentes antiguos (1.x, 2.x, 8.x y 11.x en PowerShell 5.1) envían el JSON
// en Windows-1252/Latin-1 aunque digan UTF-8. Con express.json() cada tilde o ñ
// quedaba como «�» (U+FFFD) y se perdía: «Matías» -> «Mat�as».
//
// Este parser lee los bytes tal cual llegan:
//   - si son UTF-8 válido (agente v12, macOS, Postman...), se usan igual que antes;
//   - si no lo son, se decodifican como Windows-1252 (lo que envía PowerShell 5.1).
// Así los datos llegan bien sin tener que actualizar cada PC.
//
// Va ANTES del parser general en app.ts: al leer el cuerpo, el parser de 60 MB lo omite.

import express, {
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
} from "express";

const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
const decoderWindows1252 = new TextDecoder("windows-1252");

/** Texto del cuerpo: UTF-8 si es válido; si no, Windows-1252. */
export function decodificarBytesAgente(bytes: Uint8Array): { texto: string; windows1252: boolean } {
    let texto: string;
    let windows1252 = false;

    try {
        texto = decoderUtf8.decode(bytes);
    } catch {
        texto = decoderWindows1252.decode(bytes);
        windows1252 = true;
    }

    /* BOM UTF-8 al inicio (algunos clientes lo agregan) */
    if (texto.charCodeAt(0) === 0xfeff) {
        texto = texto.slice(1);
    }

    return { texto, windows1252 };
}

function decodificarCuerpoAgente(req: Request, res: Response, next: NextFunction): void {
    const bytes = req.body as unknown;

    /* Sin cuerpo (GET, OPTIONS) o ya leído por otro parser: sigue normal */
    if (!Buffer.isBuffer(bytes)) {
        next();
        return;
    }

    if (bytes.length === 0) {
        req.body = {};
        next();
        return;
    }

    const { texto, windows1252 } = decodificarBytesAgente(bytes);

    try {
        req.body = JSON.parse(texto);
    } catch {
        res.status(400).json({ ok: false, error: "El cuerpo no es un JSON válido" });
        return;
    }

    if (windows1252) {
        const cuerpo = req.body as { hostname?: unknown; agenteVersion?: unknown } | null;

        console.info(
            `[agent] cuerpo en Windows-1252 recodificado a UTF-8 ` +
            `(hostname=${String(cuerpo?.hostname ?? "?")}, agente=${String(cuerpo?.agenteVersion ?? "?")})`
        );
    }

    next();
}

/** Parser para las rutas del agente (inventory / uninstall). Mismo límite que el general. */
export const parserCuerpoAgente: RequestHandler[] = [
    express.raw({ type: () => true, limit: "60mb" }),
    decodificarCuerpoAgente,
];