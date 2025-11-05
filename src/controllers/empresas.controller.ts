// src/controllers/empresas.controller.ts
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { EstadoVisita } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/* =======================================================
   GET /api/empresas  (rápido por defecto)
   Query flags:
     - withStats=1  → incluye estadísticas agregadas
     - full=1       → payload completo (pesado)
   ======================================================= */
export async function getEmpresas(req: Request, res: Response): Promise<void> {
  try {
    const withStats = String(req.query.withStats ?? "").toLowerCase() === "1";
    const full = String(req.query.full ?? "").toLowerCase() === "1";

    if (full) {
      // Versión completa: trae árbol y calcula stats en memoria
      const empresas = await prisma.empresa.findMany({
        select: {
          id_empresa: true,
          nombre: true,
          solicitantes: {
            select: {
              id_solicitante: true,
              nombre: true,
              email: true,
              equipos: { select: { id_equipo: true } },
            },
          },
          tickets: { select: { id: true, status: true } },
          visitas: { select: { id_visita: true, status: true } },
          detalleEmpresa: true,
          detalleTrabajos: { select: { id: true, estado: true } },
        },
        orderBy: { nombre: "asc" },
      });

      const data = empresas.map((empresa) => {
        const totalSolicitantes = empresa.solicitantes.length;
        const totalEquipos = empresa.solicitantes.reduce(
          (acc, s) => acc + (s.equipos?.length || 0),
          0
        );
        const totalTickets = empresa.tickets.length;
        const totalVisitas = empresa.visitas.length;
        const totalTrabajos = empresa.detalleTrabajos.length;

        const ticketsAbiertos = empresa.tickets.filter((t) => t.status !== 5).length;
        const visitasPendientes = empresa.visitas.filter(
          (v) => v.status === EstadoVisita.PENDIENTE
        ).length;
        const trabajosPendientes = empresa.detalleTrabajos.filter(
          (t) => (t.estado ?? "").toUpperCase() === "PENDIENTE"
        ).length;

        return {
          id_empresa: empresa.id_empresa,
          nombre: empresa.nombre,
          detalleEmpresa: empresa.detalleEmpresa,
          solicitantes: empresa.solicitantes,
          estadisticas: {
            totalSolicitantes,
            totalEquipos,
            totalTickets,
            totalVisitas,
            totalTrabajos,
            ticketsAbiertos,
            visitasPendientes,
            trabajosPendientes,
          },
        };
      });

      res.json({ success: true, data, total: data.length });
      return;
    }

    // Versión rápida por defecto: solo id + nombre
    const empresas = await prisma.empresa.findMany({
      select: { id_empresa: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    if (!withStats) {
      res.json({ success: true, data: empresas, total: empresas.length });
      return;
    }

    // Con estadísticas (consultas agregadas sin traer árbol completo)
    const empresaIds = empresas.map((e) => e.id_empresa);

    // 1) Solicitantes por empresa
    const solCount = await prisma.solicitante.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresaIds } },
      _count: { empresaId: true },
    });

    // 2) Tickets abiertos por empresa (status != 5)
    const ticketsOpen = await prisma.freshdeskTicket.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresaIds }, status: { not: 5 } },
      _count: { empresaId: true },
    });

    // 3) Visitas pendientes por empresa
    const visitasPend = await prisma.visita.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresaIds }, status: EstadoVisita.PENDIENTE },
      _count: { empresaId: true },
    });

    // 4) Trabajos pendientes por empresa (estado = 'PENDIENTE', case-insensitive)
    const trabajosPend = await prisma.detalleTrabajo.groupBy({
      by: ["empresa_id"],
      where: {
        empresa_id: { in: empresaIds },
        estado: { equals: "PENDIENTE", mode: "insensitive" as Prisma.QueryMode },
      },
      _count: { empresa_id: true },
    });

    // 5) Equipos por empresa:
    //    No se puede groupBy directamente por empresaId desde Equipo;
    //    hacemos dos pasos: contamos equipos por solicitante, luego sumamos por empresa.
    const equiposCountPorSolic = await prisma.equipo.groupBy({
      by: ["idSolicitante"],
      _count: { _all: true },
      where: { solicitante: { empresaId: { in: empresaIds } } },
    });

    const solicitantesDeEmp = await prisma.solicitante.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id_solicitante: true, empresaId: true },
    });
    const empresaPorSolic = new Map(solicitantesDeEmp.map((s) => [s.id_solicitante, s.empresaId]));
    const equiposPorEmpresa = new Map<number, number>();
    for (const row of equiposCountPorSolic) {
      const empId = empresaPorSolic.get(row.idSolicitante!);
      if (!empId) continue;
      equiposPorEmpresa.set(empId, (equiposPorEmpresa.get(empId) ?? 0) + row._count._all);
    }

    const solMap = new Map(solCount.map((r) => [r.empresaId!, r._count.empresaId]));
    const ticketOpenMap = new Map(ticketsOpen.map((r) => [r.empresaId!, r._count.empresaId]));
    const visitaPendMap = new Map(visitasPend.map((r) => [r.empresaId!, r._count.empresaId]));
    const trabajoPendMap = new Map(trabajosPend.map((r) => [r.empresa_id!, r._count.empresa_id]));

    const data = empresas.map((e) => ({
      id_empresa: e.id_empresa,
      nombre: e.nombre,
      estadisticas: {
        totalSolicitantes: solMap.get(e.id_empresa) ?? 0,
        totalEquipos: equiposPorEmpresa.get(e.id_empresa) ?? 0,
        // Totales globales (tickets/visitas/trabajos) no pedidos aquí:
        totalTickets: undefined,
        totalVisitas: undefined,
        totalTrabajos: undefined,
        ticketsAbiertos: ticketOpenMap.get(e.id_empresa) ?? 0,
        visitasPendientes: visitaPendMap.get(e.id_empresa) ?? 0,
        trabajosPendientes: trabajoPendMap.get(e.id_empresa) ?? 0,
      },
    }));

    res.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error("Error al obtener empresas:", error);
    res.status(500).json({ success: true, error: "Error interno del servidor" });
  }
}

