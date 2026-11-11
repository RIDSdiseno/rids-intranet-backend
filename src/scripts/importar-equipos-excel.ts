// src/scripts/importar-equipos-excel.ts
//
// Importa equipos desde el Excel de inventario (hoja con columnas
// "Nombre de equipo", "Fabricante", "Modelo", "Numero de serie", ...).
//
// Uso:
//   npx tsx src/scripts/importar-equipos-excel.ts <archivo.xlsx> <empresaId>            -> simulación
//   npx tsx src/scripts/importar-equipos-excel.ts <archivo.xlsx> <empresaId> --aplicar  -> escribe
//
// Reglas:
// - Equipo existente (mismo serial, o mismo hostname en la empresa):
//   solo se completan los campos vacíos. No se pisa nada.
// - Serial genérico ("System Serial Number", "To be filled by O.E.M.", ...)
//   se guarda como NULL. El agente lo encontrará después por hostname + empresa.
// - Solicitante: se busca por nombre (sin tildes ni mayúsculas) dentro de la
//   empresa. Si no hay uno único, queda en "[SIN SOLICITANTE]".
// - No toca los campos del agente (agenteActivo, estadoAgente, lastSeenAt).

import "dotenv/config";

import {
    createRequire,
} from "node:module";

import {
    TipoEquipo,
    type Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../lib/prisma.js";

import {
    calcularAnioPcDesdeSerial,
} from "../utils/equipos/anio-pc.util.js";

const require =
    createRequire(
        import.meta.url,
    );

const XLSX =
    require(
        "xlsx",
    );

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const ARCHIVO =
    process.argv[2];

const EMPRESA_ID =
    Number(
        process.argv[3],
    );

const APLICAR =
    process.argv.includes(
        "--aplicar",
    );

const PLACEHOLDER_SOLICITANTE =
    "[SIN SOLICITANTE]";

const SERIALES_INVALIDOS =
    new Set([
        "SYSTEM SERIAL NUMBER",
        "TO BE FILLED BY O.E.M.",
        "DEFAULT STRING",
        "NOT APPLICABLE",
        "NONE",
        "N/D",
        "0",
        "123456789",
        "0123456789",
    ]);

const TEXTOS_GENERICOS =
    new Set([
        "SYSTEM MANUFACTURER",
        "SYSTEM PRODUCT NAME",
        "TO BE FILLED BY O.E.M.",
        "DEFAULT STRING",
        "N/D",
    ]);

const COLUMNAS_OBLIGATORIAS = [
    "Nombre de equipo",
    "Fabricante",
    "Modelo",
    "Numero de serie",
] as const;

/* =========================================================
   TIPOS
========================================================= */

type FilaExcel =
    Record<string, unknown>;

type EquipoExcel = {
    fila: number;
    hostname: string;
    serial: string | null;
    serialOriginal: string | null;
    marca: string;
    modelo: string;
    tipo: TipoEquipo;
    procesador: string | null;
    ram: string | null;
    ramGb: number | null;
    disco: string | null;
    diskTotalGb: number | null;
    usuarioActual: string | null;
    dominio: string | null;
    localIp: string | null;
    macAddress: string | null;
    macWifi: string | null;
    macEthernet: string | null;
    so: string | null;
    tipoDd: string | null;
    office: string | null;
    antivirusNombre: string | null;
    responsable: string | null;
    observaciones: string | null;
    softwares: string[];
};

type SolicitanteMini = {
    id_solicitante: number;
    nombre: string;
};

/* =========================================================
   HELPERS
========================================================= */

function texto(
    value: unknown,
): string | null {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const t =
        String(value)
            .replace(/\u0000/g, "")
            .trim();

    return t &&
        t.toUpperCase() !== "N/D"
        ? t
        : null;
}

function numero(
    value: unknown,
): number | null {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n =
        Number(
            String(value).replace(",", "."),
        );

    return Number.isFinite(n)
        ? n
        : null;
}

function normalizarNombre(
    value: string,
): string {
    return value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function serialValido(
    value: string | null,
): string | null {
    if (!value) {
        return null;
    }

    const s =
        value.toUpperCase();

    if (
        SERIALES_INVALIDOS.has(s) ||
        s.length < 4 ||
        /^0+$/.test(s)
    ) {
        return null;
    }

    return s;
}

function textoReal(
    value: string | null,
    porDefecto: string,
): string {
    return value &&
        !TEXTOS_GENERICOS.has(
            value.toUpperCase(),
        )
        ? value
        : porDefecto;
}

function tipoDesdeExcel(
    value: string | null,
): TipoEquipo {
    const t =
        normalizarNombre(
            value ?? "",
        );

    if (t.includes("notebook") || t.includes("laptop")) return TipoEquipo.NOTEBOOK;
    if (t.includes("all in one") || t.includes("all-in-one")) return TipoEquipo.ALL_IN_ONE;
    if (t.includes("escritorio") || t.includes("desktop")) return TipoEquipo.DESKTOP;

    return TipoEquipo.GENERICO;
}

/** "Ethernet 3: 2C:56:.. | Wi-Fi 5: 6C:72:.." -> { wifi, ethernet } */
function separarMacs(
    value: string | null,
): { wifi: string | null; ethernet: string | null } {
    let wifi: string | null = null;
    let ethernet: string | null = null;

    for (const parte of (value ?? "").split("|")) {
        const match =
            parte.match(/^\s*(.+?):\s*([0-9A-F]{2}(?::[0-9A-F]{2}){5})\s*$/i);

        if (!match) continue;

        const nombre =
            (match[1] ?? "").toLowerCase();

        const mac =
            (match[2] ?? "").toUpperCase();

        if (!wifi && nombre.startsWith("wi-fi")) wifi = mac;
        if (!ethernet && nombre.startsWith("ethernet")) ethernet = mac;
    }

    return { wifi, ethernet };
}

/** Primer disco interno: "KINGSTON SA400 - 447 GB SSD SATA | Sabrent - 477 GB SSD USB" -> "447 GB SSD SATA" */
function discoPrincipal(
    value: string | null,
): string | null {
    const discos =
        (value ?? "")
            .split("|")
            .map((d) => d.trim())
            .filter((d) => d && !/\bUSB\b/i.test(d));

    const primero =
        discos[0];

    if (!primero) {
        return null;
    }

    const partes =
        primero.split(" - ");

    return (partes[partes.length - 1] ?? primero).trim();
}

function tipoDiscoDesde(
    disco: string | null,
): string | null {
    if (!disco) return null;
    if (/nvme/i.test(disco)) return "SSD NVMe";
    if (/ssd/i.test(disco)) return "SSD";

    return "HDD";
}

/** "Grupo de trabajo: WORKGROUP" / "Dominio: corp.local" -> "WORKGROUP" / "corp.local" */
function dominioDesde(
    value: string | null,
): string | null {
    if (!value) return null;

    const partes =
        value.split(":");

    return texto(
        partes.length > 1
            ? partes.slice(1).join(":")
            : value,
    );
}

function leerFila(
    fila: FilaExcel,
    numeroFila: number,
): EquipoExcel | null {
    const col =
        (nombre: string) =>
            texto(fila[nombre]);

    const hostname =
        col("Nombre de equipo");

    if (!hostname) {
        return null;
    }

    const serialOriginal =
        col("Numero de serie");

    const ramGb =
        numero(fila["RAM total (GB)"]);

    const tipoRam =
        col("Modulos RAM")?.match(/\bDDR\d\b/i)?.[0]?.toUpperCase() ?? null;

    const disco =
        discoPrincipal(
            col("Discos fisicos"),
        );

    const macs =
        separarMacs(
            col("Direccion MAC"),
        );

    const so =
        [
            col("Sistema operativo"),
            col("Version / compilacion"),
        ]
            .filter(Boolean)
            .join(" ") || null;

    const observaciones =
        [
            col("Observaciones"),
            col("Ubicacion / Area")
                ? `Ubicación: ${col("Ubicacion / Area")}`
                : null,
            col("N. de activo / Etiqueta")
                ? `N° activo: ${col("N. de activo / Etiqueta")}`
                : null,
            `Importado desde inventario Excel${col("Fecha inventario") ? ` (${col("Fecha inventario")})` : ""}.`,
        ]
            .filter(Boolean)
            .join("\n");

    const softwares =
        [
            ...new Set(
                (col("Programas instalados (lista)") ?? "")
                    .split(";")
                    .map((s) => s.trim())
                    .filter(Boolean),
            ),
        ];

    return {
        fila: numeroFila,
        hostname,
        serial: serialValido(serialOriginal),
        serialOriginal,
        marca: textoReal(col("Fabricante"), "Sin marca"),
        modelo: textoReal(col("Modelo"), "Sin modelo"),
        tipo: tipoDesdeExcel(col("Tipo de equipo")),
        procesador: col("Procesador"),
        ram:
            ramGb !== null
                ? `${ramGb} GB${tipoRam ? ` ${tipoRam}` : ""}`
                : null,
        ramGb,
        disco,
        diskTotalGb: numero(fila["Capacidad total discos (GB)"]),
        usuarioActual: col("Usuario actual"),
        dominio: dominioDesde(col("Dominio / Grupo de trabajo")),
        localIp: col("Direccion IP"),
        macAddress: macs.ethernet ?? macs.wifi,
        macWifi: macs.wifi,
        macEthernet: macs.ethernet,
        so,
        tipoDd: tipoDiscoDesde(disco),
        office: col("Microsoft Office"),
        antivirusNombre: col("Antivirus"),
        responsable: col("Responsable / Asignado a"),
        observaciones,
        softwares,
    };
}

/** Devuelve solo los campos que hoy están vacíos en el registro actual. */
function soloVacios<T extends Record<string, unknown>>(
    actual: Record<string, unknown>,
    nuevos: T,
): Partial<T> {
    const out: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(nuevos)) {
        const a =
            actual[k];

        if (v === null || v === undefined || v === a) continue;

        const vacio =
            a === null ||
            a === undefined ||
            a === "" ||
            a === "Sin marca" ||
            a === "Sin modelo";

        if (vacio) {
            out[k] = v;
        }
    }

    return out as Partial<T>;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
    if (
        !ARCHIVO ||
        !Number.isInteger(EMPRESA_ID) ||
        EMPRESA_ID <= 0
    ) {
        console.error(
            "Uso: npx tsx src/scripts/importar-equipos-excel.ts <archivo.xlsx> <empresaId> [--aplicar]",
        );
        process.exitCode = 1;
        return;
    }

    const empresa =
        await prisma.empresa.findUnique({
            where: { id_empresa: EMPRESA_ID },
            select: { id_empresa: true, nombre: true, isActive: true },
        });

    if (!empresa || !empresa.isActive) {
        console.error(`La empresa ${EMPRESA_ID} no existe o está inactiva.`);
        process.exitCode = 1;
        return;
    }

    /* ---------- Leer Excel ---------- */

    const libro =
        XLSX.readFile(ARCHIVO);

    const hoja =
        libro.Sheets[libro.SheetNames[0]];

    const filas: FilaExcel[] =
        XLSX.utils.sheet_to_json(hoja, { defval: "" });

    const columnas =
        Object.keys(filas[0] ?? {});

    const faltantes =
        COLUMNAS_OBLIGATORIAS.filter((c) => !columnas.includes(c));

    if (faltantes.length > 0) {
        console.error(`Faltan columnas en el Excel: ${faltantes.join(", ")}`);
        process.exitCode = 1;
        return;
    }

    const equipos =
        filas
            .map((f, i) => leerFila(f, i + 2))
            .filter((e): e is EquipoExcel => e !== null);

    console.log(`\nEmpresa: ${empresa.nombre} (id ${empresa.id_empresa})`);
    console.log(`Archivo: ${ARCHIVO}`);
    console.log(`Filas con equipo: ${equipos.length}`);
    console.log(APLICAR ? "Modo: APLICAR (escribe en la base)\n" : "Modo: SIMULACIÓN (no escribe nada)\n");

    /* ---------- Seriales repetidos dentro del Excel ---------- */

    const vistos =
        new Map<string, number>();

    for (const e of equipos) {
        if (!e.serial) continue;

        const previa =
            vistos.get(e.serial);

        if (previa) {
            console.warn(`⚠ Serial ${e.serial} repetido en filas ${previa} y ${e.fila}: la fila ${e.fila} se omite.`);
            e.serial = null;
            e.hostname = "";
        } else {
            vistos.set(e.serial, e.fila);
        }
    }

    /* ---------- Solicitantes de la empresa ---------- */

    const solicitantes: SolicitanteMini[] =
        await prisma.solicitante.findMany({
            where: {
                empresaId: EMPRESA_ID,
                isActive: true,
                deletedAt: null,
            },
            select: { id_solicitante: true, nombre: true },
        });

    const porNombre =
        new Map<string, SolicitanteMini[]>();

    for (const s of solicitantes) {
        const clave =
            normalizarNombre(s.nombre);

        porNombre.set(clave, [...(porNombre.get(clave) ?? []), s]);
    }

    let placeholderId: number | null =
        (
            await prisma.solicitante.findFirst({
                where: { empresaId: EMPRESA_ID, nombre: PLACEHOLDER_SOLICITANTE },
                select: { id_solicitante: true },
            })
        )?.id_solicitante ?? null;

    async function obtenerPlaceholder(): Promise<number | null> {
        if (placeholderId || !APLICAR) {
            return placeholderId;
        }

        placeholderId =
            (
                await prisma.solicitante.create({
                    data: { empresaId: EMPRESA_ID, nombre: PLACEHOLDER_SOLICITANTE },
                    select: { id_solicitante: true },
                })
            ).id_solicitante;

        return placeholderId;
    }

    /* ---------- Procesar ---------- */

    const resumen = {
        creados: 0,
        completados: 0,
        sinCambios: 0,
        omitidos: 0,
        errores: 0,
        sinSolicitante: 0,
    };

    for (const e of equipos) {
        if (!e.hostname) {
            resumen.omitidos++;
            continue;
        }

        const etiqueta =
            `Fila ${e.fila} ${e.hostname}`;

        try {
            /* Solicitante por nombre */
            const candidatos =
                e.responsable
                    ? porNombre.get(normalizarNombre(e.responsable)) ?? []
                    : [];

            const solicitante =
                candidatos.length === 1
                    ? candidatos[0] ?? null
                    : null;

            if (!solicitante) {
                resumen.sinSolicitante++;
            }

            const textoSolicitante =
                solicitante
                    ? solicitante.nombre
                    : candidatos.length > 1
                        ? `${PLACEHOLDER_SOLICITANTE} («${e.responsable}» está ${candidatos.length} veces)`
                        : `${PLACEHOLDER_SOLICITANTE}${e.responsable ? ` («${e.responsable}» no existe)` : ""}`;

            /* ¿Ya existe? Serial primero, luego hostname en la empresa */
            const existente =
                (e.serial
                    ? await prisma.equipo.findFirst({
                        where: { serial: { equals: e.serial, mode: "insensitive" } },
                        include: { detalle: true },
                    })
                    : null) ??
                await prisma.equipo.findFirst({
                    where: {
                        hostname: { equals: e.hostname, mode: "insensitive" },
                        empresaId: EMPRESA_ID,
                        deletedAt: null,
                    },
                    include: { detalle: true },
                });

            const datosEquipo = {
                serial: e.serial,
                marca: e.marca,
                modelo: e.modelo,
                procesador: e.procesador,
                ram: e.ram,
                ramGb: e.ramGb,
                disco: e.disco,
                diskTotalGb: e.diskTotalGb,
                hostname: e.hostname,
                usuarioActual: e.usuarioActual,
                dominio: e.dominio,
                localIp: e.localIp,
                macAddress: e.macAddress,
                observaciones: e.observaciones,
            };

            const datosDetalle = {
                so: e.so,
                tipoDd: e.tipoDd,
                office: e.office,
                macWifi: e.macWifi,
                redEthernet: e.macEthernet,
                antivirusNombre: e.antivirusNombre,
            };

            /* ===== Existente: completar vacíos ===== */
            if (existente) {
                if (existente.empresaId !== null && existente.empresaId !== EMPRESA_ID) {
                    console.warn(`⚠ ${etiqueta}: el serial ${e.serial} ya está en otra empresa (id ${existente.empresaId}, equipo #${existente.id_equipo}). Se omite.`);
                    resumen.omitidos++;
                    continue;
                }

                const cambiosEquipo =
                    soloVacios(existente, datosEquipo);

                const cambiosDetalle =
                    soloVacios(existente.detalle ?? {}, datosDetalle);

                /* El tipo solo se corrige si quedó GENERICO */
                const corregirTipo =
                    existente.tipo === TipoEquipo.GENERICO &&
                    e.tipo !== TipoEquipo.GENERICO;

                const asignarSolicitante =
                    solicitante &&
                    existente.idSolicitante === null;

                const campos = [
                    ...Object.keys(cambiosEquipo),
                    ...Object.keys(cambiosDetalle),
                    ...(corregirTipo ? ["tipo"] : []),
                    ...(asignarSolicitante ? ["solicitante"] : []),
                ];

                if (campos.length === 0) {
                    console.log(`= ${etiqueta}: ya existe (#${existente.id_equipo}), sin cambios.`);
                    resumen.sinCambios++;
                    continue;
                }

                console.log(`~ ${etiqueta}: ya existe (#${existente.id_equipo}), se completan: ${campos.join(", ")}`);

                if (APLICAR) {
                    await prisma.equipo.update({
                        where: { id_equipo: existente.id_equipo },
                        data: {
                            ...cambiosEquipo,
                            ...(existente.empresaId === null ? { empresaId: EMPRESA_ID } : {}),
                            ...(corregirTipo ? { tipo: e.tipo } : {}),
                            ...(asignarSolicitante ? { idSolicitante: solicitante.id_solicitante } : {}),
                            ...(Object.keys(cambiosDetalle).length > 0
                                ? {
                                    detalle: {
                                        upsert: {
                                            create: datosDetalle,
                                            update: cambiosDetalle,
                                        },
                                    },
                                }
                                : {}),
                        },
                    });
                }

                resumen.completados++;
                continue;
            }

            /* ===== Nuevo ===== */
            const anio =
                calcularAnioPcDesdeSerial(e.serial, e.marca, e.modelo, e.procesador);

            const avisoSerial =
                !e.serial && e.serialOriginal
                    ? ` · serial genérico «${e.serialOriginal}» → sin serial`
                    : "";

            console.log(`+ ${etiqueta}: nuevo ${e.tipo} ${e.marca} ${e.modelo} · ${e.serial ?? "sin serial"} · ${textoSolicitante} · ${e.softwares.length} programas${avisoSerial}`);

            if (APLICAR) {
                const idSolicitante =
                    solicitante?.id_solicitante ??
                    await obtenerPlaceholder();

                const data: Prisma.EquipoUncheckedCreateInput = {
                    ...datosEquipo,
                    empresaId: EMPRESA_ID,
                    idSolicitante,
                    tipo: e.tipo,
                    propiedad: "Empresa",
                    anioPc: anio.anioPc,
                    anioPcOrigen: anio.anioPcOrigen,
                    detalle: {
                        create: datosDetalle,
                    },
                };

                const creado =
                    await prisma.equipo.create({
                        data,
                        select: { id_equipo: true },
                    });

                if (e.softwares.length > 0) {
                    await prisma.equipoSoftware.createMany({
                        data: e.softwares.map((nombre) => ({
                            equipoId: creado.id_equipo,
                            nombre,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            resumen.creados++;
        } catch (error) {
            resumen.errores++;
            console.error(`✖ ${etiqueta}:`, error instanceof Error ? error.message : error);
        }
    }

    console.log("\n================ RESUMEN ================");
    console.log(`Nuevos:             ${resumen.creados}`);
    console.log(`Completados:        ${resumen.completados}`);
    console.log(`Sin cambios:        ${resumen.sinCambios}`);
    console.log(`Omitidos:           ${resumen.omitidos}`);
    console.log(`Errores:            ${resumen.errores}`);
    console.log(`Sin solicitante:    ${resumen.sinSolicitante} (quedan en ${PLACEHOLDER_SOLICITANTE})`);
    console.log(APLICAR ? "\n✅ Cambios guardados." : "\nSimulación: no se escribió nada. Agrega --aplicar para guardar.");
}

main()
    .catch((error) => {
        console.error("[IMPORTAR EQUIPOS] ❌ Error general", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });