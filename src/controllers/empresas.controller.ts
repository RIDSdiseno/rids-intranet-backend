// src/controllers/empresas.controller.ts
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =======================================================
   GET /api/empresas
   ======================================================= */
export async function getEmpresas(req: Request, res: Response): Promise<void> {
  try {
    const empresas = await prisma.empresa.findMany({
      select: {
        id_empresa: true,
        nombre: true,
        solicitantes: {
          select: {
            id_solicitante: true,
            nombre: true,
            email: true,
            equipos: {
              select: {
                id_equipo: true
              }
            },
          },
        },
        tickets: {
          select: {
            id: true,
            status: true
          }
        },
        visitas: {
          select: {
            id_visita: true,
            status: true
          }
        },
        detalleEmpresa: true,
        detalleTrabajos: {
          select: {
            id: true,
            estado: true
          }
        }
      },
      orderBy: { nombre: "asc" },
    });

    const empresasConStats = empresas.map((empresa) => {
      const totalSolicitantes = empresa.solicitantes.length;
      const totalEquipos = empresa.solicitantes.reduce(
        (acc, sol) => acc + (sol.equipos?.length || 0),
        0
      );
      const totalTickets = empresa.tickets.length;
      const totalVisitas = empresa.visitas.length;
      const totalTrabajos = empresa.detalleTrabajos.length;

      // Tickets abiertos (status diferente de 5 = cerrado)
      const ticketsAbiertos = empresa.tickets.filter(
        (t) => t.status !== 5
      ).length;

      // Visitas pendientes
      const visitasPendientes = empresa.visitas.filter(
        (v) => v.status === "PENDIENTE"
      ).length;

      // Trabajos pendientes
      const trabajosPendientes = empresa.detalleTrabajos.filter(
        (t) => t.estado === "pendiente" || t.estado === "PENDIENTE"
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

    res.json({
      success: true,
      data: empresasConStats,
      total: empresasConStats.length
    });
  } catch (error) {
    console.error("Error al obtener empresas:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

/* =======================================================
   GET /api/empresas/stats
   ======================================================= */
export async function getEmpresasStats(req: Request, res: Response): Promise<void> {
  try {
    const empresas = await prisma.empresa.findMany({
      include: {
        solicitantes: {
          include: {
            equipos: true
          }
        },
        tickets: true,
        visitas: true,
        detalleTrabajos: true,
      },
    });

    const statsTotales = empresas.reduce(
      (acc, empresa) => {
        const equiposEmpresa = empresa.solicitantes.reduce(
          (sum, sol) => sum + (sol.equipos?.length || 0),
          0
        );

        const ticketsAbiertosEmpresa = empresa.tickets.filter(
          (t) => t.status !== 5
        ).length;

        const visitasPendientesEmpresa = empresa.visitas.filter(
          (v) => v.status === "PENDIENTE"
        ).length;

        const trabajosPendientesEmpresa = empresa.detalleTrabajos.filter(
          (t) => t.estado === "pendiente" || t.estado === "PENDIENTE"
        ).length;

        return {
          totalEmpresas: acc.totalEmpresas + 1,
          totalSolicitantes: acc.totalSolicitantes + empresa.solicitantes.length,
          totalEquipos: acc.totalEquipos + equiposEmpresa,
          totalTickets: acc.totalTickets + empresa.tickets.length,
          totalVisitas: acc.totalVisitas + empresa.visitas.length,
          totalTrabajos: acc.totalTrabajos + empresa.detalleTrabajos.length,
          ticketsAbiertos: acc.ticketsAbiertos + ticketsAbiertosEmpresa,
          visitasPendientes: acc.visitasPendientes + visitasPendientesEmpresa,
          trabajosPendientes: acc.trabajosPendientes + trabajosPendientesEmpresa,
        };
      },
      {
        totalEmpresas: 0,
        totalSolicitantes: 0,
        totalEquipos: 0,
        totalTickets: 0,
        totalVisitas: 0,
        totalTrabajos: 0,
        ticketsAbiertos: 0,
        visitasPendientes: 0,
        trabajosPendientes: 0,
      }
    );

    res.json({
      success: true,
      data: statsTotales
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

/* =======================================================
   GET /api/empresas/:id
   ======================================================= */
export async function getEmpresaById(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    const empresa = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      include: {
        solicitantes: {
          include: {
            equipos: {
              include: {
                equipo: true // DetalleEquipo
              }
            },
            tickets: true,
            visitas: true
          }
        },
        tickets: true,
        visitas: {
          include: {
            tecnico: true,
            solicitanteRef: true
          }
        },
        detalleEmpresa: true,
        detalleTrabajos: {
          include: {
            equipo: true,
            tecnico: true
          }
        },
        companyMaps: true
      }
    });

    if (!empresa) {
      res.status(404).json({
        success: false,
        error: "Empresa no encontrada"
      });
      return;
    }

    res.json({
      success: true,
      data: empresa
    });
  } catch (error) {
    console.error("Error al obtener empresa:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

/* =======================================================
   POST /api/empresas
   ======================================================= */
export async function createEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const { nombre, rut, direccion, telefono, email } = req.body;

    // Validar campos obligatorios para DetalleEmpresa si se proporcionan
    if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
      res.status(400).json({
        success: false,
        error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios"
      });
      return;
    }

    const data: any = {
      nombre,
    };

    // Si se proporcionan todos los campos del detalle, crear DetalleEmpresa
    if (rut && direccion && telefono && email) {
      data.detalleEmpresa = {
        create: {
          rut,
          direccion,
          telefono,
          email
        },
      };
    }

    const nuevaEmpresa = await prisma.empresa.create({
      data,
      include: {
        detalleEmpresa: true,
        solicitantes: true,
        tickets: true,
        visitas: true
      },
    });

    res.status(201).json({
      success: true,
      data: nuevaEmpresa
    });
  } catch (error: any) {
    console.error("Error al crear empresa:", error);

    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      const errorMessage = field === "nombre"
        ? "El nombre de la empresa ya existe"
        : "El RUT de la empresa ya existe";

      res.status(400).json({
        success: false,
        error: errorMessage
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Error al crear empresa"
    });
  }
}

/* =======================================================
   PUT /api/empresas/:id
   ======================================================= */
export async function updateEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { nombre, rut, direccion, telefono, email } = req.body;

    // Validar campos obligatorios para DetalleEmpresa si se proporcionan
    if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
      res.status(400).json({
        success: false,
        error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios"
      });
      return;
    }

    const empresaExistente = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      include: {
        detalleEmpresa: true
      },
    });

    if (!empresaExistente) {
      res.status(404).json({
        success: false,
        error: "Empresa no encontrada"
      });
      return;
    }

    const data: any = {
      nombre,
    };

    // Manejar DetalleEmpresa
    if (rut && direccion && telefono && email) {
      if (empresaExistente.detalleEmpresa) {
        // Actualizar detalle existente
        data.detalleEmpresa = {
          update: {
            rut,
            direccion,
            telefono,
            email
          },
        };
      } else {
        // Crear nuevo detalle
        data.detalleEmpresa = {
          create: {
            rut,
            direccion,
            telefono,
            email
          },
        };
      }
    }

    const empresaActualizada = await prisma.empresa.update({
      where: { id_empresa: id },
      data,
      include: {
        detalleEmpresa: true,
        solicitantes: true
      },
    });

    res.json({
      success: true,
      data: empresaActualizada
    });
  } catch (error: any) {
    console.error("Error al actualizar empresa:", error);

    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      const errorMessage = field === "nombre"
        ? "El nombre de la empresa ya existe"
        : "El RUT de la empresa ya existe";

      res.status(400).json({
        success: false,
        error: errorMessage
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Error al actualizar empresa"
    });
  }
}

/* =======================================================
   DELETE /api/empresas/:id
   ======================================================= */
export async function deleteEmpresa(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    // Verificar si la empresa existe
    const empresaExistente = await prisma.empresa.findUnique({
      where: { id_empresa: id },
      include: {
        solicitantes: true,
        tickets: true,
        visitas: true,
        detalleTrabajos: true
      }
    });

    if (!empresaExistente) {
      res.status(404).json({
        success: false,
        error: "Empresa no encontrada"
      });
      return;
    }

    // Verificar si tiene registros relacionados que podrían causar problemas
    if (empresaExistente.solicitantes.length > 0 ||
      empresaExistente.tickets.length > 0 ||
      empresaExistente.visitas.length > 0 ||
      empresaExistente.detalleTrabajos.length > 0) {
      res.status(400).json({
        success: false,
        error: "No se puede eliminar la empresa porque tiene registros relacionados (solicitantes, tickets, visitas o trabajos)"
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Eliminar DetalleEmpresa si existe
      const detalle = await tx.detalleEmpresa.findUnique({
        where: { empresa_id: id },
      });

      if (detalle) {
        await tx.detalleEmpresa.delete({
          where: { empresa_id: id }
        });
      }

      // Eliminar la empresa
      await tx.empresa.delete({
        where: { id_empresa: id }
      });
    });

    res.json({
      success: true,
      message: "Empresa eliminada correctamente"
    });
  } catch (error: any) {
    console.error("Error al eliminar empresa:", error);

    if (error.code === "P2003") {
      res.status(400).json({
        success: false,
        error: "No se puede eliminar la empresa porque tiene registros relacionados"
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Error al eliminar empresa"
    });
  }
}