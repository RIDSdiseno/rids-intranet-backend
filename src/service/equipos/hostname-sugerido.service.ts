// src/service/equipos/hostname-sugerido.service.ts
//
// Hostname sugerido para equipos PC (solo sugerencia, no modifica nada).
// Formato: <NT|WS>-<SIGLA>-<INICIAL+APELLIDO>[n], maximo 15 caracteres (NetBIOS).
//   - NT = notebook; WS = resto de tipos PC.
//   - SIGLA: calculada desde el nombre de la empresa (sin campo en BD).
//   - Sin solicitante: correlativo por empresa (NT-CLC-01).
//   - Duplicado dentro de la empresa: sufijo 2, 3...

import { prisma } from "../../lib/prisma.js";

export const HOSTNAME_MAX = 15;

const TIPOS_PC = new Set([
    "GENERICO",
    "NOTEBOOK",
    "ALL_IN_ONE",
    "DESKTOP",
    "CPU",
    "EQUIPO_ARMADO",
]);

// Palabras que no aportan a la sigla de la empresa.
// Los articulos (LA, LAS, LOS, EL) se mantienen: suelen ser parte del nombre
// (Clinica Las Condes -> CLC).
const PALABRAS_IGNORADAS_EMPRESA = new Set([
    "SPA", "LTDA", "LIMITADA", "EIRL", "CIA", "COMPANIA", "SOCIEDAD",
    "DE", "DEL", "Y", "E",
]);

// Particulas de apellidos compuestos (Maria de la Fuente)
const PARTICULAS_NOMBRE = new Set([
    "DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DI", "VAN", "VON",
]);

