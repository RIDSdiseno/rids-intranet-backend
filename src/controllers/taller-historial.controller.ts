// src/controllers/taller-historial.controller.ts
//
// Historial de una orden de taller (ENTRADA + SALIDA del mismo ordenGrupoId).
// Combina:
// - AuditLog de DetalleTrabajoGestioo (lo registra la extensión de prisma.ts);
// - hitos reconstruidos desde la propia orden (ingreso, firma, salida), para
//   órdenes antiguas que no tienen auditoría.

import type { Request, Response } from "express";

import { prismaBase as prisma } from "../lib/prisma.js";

const ENTIDAD_AUDIT = "DetalleTrabajoGestioo";

/** Campos que se muestran en el historial (el resto son técnicos y se ocultan). */
const CAMPOS: Record<string, string> = {
    area: "Área",
    estado: "Estado",
    prioridad: "Prioridad",
    tipoTrabajo: "Tipo de trabajo",
    descripcion: "Descripción",
    notas: "Notas",
    tecnicoId: "Técnico",
    entidadId: "Cliente",
    equipoId: "Equipo",
    productoId: "Producto",
    servicioId: "Servicio",
    incluyeCargador: "Incluye cargador",
    destinoEquipo: "Destino del equipo",
    destinoEquipoNota: "Nota de destino",
    numeroOrden: "N° de orden",
    cotizacionId: "Cotización",
};

const DESTINOS: Record<string, string> = {
    SIN_DEFINIR: "Sin definir",
    VENTA: "Venta",
    RIDS: "RIDS",
    CLIENTE: "Devuelto al cliente",
    BAJA: "Baja",
    VENTA_EMPRESA: "Venta a empresa",
};

type Valor = string | number | boolean | null;

type CambioHistorial = {
    campo: string;
    label: string;
    antes: Valor;
    despues: Valor;
};

type ItemHistorial = {
    id: string;
    tipo: "CREACION" | "CAMBIO" | "ELIMINACION" | "INGRESO" | "FIRMA" | "SALIDA";
    titulo: string;
    descripcion: string | null;
    actor: string | null;
    fecha: Date;
    registroId: number;
    area: string | null;
    cambios: CambioHistorial[];
    /** true = reconstruido desde la orden, no viene de la auditoría */
    reconstruido: boolean;
};

