import { prisma } from "../lib/prisma.js";

export async function getInventarioByEmpresa(params: {
  empresaId?: number;
  empresaNombre?: string;
}) {
  const { empresaId, empresaNombre } = params;

  return prisma.equipo.findMany({
    where: empresaId
      ? {
          solicitante: {
            is: {
              empresaId: empresaId,
            },
          },
        }
      : empresaNombre
      ? {
          solicitante: {
            is: {
              empresa: {
                nombre: empresaNombre,
              },
            },
          },
        }
      : {},

    include: {
      solicitante: {
        select: {
          nombre: true,
          email: true,
          empresa: {
            select: { nombre: true },
          },
        },
      },
      equipo: {
        select: {
          macWifi: true,
          so: true,
          office: true,
          teamViewer: true,
          revisado: true,
        },
      },
    },

    orderBy: {
      id_equipo: "asc",
    },
  });
}