/** Mayusculas, sin tildes ni caracteres fuera de A-Z / 0-9 (la Ñ pasa a N). */
export function normalizarTexto(valor: string): string {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

/** Sigla de la empresa: iniciales (hasta 4) o, si es una sola palabra, sus 4 primeras letras. */
export function calcularSiglaEmpresa(nombre: string): string {
    // "S.A." / "S. A." al final o en medio
    const sinSa = nombre.replace(/\bS\s*\.\s*A\s*\.?(?=\s|$)/gi, " ");

    const palabras = normalizarTexto(sinSa)
        .split(" ")
        .filter((p) => p && !PALABRAS_IGNORADAS_EMPRESA.has(p));

    if (palabras.length === 0) return "EMP";

    if (palabras.length === 1) {
        return (palabras[0] ?? "EMP").slice(0, 4);
    }

    return palabras
        .slice(0, 4)
        .map((p) => p.charAt(0))
        .join("");
}

/**
 * Inicial del primer nombre + primer apellido.
 *   2-3 palabras: Juan Perez [Soto] -> JPEREZ
 *   4+ palabras:  Juan Carlos Perez Soto -> JPEREZ (penultima)
 */
export function calcularParteSolicitante(nombre: string): string | null {
    const palabras = normalizarTexto(nombre)
        .split(" ")
        .filter((p) => p && !PARTICULAS_NOMBRE.has(p));

    if (palabras.length === 0) return null;

    const primera = palabras[0] ?? "";

    if (palabras.length === 1) return primera;

    const apellido =
        palabras.length >= 4
            ? palabras[palabras.length - 2] ?? ""
            : palabras[1] ?? "";

    return `${primera.charAt(0)}${apellido}`;
}

export function prefijoTipo(tipo: string): string {
    return tipo === "NOTEBOOK" ? "NT" : "WS";
}

/** Candidato n (1 = sin sufijo), recortando el nombre para respetar el maximo. */
export function armarCandidato(base: string, nombre: string, n: number): string {
    const sufijo = n > 1 ? String(n) : "";
    const largoNombre = Math.max(1, HOSTNAME_MAX - base.length - sufijo.length);

    return `${base}${nombre.slice(0, largoNombre)}${sufijo}`;
}

export type HostnameSugeridoResultado = {
    ok: true;
    idEquipo: number;
    actual: string | null;
    sugerido: string | null;
    coincide: boolean;
    motivo: string | null;
    detalle: {
        prefijo: string | null;
        sigla: string | null;
        parteSolicitante: string | null;
        sinSolicitante: boolean;
    };
};

/**
 * Calcula la sugerencia a partir de los datos ya cargados.
 * `ocupados`: hostnames (en mayusculas) de los otros equipos de la empresa.
 */
export function sugerirHostname(params: {
    tipo: string;
    hostnameActual: string | null;
    nombreEmpresa: string | null;
    nombreSolicitante: string | null;
    ocupados: Set<string>;
}): {
    sugerido: string | null;
    motivo: string | null;
    prefijo: string | null;
    sigla: string | null;
    parteSolicitante: string | null;
} {
    if (!TIPOS_PC.has(params.tipo)) {
        return {
            sugerido: null,
            motivo: "Solo se sugiere hostname para equipos PC.",
            prefijo: null,
            sigla: null,
            parteSolicitante: null,
        };
    }

    if (!params.nombreEmpresa) {
        return {
            sugerido: null,
            motivo: "Asigne una empresa al equipo para sugerir hostname.",
            prefijo: null,
            sigla: null,
            parteSolicitante: null,
        };
    }

    const prefijo = prefijoTipo(params.tipo);
    const sigla = calcularSiglaEmpresa(params.nombreEmpresa);
    const base = `${prefijo}-${sigla}-`;
    const actual = (params.hostnameActual ?? "").trim().toUpperCase();

    const parteSolicitante = params.nombreSolicitante
        ? calcularParteSolicitante(params.nombreSolicitante)
        : null;

    // Sin solicitante: correlativo 01..99 dentro de la empresa
    if (!parteSolicitante) {
        const candidatos: string[] = [];

        for (let n = 1; n <= 99; n++) {
            candidatos.push(`${base}${String(n).padStart(2, "0")}`);
        }

        // Si el hostname actual ya es un correlativo valido y libre, se respeta
        if (candidatos.includes(actual) && !params.ocupados.has(actual)) {
            return { sugerido: actual, motivo: null, prefijo, sigla, parteSolicitante: null };
        }

        const libre = candidatos.find((c) => !params.ocupados.has(c)) ?? null;

        return {
            sugerido: libre,
            motivo: libre ? null : "No hay correlativos libres (01 a 99) para esta empresa.",
            prefijo,
            sigla,
            parteSolicitante: null,
        };
    }

    const candidatos: string[] = [];

    for (let n = 1; n <= 99; n++) {
        candidatos.push(armarCandidato(base, parteSolicitante, n));
    }

    // Si el hostname actual ya calza con el formato (con o sin sufijo) y esta libre, se respeta
    if (candidatos.includes(actual) && !params.ocupados.has(actual)) {
        return { sugerido: actual, motivo: null, prefijo, sigla, parteSolicitante };
    }

    const libre = candidatos.find((c) => !params.ocupados.has(c)) ?? null;

    return {
        sugerido: libre,
        motivo: libre ? null : "No hay sufijos libres (2 a 99) para este solicitante.",
        prefijo,
        sigla,
        parteSolicitante,
    };
}

/** Carga los datos del equipo y calcula el hostname sugerido. null = equipo no existe. */
export async function obtenerHostnameSugerido(
    idEquipo: number
): Promise<HostnameSugeridoResultado | null> {
    const equipo = await prisma.equipo.findFirst({
        where: { id_equipo: idEquipo, deletedAt: null },
        select: {
            id_equipo: true,
            tipo: true,
            hostname: true,
            empresaId: true,
            empresa: { select: { nombre: true } },
            solicitante: { select: { nombre: true, empresaId: true } },
        },
    });

    if (!equipo) return null;

    const empresaId = equipo.empresaId ?? equipo.solicitante?.empresaId ?? null;

    let nombreEmpresa = equipo.empresa?.nombre ?? null;

    if (!nombreEmpresa && empresaId) {
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { nombre: true },
        });

        nombreEmpresa = empresa?.nombre ?? null;
    }

    const ocupados = new Set<string>();

    if (empresaId) {
        const otros = await prisma.equipo.findMany({
            where: {
                id_equipo: { not: equipo.id_equipo },
                deletedAt: null,
                hostname: { not: null },
                OR: [
                    { empresaId },
                    { empresaId: null, solicitante: { is: { empresaId } } },
                ],
            },
            select: { hostname: true },
        });

        for (const o of otros) {
            if (o.hostname) ocupados.add(o.hostname.trim().toUpperCase());
        }
    }

    const r = sugerirHostname({
        tipo: String(equipo.tipo),
        hostnameActual: equipo.hostname,
        nombreEmpresa,
        nombreSolicitante: equipo.solicitante?.nombre ?? null,
        ocupados,
    });

    const actual = equipo.hostname?.trim() || null;

    return {
        ok: true,
        idEquipo: equipo.id_equipo,
        actual,
        sugerido: r.sugerido,
        coincide: Boolean(r.sugerido && actual && actual.toUpperCase() === r.sugerido),
        motivo: r.motivo,
        detalle: {
            prefijo: r.prefijo,
            sigla: r.sigla,
            parteSolicitante: r.parteSolicitante,
            sinSolicitante: !equipo.solicitante,
        },
    };
}