function esPrimitivo(v: unknown): v is Valor {
    return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function idsDe(
    logs: Array<{ changes: unknown }>,
    campo: string,
): number[] {
    const ids = new Set<number>();

    for (const log of logs) {
        const c = log.changes as Record<string, any> | null;
        const v = c?.[campo];

        for (const x of [v?.before, v?.after, typeof v === "number" ? v : null]) {
            if (typeof x === "number") ids.add(x);
        }
    }

    return [...ids];
}

export async function getHistorialOrdenTaller(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }

        const base = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id },
            select: { id: true, ordenGrupoId: true },
        });

        if (!base) {
            return res.status(404).json({ error: "Orden no encontrada" });
        }

        const grupoId = base.ordenGrupoId ?? base.id;

        /* Todos los registros de la orden (ENTRADA y SALIDA) */
        const registros = await prisma.detalleTrabajoGestioo.findMany({
            where: {
                OR: [{ id: grupoId }, { ordenGrupoId: grupoId }, { id }],
            },
            select: {
                id: true,
                area: true,
                fecha: true,
                fechaIngreso: true,
                numeroOrden: true,
                destinoEquipo: true,
                destinoEquipoNota: true,
                firmaEntradaAt: true,
                nombreFirmanteEntrada: true,
                tecnico: { select: { nombre: true } },
            },
        });

        const ids = registros.map((r) => r.id);
        const areaPorId = new Map(registros.map((r) => [r.id, r.area as string]));

        const logs = await prisma.auditLog.findMany({
            where: {
                entity: ENTIDAD_AUDIT,
                entityId: { in: ids.map(String) },
            },
            include: {
                actor: { select: { nombre: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 300,
        });

        /* ---------- Nombres para los IDs que aparecen en los cambios ---------- */

        const [tecnicos, entidades, equipos, productos, servicios] = await Promise.all([
            prisma.tecnico.findMany({
                where: { id_tecnico: { in: idsDe(logs, "tecnicoId") } },
                select: { id_tecnico: true, nombre: true },
            }),
            prisma.entidadGestioo.findMany({
                where: { id: { in: idsDe(logs, "entidadId") } },
                select: { id: true, nombre: true },
            }),
            prisma.equipo.findMany({
                where: { id_equipo: { in: idsDe(logs, "equipoId") } },
                select: { id_equipo: true, marca: true, modelo: true, serial: true },
            }),
            prisma.productoGestioo.findMany({
                where: { id: { in: idsDe(logs, "productoId") } },
                select: { id: true, nombre: true },
            }),
            prisma.servicioGestioo.findMany({
                where: { id: { in: idsDe(logs, "servicioId") } },
                select: { id: true, nombre: true },
            }),
        ]);

        const nombres: Record<string, Map<number, string>> = {
            tecnicoId: new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre])),
            entidadId: new Map(entidades.map((e) => [e.id, e.nombre])),
            equipoId: new Map(
                equipos.map((e) => [
                    e.id_equipo,
                    `${e.marca} ${e.modelo}${e.serial ? ` (${e.serial})` : ""}`,
                ]),
            ),
            productoId: new Map(productos.map((p) => [p.id, p.nombre])),
            servicioId: new Map(servicios.map((s) => [s.id, s.nombre])),
        };

        const mostrar = (campo: string, v: Valor): Valor => {
            if (v === null) return null;

            const mapa = nombres[campo];
            if (mapa && typeof v === "number") return mapa.get(v) ?? `#${v}`;

            if (campo === "destinoEquipo" && typeof v === "string") return DESTINOS[v] ?? v;
            if (campo === "cotizacionId" && typeof v === "number") return `#${v}`;
            if (typeof v === "boolean") return v ? "Sí" : "No";

            return v;
        };

        /* ---------- Items desde la auditoría ---------- */

        const items: ItemHistorial[] = [];
        let tieneCreacion = false;

        for (const log of logs) {
            const registroId = Number(log.entityId);
            const area = areaPorId.get(registroId) ?? null;
            const changes = (log.changes ?? {}) as Record<string, any>;
            const actor = log.actor?.nombre ?? null;

            if (log.action === "CREATE") {
                tieneCreacion = true;

                items.push({
                    id: `audit-${log.id}`,
                    tipo: "CREACION",
                    titulo: changes.area === "SALIDA" ? "Salida registrada" : "Orden creada",
                    descripcion: [
                        changes.tipoTrabajo ? `Tipo: ${changes.tipoTrabajo}` : null,
                        changes.estado ? `Estado: ${changes.estado}` : null,
                        typeof changes.tecnicoId === "number"
                            ? `Técnico: ${mostrar("tecnicoId", changes.tecnicoId)}`
                            : null,
                        changes.destinoEquipo && changes.area === "SALIDA"
                            ? `Destino: ${mostrar("destinoEquipo", changes.destinoEquipo)}`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(" · ") || null,
                    actor,
                    fecha: log.createdAt,
                    registroId,
                    area: (changes.area as string | undefined) ?? area,
                    cambios: [],
                    reconstruido: false,
                });
                continue;
            }

            if (log.action === "DELETE") {
                items.push({
                    id: `audit-${log.id}`,
                    tipo: "ELIMINACION",
                    titulo: `Registro de ${changes.area ?? "orden"} eliminado`,
                    descripcion: null,
                    actor,
                    fecha: log.createdAt,
                    registroId,
                    area: (changes.area as string | undefined) ?? area,
                    cambios: [],
                    reconstruido: false,
                });
                continue;
            }

            /* UPDATE: solo campos visibles que realmente cambiaron */
            const cambios: CambioHistorial[] = [];

            for (const [campo, v] of Object.entries(changes)) {
                const label = CAMPOS[campo];

                if (!label || !v || typeof v !== "object") continue;

                const antes = esPrimitivo(v.before) ? v.before : null;
                const despues = esPrimitivo(v.after) ? v.after : null;

                if (antes === despues) continue;

                /* Justo después de crear, la auditoría no ve el valor previo (null) */
                if (antes === null && despues === null) continue;

                cambios.push({
                    campo,
                    label,
                    antes: mostrar(campo, antes),
                    despues: mostrar(campo, despues),
                });
            }

            if (cambios.length === 0) continue;

            items.push({
                id: `audit-${log.id}`,
                tipo: "CAMBIO",
                titulo:
                    cambios.length === 1
                        ? `${cambios[0]?.label} modificado`
                        : `${cambios.length} campos modificados`,
                descripcion: null,
                actor,
                fecha: log.createdAt,
                registroId,
                area,
                cambios,
                reconstruido: false,
            });
        }

        /*
         * Cambios registrados justo después de crear la orden: la auditoría
         * los ve con antes = null, lo que duplica la creación. Se descartan
         * los CAMBIO que caen dentro de 5 s de una CREACION del mismo registro
         * y que no tienen ningún valor previo.
         */
        const creaciones = items.filter((i) => i.tipo === "CREACION");

        const depurados = items.filter(
            (i) =>
                !(
                    i.tipo === "CAMBIO" &&
                    i.cambios.every((c) => c.antes === null) &&
                    creaciones.some(
                        (c) =>
                            c.registroId === i.registroId &&
                            Math.abs(c.fecha.getTime() - i.fecha.getTime()) < 5000,
                    )
                ),
        );

        /* ---------- Hitos reconstruidos (órdenes sin auditoría) ---------- */

        if (!tieneCreacion) {
            for (const r of registros) {
                if (r.area === "SALIDA") {
                    depurados.push({
                        id: `orden-salida-${r.id}`,
                        tipo: "SALIDA",
                        titulo: "Salida registrada",
                        descripcion: [
                            `Destino: ${DESTINOS[r.destinoEquipo] ?? r.destinoEquipo}`,
                            r.destinoEquipoNota,
                        ]
                            .filter(Boolean)
                            .join(" · "),
                        actor: r.tecnico?.nombre ?? null,
                        fecha: r.fecha,
                        registroId: r.id,
                        area: r.area,
                        cambios: [],
                        reconstruido: true,
                    });
                } else {
                    depurados.push({
                        id: `orden-ingreso-${r.id}`,
                        tipo: "INGRESO",
                        titulo: `Ingreso al taller${r.numeroOrden ? ` · ${r.numeroOrden}` : ""}`,
                        descripcion: null,
                        actor: r.tecnico?.nombre ?? null,
                        fecha: r.fechaIngreso ?? r.fecha,
                        registroId: r.id,
                        area: r.area,
                        cambios: [],
                        reconstruido: true,
                    });
                }
            }
        }

        /* La firma no pasa por un update auditable con fecha: se agrega siempre */
        for (const r of registros) {
            if (r.firmaEntradaAt) {
                depurados.push({
                    id: `orden-firma-${r.id}`,
                    tipo: "FIRMA",
                    titulo: "Entrada firmada por el cliente",
                    descripcion: r.nombreFirmanteEntrada ?? null,
                    actor: null,
                    fecha: r.firmaEntradaAt,
                    registroId: r.id,
                    area: r.area,
                    cambios: [],
                    reconstruido: true,
                });
            }
        }

        depurados.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

        return res.json({
            ordenGrupoId: grupoId,
            total: depurados.length,
            items: depurados,
        });
    } catch (error) {
        console.error("❌ Error al obtener historial de la orden:", error);
        return res.status(500).json({ error: "Error al obtener historial de la orden" });
    }
}