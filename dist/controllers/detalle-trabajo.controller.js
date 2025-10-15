import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const detalleTrabajoSchema = z.object({
    fecha_ingreso: z.string().datetime(),
    fecha_egreso: z.string().datetime().optional().nullable(),
    trabajo: z.string(),
    accesorios: z.string().optional().nullable(),
    prioridad: z.enum(["baja", "normal", "alta"]),
    estado: z.string(),
    notas: z.string().optional().nullable(),
    empresa_id: z.number(),
    equipo_id: z.number(),
    tecnico_id: z.number()
});
const detalleTrabajoUpdateSchema = detalleTrabajoSchema.partial();
/* ================== CRUD Básico ================== */
// CREATE - Crea nuevo trabajo
export async function createDetalleTrabajo(req, res) {
    try {
        const data = detalleTrabajoSchema.parse(req.body);
        const nuevo = await prisma.detalleTrabajo.create({
            data: {
                fecha_ingreso: new Date(data.fecha_ingreso),
                fecha_egreso: data.fecha_egreso ? new Date(data.fecha_egreso) : null,
                trabajo: data.trabajo,
                accesorios: data.accesorios ?? null,
                prioridad: data.prioridad,
                estado: data.estado,
                notas: data.notas ?? null,
                empresa_id: data.empresa_id,
                equipo_id: data.equipo_id,
                tecnico_id: data.tecnico_id
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                telefono: true,
                                email: true
                            }
                        }
                    }
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true
                    }
                },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true
                    }
                }
            }
        });
        return res.status(201).json(nuevo);
    }
    catch (err) {
        console.error("Error al crear detalle trabajo:", err);
        if (err.code === "P2003") {
            return res.status(400).json({ error: "Empresa, equipo o técnico no existen" });
        }
        return res.status(500).json({ error: "Error al crear detalle trabajo" });
    }
}
// READ ALL - Obtiene todos los trabajos con relaciones
export async function getDetallesTrabajo(req, res) {
    try {
        const detalles = await prisma.detalleTrabajo.findMany({
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                telefono: true,
                                email: true
                            }
                        }
                    }
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true
                    }
                },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true
                    }
                }
            },
            orderBy: { id: "asc" }
        });
        return res.status(200).json(detalles);
    }
    catch (err) {
        console.error("Error al obtener detalles trabajo:", err);
        return res.status(500).json({ error: "Error al obtener detalles trabajo" });
    }
}
// READ ONE BY ID - Obtiene un trabajo específico
export async function getDetalleTrabajoById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const detalle = await prisma.detalleTrabajo.findUnique({
            where: { id },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                telefono: true,
                                email: true
                            }
                        }
                    }
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true
                    }
                },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true
                    }
                }
            }
        });
        if (!detalle)
            return res.status(404).json({ error: "Detalle trabajo no encontrado" });
        return res.status(200).json(detalle);
    }
    catch (err) {
        console.error("Error al obtener detalle trabajo:", err);
        return res.status(500).json({ error: "Error al obtener detalle trabajo" });
    }
}
// UPDATE - Actualiza un trabajo existente
export async function updateDetalleTrabajo(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const parsedData = detalleTrabajoUpdateSchema.parse(req.body);
        const data = {};
        if (parsedData.fecha_ingreso !== undefined) {
            data.fecha_ingreso = new Date(parsedData.fecha_ingreso);
        }
        if (parsedData.fecha_egreso !== undefined) {
            data.fecha_egreso = parsedData.fecha_egreso ? new Date(parsedData.fecha_egreso) : null;
        }
        if (parsedData.trabajo !== undefined)
            data.trabajo = parsedData.trabajo;
        if (parsedData.accesorios !== undefined)
            data.accesorios = parsedData.accesorios ?? null;
        if (parsedData.prioridad !== undefined)
            data.prioridad = parsedData.prioridad;
        if (parsedData.estado !== undefined)
            data.estado = parsedData.estado;
        if (parsedData.notas !== undefined)
            data.notas = parsedData.notas ?? null;
        if (parsedData.empresa_id !== undefined)
            data.empresa_id = parsedData.empresa_id;
        if (parsedData.equipo_id !== undefined)
            data.equipo_id = parsedData.equipo_id;
        if (parsedData.tecnico_id !== undefined)
            data.tecnico_id = parsedData.tecnico_id;
        const actualizado = await prisma.detalleTrabajo.update({
            where: { id },
            data,
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                        detalleEmpresa: {
                            select: {
                                telefono: true,
                                email: true
                            }
                        }
                    }
                },
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true
                    }
                },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true
                    }
                }
            }
        });
        return res.status(200).json(actualizado);
    }
    catch (err) {
        console.error("Error al actualizar detalle trabajo:", err);
        if (err.code === "P2025")
            return res.status(404).json({ error: "Detalle trabajo no encontrado" });
        return res.status(500).json({ error: "Error al actualizar detalle trabajo" });
    }
}
// DELETE - Elimina un trabajo
export async function deleteDetalleTrabajo(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        await prisma.detalleTrabajo.delete({ where: { id } });
        return res.status(204).send();
    }
    catch (err) {
        console.error("Error al eliminar detalle trabajo:", err);
        if (err.code === "P2025")
            return res.status(404).json({ error: "Detalle trabajo no encontrado" });
        return res.status(500).json({ error: "Error al eliminar detalle trabajo" });
    }
}
//# sourceMappingURL=detalle-trabajo.controller.js.map