/* =======================================================
   GET /api/empresas/stats  (agregado total del sistema)
   ======================================================= */
export async function getEmpresasStats(_req: Request, res: Response): Promise<void> {
  try {
    const [empresas, solicitantes, equipos, tickets, visitas, trabajos] = await Promise.all([
      prisma.empresa.count(),
      prisma.solicitante.count(),
      prisma.equipo.count(),
      prisma.freshdeskTicket.count(),
      prisma.visita.count(),
      prisma.detalleTrabajo.count(),
    ]);

    const ticketsAbiertos = await prisma.freshdeskTicket.count({ where: { status: { not: 5 } } });
    const visitasPendientes = await prisma.visita.count({ where: { status: EstadoVisita.PENDIENTE } });
    const trabajosPendientes = await prisma.detalleTrabajo.count({
      where: { estado: { equals: "PENDIENTE", mode: "insensitive" as Prisma.QueryMode } },
    });

    res.json({
      success: true,
      data: {
        totalEmpresas: empresas,
        totalSolicitantes: solicitantes,
        totalEquipos: equipos,
        totalTickets: tickets,
        totalVisitas: visitas,
        totalTrabajos: trabajos,
        ticketsAbiertos,
        visitasPendientes,
        trabajosPendientes,
      },
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
}

/* =======================================================
   GET /api/empresas/:id - OPTIMIZADO (FIX duplicados)
   ======================================================= */
export async function getEmpresaById(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    const empresa = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      select: {
        id_empresa: true,
        nombre: true,
        detalleEmpresa: true, // ← solo una vez
        companyMaps: {        // ← solo una vez
          select: {
            companyId: true,
            domain: true,
          },
        },
        // ✅ SOLICITANTES con datos relacionados
        solicitantes: {
          include: {
            equipos: { include: { equipo: true } }, // DetalleEquipo[] (ajusta según tu esquema)
            tickets: true,
            visitas: true,
          },
        },
        tickets: true,
        visitas: { include: { tecnico: true, solicitanteRef: true } },
        detalleTrabajos: { include: { equipo: true, tecnico: true } },
      },
    });

    if (!empresa) {
      res.status(404).json({ success: false, error: "Empresa no encontrada" });
      return;
    }

    res.json({ success: true, data: empresa });
  } catch (error) {
    console.error("Error al obtener empresa:", error);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
}



/* =======================================================
   POST /api/empresas - OPTIMIZADO
   ======================================================= */
export async function createEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const { nombre, rut, direccion, telefono, email } = req.body;

    if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
      res.status(400).json({
        success: false,
        error:
          "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
      });
      return;
    }

    const data: Prisma.EmpresaCreateInput = {
      nombre,
      ...(rut && direccion && telefono && email
        ? { detalleEmpresa: { create: { rut, direccion, telefono, email } } }
        : {}),
    };

    const nuevaEmpresa = await prisma.empresa.create({
      data,
      include: { detalleEmpresa: true, solicitantes: true, tickets: true, visitas: true },
    });

    res.status(201).json({ success: true, data: nuevaEmpresa });
  } catch (error: any) {
    console.error("Error al crear empresa:", error);
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      const errorMessage = field === "nombre" ? "El nombre de la empresa ya existe" : "El RUT de la empresa ya existe";
      res.status(400).json({ success: false, error: errorMessage });
      return;
    }
    res.status(500).json({ success: false, error: "Error al crear empresa" });
  }
}

