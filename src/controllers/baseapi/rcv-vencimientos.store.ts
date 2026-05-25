import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'rcv-vencimientos.json');

type Key = string; // empresa|tipo|folio

async function ensureFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.access(DATA_FILE);
    } catch (e) {
        await fs.writeFile(DATA_FILE, JSON.stringify({}), 'utf8');
    }
}

async function readAll(): Promise<Record<Key, string>> {
    try {
        await ensureFile();
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        return {};
    }
}

function makeKey(empresaKey: string, tipoDoc: string, folio: string) {
    return `${String(empresaKey || '').toLowerCase()}|${String(tipoDoc || '')}|${String(folio || '')}`;
}

export async function getOverride(empresaKey: string, tipoDoc: string, folio: string): Promise<string | null> {
    const all = await readAll();
    const k = makeKey(empresaKey, tipoDoc, folio);
    return all[k] ?? null;
}

export async function setOverride(empresaKey: string, tipoDoc: string, folio: string, fechaIso: string | null) {
    const all = await readAll();
    const k = makeKey(empresaKey, tipoDoc, folio);
    if (fechaIso === null || fechaIso === '') {
        delete all[k];
    } else {
        all[k] = fechaIso;
    }
    await fs.writeFile(DATA_FILE, JSON.stringify(all, null, 2), 'utf8');
}

export async function listOverrides() {
    return await readAll();
}

export default { getOverride, setOverride, listOverrides };
