// src/service/inventario.service.ts

import {
  Prisma,
  EstadoEquipo,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";

/* ======================================================
   Tipos
====================================================== */

type InventarioParams = {
  empresaId?: number;
  empresaNombre?: string;

  // Filtros generales.
  marca?: string;
  estado?: EstadoEquipo;

  propiedad?:
  | "Empresa"
  | "Personal"
  | "Externo";

  propietarioExterno?: string;

  // Año PC.
  anioPcDesde?: number;
  anioPcHasta?: number;

  anioPcOrigen?:
  | "AUTO"
  | "MANUAL"
  | "NO_DETERMINADO";

  // Fechas del registro del equipo.
  createdFrom?: Date;
  createdTo?: Date;

  updatedFrom?: Date;
  updatedTo?: Date;

  // Agente / Script RIDS.
  agente?:
  | "INSTALADO"
  | "NO_INSTALADO"
  | "ACTIVO"
  | "SIN_CONEXION";

  agenteDesde?: Date;
  agenteHasta?: Date;

  // Actividad del técnico.
  auditTecnicoId?: number;
  auditFrom?: Date;
  auditTo?: Date;

  auditAction?:
  | "CREATE"
  | "UPDATE";

  // Solicitantes con más de un equipo.
  solicitanteMultiplesEquipos?:
  "MULTIPLES";
};

/* ======================================================
   Actividad por técnico
====================================================== */

/**
 * Obtiene los IDs de equipos sobre los que un técnico
 * realizó una actividad.
 *
 * Se consideran dos fuentes:
 *
 * 1. AuditLog
 *    - entity = "Equipo"
 *    - entity = "DetalleEquipo"
 *
 * 2. EquipoAgenteEvento
 *    - metadata.tecnicoInstaladorId
 *
 * Esto permite considerar tanto cambios manuales como
 * sincronizaciones automáticas del agente asociadas
 * al técnico.
 */
async function obtenerEquipoIdsPorActividad(params: {
  auditTecnicoId: number;
  auditFrom?: Date;
  auditTo?: Date;
  auditAction?: "CREATE" | "UPDATE";
}): Promise<number[]> {
  const {
    auditTecnicoId,
    auditFrom,
    auditTo,
    auditAction,
  } = params;

  /* ====================================================
     1. AuditLog
  ==================================================== */

  const logs =
    await prisma.auditLog.findMany({
      where: {
        actorId:
          auditTecnicoId,

        entity: {
          in: [
            "Equipo",
            "DetalleEquipo",
          ],
        },

        /*
         * Si no se indica acción,
         * considerar CREATE y UPDATE.
         */
        action:
          auditAction
            ? auditAction
            : {
              in: [
                "CREATE",
                "UPDATE",
              ],
            },

        /*
         * Fecha de actividad.
         */
        ...(auditFrom || auditTo
          ? {
            createdAt: {
              ...(auditFrom
                ? {
                  gte:
                    auditFrom,
                }
                : {}),

              ...(auditTo
                ? {
                  lte:
                    auditTo,
                }
                : {}),
            },
          }
          : {}),
      },

      select: {
        entity: true,
        entityId: true,
      },
    });

  /*
   * Logs cuyo entityId ya corresponde
   * directamente a Equipo.id_equipo.
   */
  const equipoIdsDirectos =
    logs
      .filter(
        (log) =>
          log.entity ===
          "Equipo"
      )
      .map(
        (log) =>
          Number(
            log.entityId
          )
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  /*
   * Logs correspondientes a DetalleEquipo.
   */
  const detalleIds =
    logs
      .filter(
        (log) =>
          log.entity ===
          "DetalleEquipo"
      )
      .map(
        (log) =>
          Number(
            log.entityId
          )
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  let equipoIdsDesdeDetalle:
    number[] = [];

  /*
   * Resolver DetalleEquipo.id -> Equipo.id_equipo.
   */
  if (
    detalleIds.length >
    0
  ) {
    const detalles =
      await prisma.detalleEquipo.findMany({
        where: {
          id: {
            in:
              detalleIds,
          },
        },

        select: {
          idEquipo: true,
        },
      });

    equipoIdsDesdeDetalle =
      detalles
        .map(
          (detalle) =>
            detalle.idEquipo
        )
        .filter(
          (
            id
          ): id is number =>
            typeof id ===
            "number" &&
            Number.isInteger(id) &&
            id > 0
        );
  }

  /* ====================================================
     2. EquipoAgenteEvento
  ==================================================== */

  /*
   * Relación entre AuditAction y
   * los eventos generados por el agente.
   */
  const tiposEventoAgente:
    string[] =
    auditAction ===
      "CREATE"
      ? [
        "INVENTORY_CREATED",
      ]
      : auditAction ===
        "UPDATE"
        ? [
          "INVENTORY_SYNC",
          "REVISION_SOLICITANTE",
        ]
        : [
          "INVENTORY_CREATED",
          "INVENTORY_SYNC",
          "REVISION_SOLICITANTE",
        ];

  /*
   * Los eventos automáticos tienen actorId null,
   * pero guardan el técnico dentro de metadata:
   *
   * metadata.tecnicoInstaladorId
   */
  const eventosAgente =
    await prisma.equipoAgenteEvento.findMany({
      where: {
        tipo: {
          in:
            tiposEventoAgente,
        },

        metadata: {
          path: [
            "tecnicoInstaladorId",
          ],

          equals:
            auditTecnicoId,
        },

        ...(auditFrom || auditTo
          ? {
            createdAt: {
              ...(auditFrom
                ? {
                  gte:
                    auditFrom,
                }
                : {}),

              ...(auditTo
                ? {
                  lte:
                    auditTo,
                }
                : {}),
            },
          }
          : {}),
      },

      select: {
        equipoId: true,
      },
    });

  const equipoIdsDesdeAgente =
    eventosAgente
      .map(
        (evento) =>
          evento.equipoId
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  /* ====================================================
     3. Unificar IDs
  ==================================================== */

  return Array.from(
    new Set([
      ...equipoIdsDirectos,
      ...equipoIdsDesdeDetalle,
      ...equipoIdsDesdeAgente,
    ])
  );
}

/* ======================================================
   Obtener inventario filtrado
====================================================== */

export async function getInventarioByEmpresa(
  params: InventarioParams
) {
  const {
    empresaId,
    empresaNombre,

    marca,
    estado,

    propiedad,
    propietarioExterno,

    anioPcDesde,
    anioPcHasta,
    anioPcOrigen,

    createdFrom,
    createdTo,

    updatedFrom,
    updatedTo,

    agente,
    agenteDesde,
    agenteHasta,

    auditTecnicoId,
    auditFrom,
    auditTo,
    auditAction,

    solicitanteMultiplesEquipos,
  } = params;

  /* ====================================================
     WHERE dinámico
  ==================================================== */

  const AND:
    Prisma.EquipoWhereInput[] =
    [
      /*
       * No exportar registros eliminados
       * mediante soft delete.
       */
      {
        deletedAt:
          null,
      },
    ];

  /* ====================================================
     Empresa por ID
  ==================================================== */

  if (empresaId) {
    AND.push({
      OR: [
        /*
         * Empresa obtenida mediante solicitante.
         */
        {
          solicitante: {
            is: {
              empresaId,
            },
          },
        },

        /*
         * Empresa asignada directamente al equipo.
         */
        {
          empresaId,
        },
      ],
    });
  }

  /* ====================================================
     Empresa por nombre
  ==================================================== */

  if (empresaNombre) {
    AND.push({
      OR: [
        {
          solicitante: {
            is: {
              empresa: {
                nombre:
                  empresaNombre,
              },
            },
          },
        },

        {
          empresa: {
            is: {
              nombre:
                empresaNombre,
            },
          },
        },
      ],
    });
  }

  /* ====================================================
     Marca
  ==================================================== */

  if (marca) {
    AND.push({
      marca: {
        equals:
          marca,

        mode:
          "insensitive",
      },
    });
  }

  /* ====================================================
     Estado del equipo
  ==================================================== */

  if (estado) {
    AND.push({
      estado,
    });
  }

  /* ====================================================
     Propiedad
  ==================================================== */

  if (propiedad) {
    AND.push({
      propiedad,
    });
  }

  /* ====================================================
     Propietario externo
  ==================================================== */

  if (
    propietarioExterno
  ) {
    AND.push({
      propietarioExterno: {
        contains:
          propietarioExterno,

        mode:
          "insensitive",
      },
    });
  }

  /* ====================================================
     Año PC
  ==================================================== */

  if (
    anioPcDesde ||
    anioPcHasta
  ) {
    AND.push({
      anioPc: {
        ...(anioPcDesde
          ? {
            gte:
              anioPcDesde,
          }
          : {}),

        ...(anioPcHasta
          ? {
            lte:
              anioPcHasta,
          }
          : {}),
      },
    });
  }

  /* ====================================================
     Origen del año PC
  ==================================================== */

  if (anioPcOrigen) {
    AND.push({
      anioPcOrigen,
    });
  }

  /* ====================================================
     Fecha de creación
  ==================================================== */

  if (
    createdFrom ||
    createdTo
  ) {
    AND.push({
      createdAt: {
        ...(createdFrom
          ? {
            gte:
              createdFrom,
          }
          : {}),

        ...(createdTo
          ? {
            lte:
              createdTo,
          }
          : {}),
      },
    });
  }

  /* ====================================================
     Fecha de edición
  ==================================================== */

  if (
    updatedFrom ||
    updatedTo
  ) {
    AND.push({
      updatedAt: {
        ...(updatedFrom
          ? {
            gte:
              updatedFrom,
          }
          : {}),

        ...(updatedTo
          ? {
            lte:
              updatedTo,
          }
          : {}),
      },
    });
  }

  /* ====================================================
     Agente instalado
  ==================================================== */

  if (
    agente ===
    "INSTALADO"
  ) {
    AND.push({
      lastSeenAt: {
        not:
          null,
      },
    });
  }

  /* ====================================================
     Sin agente
  ==================================================== */

  if (
    agente ===
    "NO_INSTALADO"
  ) {
    AND.push({
      lastSeenAt:
        null,
    });
  }

  /* ====================================================
     Agente activo
  ==================================================== */

  if (
    agente ===
    "ACTIVO"
  ) {
    AND.push({
      agenteActivo:
        true,
    });
  }

  /* ====================================================
     Agente sin conexión
  ==================================================== */

  if (
    agente ===
    "SIN_CONEXION"
  ) {
    AND.push({
      estadoAgente:
        "SIN_CONEXION",
    });
  }

  /* ====================================================
     Fecha última conexión agente
  ==================================================== */

  if (
    agenteDesde ||
    agenteHasta
  ) {
    AND.push({
      lastSeenAt: {
        ...(agenteDesde
          ? {
            gte:
              agenteDesde,
          }
          : {}),

        ...(agenteHasta
          ? {
            lte:
              agenteHasta,
          }
          : {}),
      },
    });
  }

  /* ====================================================
     Actividad del técnico
  ==================================================== */

  if (auditTecnicoId) {
    const equipoIdsActividad =
      await obtenerEquipoIdsPorActividad({
        auditTecnicoId,

        /*
         * exactOptionalPropertyTypes:
         * no mandar explícitamente undefined.
         */
        ...(auditFrom
          ? {
            auditFrom,
          }
          : {}),

        ...(auditTo
          ? {
            auditTo,
          }
          : {}),

        ...(auditAction
          ? {
            auditAction,
          }
          : {}),
      });

    /*
     * Si no existen IDs:
     *
     * id_equipo: { in: [] }
     *
     * provocará correctamente cero resultados.
     */
    AND.push({
      id_equipo: {
        in:
          equipoIdsActividad,
      },
    });
  }

  /* ====================================================
   Solicitantes con más de un equipo
   DENTRO DEL UNIVERSO FILTRADO ACTUAL
==================================================== */

  if (
    solicitanteMultiplesEquipos ===
    "MULTIPLES"
  ) {
    /*
     * Usamos todos los filtros que ya fueron
     * agregados a AND.
     *
     * Así el cálculo de "más de 1 equipo"
     * se realiza sobre exactamente el mismo
     * universo que será exportado.
     */
    const whereBaseMultiples:
      Prisma.EquipoWhereInput =
    {
      AND: [
        ...AND,

        /*
         * Solo pueden agruparse equipos
         * que tengan solicitante.
         */
        {
          idSolicitante: {
            not: null,
          },
        },
      ],
    };

    const agrupados =
      await prisma.equipo.groupBy({
        by: [
          "idSolicitante",
        ],

        where:
          whereBaseMultiples,

        _count: {
          id_equipo:
            true,
        },

        having: {
          id_equipo: {
            _count: {
              gt: 1,
            },
          },
        },
      });

    const solicitanteIdsMultiplesEquipos =
      agrupados
        .map(
          (
            item
          ) =>
            item.idSolicitante
        )
        .filter(
          (
            id
          ): id is number =>
            typeof id ===
            "number" &&
            Number.isInteger(
              id
            ) &&
            id > 0
        );

    /*
     * Finalmente limitamos la exportación
     * únicamente a esos solicitantes.
     */
    AND.push({
      idSolicitante: {
        in:
          solicitanteIdsMultiplesEquipos,
      },
    });
  }

  /* ====================================================
     Consulta final
  ==================================================== */

  const equipos =
    await prisma.equipo.findMany({
      where: {
        AND,
      },

      include: {
        /*
         * Empresa directa del equipo.
         */
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
          },
        },

        /*
         * Solicitante y su empresa.
         */
        solicitante: {
          select: {
            nombre: true,
            email: true,

            empresa: {
              select: {
                id_empresa: true,
                nombre: true,
              },
            },
          },
        },

        /*
         * Información técnica adicional.
         */
        detalle: {
          select: {
            id: true,
            idEquipo: true,
            macWifi: true,
            so: true,
            office: true,
            teamViewer: true,
            revisado: true,
            usuarioEmpresa: true,
            claveTv: true,
            estadoAlm: true,
            redEthernet: true,
            adminRidsUsuario: true,
            adminRidsPassword: true,
            passwordEmpresa: true,
            passwordPersonal: true,
            usuarioPersonal: true,
          },
        },

        /*
         * Adicionales asociados al equipo.
         */
        adicionalesRelacion: {
          select: {
            id: true,
            equipoId: true,
            origen: true,
            observacion: true,

            adicional: {
              select: {
                id: true,

                nombre: true,

                tipo: true,

                marca: true,
                modelo: true,

                descripcion: true,

                cantidad: true,

                serialAdicional: true,

                macAddress: true,
                ipAddress: true,
                hostname: true,
                ubicacion: true,

                origen: true,
                estado: true,
              },
            },
          },

          orderBy: [
            {
              adicional: {
                tipo: "asc",
              },
            },
            {
              id: "asc",
            },
          ],
        },
      },

      /*
       * El orden definitivo del Excel se aplica
       * después en buildInventarioExcel:
       *
       * empresa -> solicitante -> id_equipo
       */
      orderBy: {
        id_equipo: "asc",
      },
    });

  return equipos.map(
    (equipo) => ({
      ...equipo,

      /*
       * Compatibilidad con consumidores actuales
       * del inventario.
       */
      adicionales:
        equipo.adicionalesRelacion.map(
          (relacion) => ({
            ...relacion.adicional,

            relacionId:
              relacion.id,

            equipoId:
              relacion.equipoId,

            origenRelacion:
              relacion.origen,

            observacionRelacion:
              relacion.observacion,
          })
        ),
    })
  );
}