/* =======================================================
   PUT /api/empresas/:id - OPTIMIZADO
   ======================================================= */
export async function updateEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { nombre, rut, direccion, telefono, email } = req.body;

    if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
      res.status(400).json({
        success: false,
        error:
          "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
      });
      return;
    }

    const empresaExistente = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      include: { detalleEmpresa: true },
    });

    if (!empresaExistente) {
      res.status(404).json({ success: false, error: "Empresa no encontrada" });
      return;
    }

    const data: Prisma.EmpresaUpdateInput = {
      ...(typeof nombre === "string" ? { nombre } : {}),
      ...(rut && direccion && telefono && email
        ? empresaExistente.detalleEmpresa
          ? { detalleEmpresa: { update: { rut, direccion, telefono, email } } }
          : { detalleEmpresa: { create: { rut, direccion, telefono, email } } }
        : {}),
    };

    const empresaActualizada = await prisma.empresa.update({
      where: { id_empresa: id },
      data,
      include: { detalleEmpresa: true, solicitantes: true },
    });

    res.json({ success: true, data: empresaActualizada });
  } catch (error: any) {
    console.error("Error al actualizar empresa:", error);
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      const errorMessage = field === "nombre" ? "El nombre de la empresa ya existe" : "El RUT de la empresa ya existe";
      res.status(400).json({ success: false, error: errorMessage });
      return;
    }
    res.status(500).json({ success: false, error: "Error al actualizar empresa" });
  }
}

/* =======================================================
   DELETE /api/empresas/:id - OPTIMIZADO
   ======================================================= */
export async function deleteEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    const empresaExistente = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      include: { solicitantes: true, tickets: true, visitas: true, detalleTrabajos: true },
    });

    if (!empresaExistente) {
      res.status(404).json({ success: false, error: "Empresa no encontrada" });
      return;
    }

    if (
      empresaExistente.solicitantes.length > 0 ||
      empresaExistente.tickets.length > 0 ||
      empresaExistente.visitas.length > 0 ||
      empresaExistente.detalleTrabajos.length > 0
    ) {
      res.status(400).json({
        success: false,
        error:
          "No se puede eliminar la empresa porque tiene registros relacionados (solicitantes, tickets, visitas o trabajos)",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const detalle = await tx.detalleEmpresa.findUnique({ where: { empresa_id: id } });
      if (detalle) {
        await tx.detalleEmpresa.delete({ where: { empresa_id: id } });
      }
      await tx.empresa.delete({ where: { id_empresa: id } });
    });

    res.json({ success: true, message: "Empresa eliminada correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar empresa:", error);
    if (error.code === "P2003") {
      res.status(400).json({
        success: false,
        error: "No se puede eliminar la empresa porque tiene registros relacionados",
      });
      return;
    }
    res.status(500).json({ success: false, error: "Error al eliminar empresa" });
  }
}
