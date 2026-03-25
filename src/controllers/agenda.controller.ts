import type { Request, Response } from "express";
import { z } from "zod";
import { EstadoAgenda } from "@prisma/client";
import {
  generarMallaMensual,
  getAgendaMensual,
  getAgendaDesdeOutlook,
  sincronizarAgendaDesdeOutlook,
  getEmpresasAgenda,
  actualizarAgendaVisita,
  eliminarAgendaVisita,
  reasignarTecnicos,
  eliminarMallaMensual,
  crearAgendaVisitaManual,
  enviarNotaAgendaPorCorreo,
  AgendaConflictError,
  AgendaNotFoundError,
  AgendaPastDateError,
} from "../service/agenda.service.js";

/* ================== Schemas ================== */

const generarMallaSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  empresaIds: z.array(z.number().int().positive()).optional(),
  includeOficina: z.boolean().optional(),
});

const getAgendaSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  tecnico: z.string().optional(),
  empresa: z.string().optional(),
});

const updateVisitaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido, use YYYY-MM-DD").optional(),
  estado: z.nativeEnum(EstadoAgenda).optional(),
  notas: z.string().optional(),
  mensaje: z.string().optional(),
  horaInicio: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inicio inválida, use HH:mm")
    .optional(),
  horaFin: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora fin inválida, use HH:mm")
    .optional(),
  empresaId: z.number().nullable().optional(),
});

const reprogramarTecnicosSchema = z.object({
  nuevosTecnicoIds: z.array(z.number().int().positive()).min(1),
});

const eliminarMallaSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const crearVisitaManualSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido, use YYYY-MM-DD"),
  empresaId: z.number().int().positive().nullable(),
  tecnicoId: z.number().int().positive(),
  horaInicio: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inicio inválida, use HH:mm")
    .optional(),
  horaFin: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora fin inválida, use HH:mm")
    .optional(),
  mensaje: z.string().optional(),
  notas: z.string().optional(),
});

/* ================== Handlers ================== */

// POST /agenda/generar
export async function generarMalla(req: Request, res: Response) {
  try {
    const parsed = generarMallaSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", detalles: parsed.error.flatten() });
    }

    const { year, month, empresaIds, includeOficina } = parsed.data;
    const resultado = await generarMallaMensual(year, month, empresaIds, includeOficina);

    return res.status(201).json({
      mensaje: `Malla ${year}-${String(month).padStart(2, "0")} generada`,
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error al generar malla mensual:", err);
    return res.status(500).json({ error: "Error al generar malla mensual" });
  }
}

// GET /agenda/empresas
export async function listarEmpresasAgenda(req: Request, res: Response) {
  try {
    const empresas = await getEmpresasAgenda();
    return res.status(200).json(empresas);
  } catch (err: any) {
    console.error("Error al listar empresas de agenda:", err);
    return res.status(500).json({ error: "Error al listar empresas de agenda" });
  }
}

// GET /agenda
export async function getAgenda(req: Request, res: Response) {
  try {
    const parsed = getAgendaSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ error: "Parámetros inválidos (se esperan year y month)", detalles: parsed.error.flatten() });
    }

    const { year, month, tecnico, empresa } = parsed.data;
    const visitas = await getAgendaMensual(year, month, {
      ...(tecnico !== undefined && { tecnico }),
      ...(empresa !== undefined && { empresa }),
    });

    return res.status(200).json(visitas);
  } catch (err: any) {
    console.error("Error al obtener agenda mensual:", err);
    return res.status(500).json({ error: "Error al obtener agenda mensual" });
  }
}

export async function getAgendaDesdeOutlookController(req: Request, res: Response) {
  try {
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (Number.isNaN(year) || Number.isNaN(month)) {
      return res.status(400).json({ message: "Parámetros inválidos: year y month deben ser números válidos" });
    }

    const resultado = await getAgendaDesdeOutlook(year, month);
    return res.json(resultado);
  } catch (error) {
    console.error("[AGENDA OUTLOOK CONTROLLER ERROR]:", error);
    return res.status(500).json({ message: "Error obteniendo agenda desde Outlook" });
  }
}

