import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { canViewMapaTecnicos } from "../policies/canViewMapaTecnicos.js";

type DireccionJson = {
  direccion?: string | null;
  nombre?: string | null;
  principal?: boolean | null;
};

function getDireccionDesdeJson(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const direcciones = value
      .filter((item): item is DireccionJson => !!item && typeof item === "object")
      .map((item) => ({
        direccion: typeof item.direccion === "string" ? item.direccion.trim() : "",
        principal: Boolean(item.principal),
      }))
      .filter((item) => item.direccion);

    return (
      direcciones.find((item) => item.principal)?.direccion ??
      direcciones[0]?.direccion ??
      null
    );
  }

  if (typeof value === "object") {
    const item = value as DireccionJson;
    return typeof item.direccion === "string" && item.direccion.trim()
      ? item.direccion.trim()
      : null;
  }

  return null;
}

export async function listarUltimasUbicacionesTecnicos(req: Request, res: Response) {
  try {
    if (!canViewMapaTecnicos(req.user)) {
      return res.status(403).json({
        message: "No tienes permisos para ver el mapa de técnicos",
      });
    }

    const ultimasPorTecnico = await prisma.ubicacionTecnico.groupBy({
      by: ["tecnicoId"],
      _max: {
        createdAt: true,
      },
    });

    const filtrosUltimas = ultimasPorTecnico
      .filter((item) => item._max.createdAt)
      .map((item) => ({
        tecnicoId: item.tecnicoId,
        createdAt: item._max.createdAt as Date,
      }));

    if (filtrosUltimas.length === 0) {
      return res.json([]);
    }

    const ubicaciones = await prisma.ubicacionTecnico.findMany({
      where: {
        OR: filtrosUltimas,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const ubicacionesUnicas = Array.from(
      ubicaciones
        .reduce((acc, ubicacion) => {
          if (!acc.has(ubicacion.tecnicoId)) {
            acc.set(ubicacion.tecnicoId, ubicacion);
          }
          return acc;
        }, new Map<number, (typeof ubicaciones)[number]>())
        .values()
    );

    const tecnicoIds = ubicacionesUnicas.map((ubicacion) => ubicacion.tecnicoId);

    const tecnicosPromise = prisma.tecnico.findMany({
      where: {
        id_tecnico: {
          in: tecnicoIds,
        },
      },
      select: {
        id_tecnico: true,
        nombre: true,
        email: true,
        rol: true,
        status: true,
      },
    });

    // La empresa/destino que se muestra en el mapa se resuelve por la agenda del
    // técnico que está EN_RUTA o INICIADA: es decir, desde que presiona "iniciar
    // ruta" hasta que guarda el formulario (momento en que la agenda pasa a
    // COMPLETADA y deja de mostrarse, volviendo a "sin visita asociada").
    // Ya NO se usa el agendaId del punto GPS, porque con el tracking de jornada
    // los puntos llegan con agendaId nulo aunque el técnico tenga visita en curso.
    const agendasActivasPromise = tecnicoIds.length
      ? prisma.agendaVisita.findMany({
          where: {
            estado: { in: ["EN_RUTA", "INICIADA"] },
            tecnicos: { some: { tecnicoId: { in: tecnicoIds } } },
          },
          select: {
            id: true,
            fecha: true,
            horaInicio: true,
            fechaInicioRuta: true,
            fechaInicioVisita: true,
            estado: true,
            empresaExternaNombre: true,
            empresa: {
              select: {
                nombre: true,
                detalleEmpresa: {
                  select: {
                    direccion: true,
                    direcciones: true,
                  },
                },
              },
            },
            sucursal: {
              select: {
                direccion: true,
              },
            },
            tecnicos: {
              select: {
                tecnicoId: true,
              },
            },
          },
        })
      : Promise.resolve([]);

    const [tecnicos, agendasActivas] = await Promise.all([tecnicosPromise, agendasActivasPromise]);

    const tecnicosPorId = new Map(tecnicos.map((tecnico) => [tecnico.id_tecnico, tecnico] as const));

    // Si un técnico tiene más de una agenda activa, se prioriza la que ya está
    // INICIADA (visita en sitio) por sobre EN_RUTA (aún en camino) y, dentro de
    // cada grupo, la más reciente según su marca de inicio.
    const marcaInicio = (agenda: (typeof agendasActivas)[number]) =>
      new Date(agenda.fechaInicioVisita ?? agenda.fechaInicioRuta ?? agenda.fecha).getTime();

    const agendasOrdenadas = [...agendasActivas].sort((a, b) => {
      const pa = a.estado === "INICIADA" ? 0 : 1;
      const pb = b.estado === "INICIADA" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return marcaInicio(b) - marcaInicio(a);
    });

    const agendaActivaPorTecnico = new Map<number, (typeof agendasActivas)[number]>();
    for (const agenda of agendasOrdenadas) {
      for (const asignado of agenda.tecnicos) {
        if (!agendaActivaPorTecnico.has(asignado.tecnicoId)) {
          agendaActivaPorTecnico.set(asignado.tecnicoId, agenda);
        }
      }
    }

    const respuesta = ubicacionesUnicas.map((ubicacion) => {
      const tecnico = tecnicosPorId.get(ubicacion.tecnicoId);
      const agenda = agendaActivaPorTecnico.get(ubicacion.tecnicoId) ?? null;
      const detalleEmpresa = agenda?.empresa?.detalleEmpresa;

      return {
        tecnicoId: ubicacion.tecnicoId,
        tecnicoNombre: tecnico?.nombre ?? `Tecnico #${ubicacion.tecnicoId}`,
        tecnicoEmail: tecnico?.email ?? null,
        agendaId: agenda?.id ?? null,
        empresa: agenda?.empresa?.nombre ?? agenda?.empresaExternaNombre ?? null,
        direccion:
          agenda?.sucursal?.direccion ??
          detalleEmpresa?.direccion ??
          getDireccionDesdeJson(detalleEmpresa?.direcciones) ??
          null,
        fechaProgramada: agenda?.fecha ?? null,
        horaProgramada: agenda?.horaInicio ?? null,
        fechaInicioRuta: agenda?.fechaInicioRuta ?? null,
        fechaInicioVisita: agenda?.fechaInicioVisita ?? null,
        estadoAgenda: agenda?.estado ?? null,
        latitud: ubicacion.latitud,
        longitud: ubicacion.longitud,
        precision: ubicacion.precision,
        velocidad: ubicacion.velocidad,
        estadoTracking: ubicacion.estadoTracking,
        createdAt: ubicacion.createdAt,
      };
    });

    return res.json(respuesta);
  } catch (error) {
    console.error("Error al listar ubicaciones de tecnicos:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al obtener ubicaciones de tecnicos",
    });
  }
}