export async function syncAgendaOutlook(req: Request, res: Response) {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({
        error: "year y month son requeridos"
      });
    }

    const resultado = await sincronizarAgendaDesdeOutlook(Number(year), Number(month));

    return res.json({
      message: "Sincronización completada",
      ...resultado
    });

  } catch (error) {
    console.error("[AGENDA SYNC CONTROLLER ERROR]", error);

    return res.status(500).json({
      error: "Error al sincronizar agenda con Outlook"
    });
  }
}

// PATCH /agenda/:id
export async function updateVisita(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsed = updateVisitaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", detalles: parsed.error.flatten() });
    }

    const { fecha, estado, notas, mensaje, horaInicio, horaFin, empresaId } = parsed.data;

    const actualizado = await actualizarAgendaVisita(id, {
      ...(fecha !== undefined && { fecha }),
      ...(estado !== undefined && { estado }),
      ...(notas !== undefined && { notas }),
      ...(mensaje  !==  undefined && { mensaje  }),
      ...(horaInicio !== undefined && { horaInicio }),
      ...(horaFin !== undefined && { horaFin }),
      ...(empresaId !== undefined && { empresaId }),
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    if (err instanceof AgendaConflictError || err instanceof AgendaPastDateError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("Error al actualizar visita de agenda:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Visita no encontrada" });
    return res.status(500).json({ error: "Error al actualizar visita de agenda" });
  }
}

// DELETE /agenda/:id
export async function eliminarVisita(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await eliminarAgendaVisita(id);
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar visita de agenda:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Visita no encontrada" });
    return res.status(500).json({ error: "Error al eliminar visita de agenda" });
  }
}

// DELETE /agenda/malla
export async function eliminarMalla(req: Request, res: Response) {
  try {
    const parsed = eliminarMallaSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", detalles: parsed.error.flatten() });
    }

    const { year, month } = parsed.data;
    const resultado = await eliminarMallaMensual(year, month);

    return res.status(200).json({
      mensaje: `Malla ${year}-${String(month).padStart(2, "0")} eliminada`,
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error al eliminar malla mensual:", err);
    return res.status(500).json({ error: "Error al eliminar malla mensual" });
  }
}

// POST /agenda/manual
export async function crearVisitaManual(req: Request, res: Response) {
  try {
    const parsed = crearVisitaManualSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", detalles: parsed.error.flatten() });
    }

    const visita = await crearAgendaVisitaManual(parsed.data);

    return res.status(201).json(visita);
  } catch (err: any) {
    if (err instanceof AgendaConflictError) return res.status(409).json({ error: err.message });
    console.error("Error al crear visita manual:", err);
    return res.status(500).json({ error: "Error al crear visita manual" });
  }
}

// PUT /agenda/:id/tecnicos
export async function reprogramarTecnicos(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsed = reprogramarTecnicosSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", detalles: parsed.error.flatten() });
    }

    await reasignarTecnicos(id, parsed.data.nuevosTecnicoIds);
    return res.status(200).json({ mensaje: "Técnicos reasignados correctamente" });
  } catch (err: any) {
    if (err instanceof AgendaConflictError || err instanceof AgendaPastDateError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("Error al reprogramar técnicos de la visita:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Visita no encontrada" });
    return res.status(500).json({ error: "Error al reprogramar técnicos de la visita" });
  }
}

// POST /agenda/:id/enviar-nota
export async function enviarNotaAgenda(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalido" });

    const enviados = await enviarNotaAgendaPorCorreo(id);

    return res.status(200).json({
      ok: true,
      enviados,
    });
  } catch (err: any) {
    if (err instanceof AgendaNotFoundError) {
      return res.status(404).json({ error: err.message });
    }

    console.error("Error al enviar nota de agenda por correo:", err);
    return res.status(500).json({ error: "Error al enviar nota de agenda por correo" });
  }
}
