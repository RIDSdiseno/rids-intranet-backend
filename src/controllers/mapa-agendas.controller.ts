// src/controllers/mapa-agendas.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { EstadoAgenda } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { canViewMapaTecnicos } from "../policies/canViewMapaTecnicos.js";
import { normalizarFechaDesdeString, formatearFechaAgenda } from "../service/agenda.service.js";

const querySchema = z.object({
  fecha: z
    .string({ required_error: "El parámetro 'fecha' es obligatorio (formato YYYY-MM-DD)" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "El parámetro 'fecha' debe tener formato YYYY-MM-DD"),
  estado: z.nativeEnum(EstadoAgenda).optional(),
});

type DestinoTipo =
  | "EMPRESA_PRINCIPAL"
  | "SUCURSAL_UNICA"
  | "SIN_COORDENADAS"
  | "MULTIPLES_SUCURSALES";

type Destino = {
  tipo: DestinoTipo;
  sucursalId: number | null;
  nombre: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  coordenadasDisponibles: boolean;
  tieneMultiplesSucursales: boolean;
};

type EmpresaParaDestino = {
  detalleEmpresa: { direccion: string | null; latitud: number | null; longitud: number | null } | null;
  sucursales: Array<{
    id_sucursal: number;
    nombre: string;
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
  }>;
} | null;

function tieneCoords(item: { latitud: number | null; longitud: number | null } | null | undefined) {
  return item?.latitud != null && item?.longitud != null;
}

type AgendaParaDestino = {
  sucursalId: number | null;
  destinoNombre: string | null;
  destinoDireccion: string | null;
  destinoLatitud: number | null;
  destinoLongitud: number | null;
  empresa: EmpresaParaDestino;
};

/**
 * Punto de entrada: prefiere el snapshot ya guardado en la propia AgendaVisita
 * (elegido explícitamente por quien agendó, vía sucursalId/destino*) y solo cae
 * a la inferencia por empresa (resolverDestinoPorInferencia) para agendas
 * antiguas creadas antes de que existiera este snapshot.
 */
function resolverDestinoAgenda(agenda: AgendaParaDestino): Destino | null {
  const tieneSnapshot = agenda.destinoLatitud != null && agenda.destinoLongitud != null;
  const tieneMultiplesSucursales = (agenda.empresa?.sucursales.length ?? 0) > 1;

  if (tieneSnapshot) {
    return {
      tipo: agenda.sucursalId != null ? "SUCURSAL_UNICA" : "EMPRESA_PRINCIPAL",
      sucursalId: agenda.sucursalId,
      nombre: agenda.destinoNombre,
      direccion: agenda.destinoDireccion,
      latitud: agenda.destinoLatitud,
      longitud: agenda.destinoLongitud,
      coordenadasDisponibles: true,
      tieneMultiplesSucursales,
    };
  }

  // Snapshot presente pero sin coordenadas (ej. sucursal elegida sin lat/lng cargadas).
  if (agenda.destinoNombre || agenda.destinoDireccion) {
    return {
      tipo: "SIN_COORDENADAS",
      sucursalId: agenda.sucursalId,
      nombre: agenda.destinoNombre,
      direccion: agenda.destinoDireccion,
      latitud: null,
      longitud: null,
      coordenadasDisponibles: false,
      tieneMultiplesSucursales,
    };
  }

  // Agenda sin snapshot (creada antes de esta funcionalidad) -> inferencia legacy.
  return resolverDestinoPorInferencia(agenda.empresa);
}

/**
 * Inferencia legacy (Etapa 1 original): para agendas que no tienen snapshot de
 * destino propio, se infiere desde la empresa relacionada. No usa tieneSucursales
 * (bandera desincronizada) ni direcciones.principal (dead code confirmado en el
 * estudio previo), ni elige una sucursal arbitraria cuando hay varias.
 */
function resolverDestinoPorInferencia(empresa: EmpresaParaDestino): Destino | null {
  if (!empresa) return null;

  const { sucursales, detalleEmpresa } = empresa;

  // 1. Única sucursal con coordenadas -> se usa directamente.
  if (sucursales.length === 1 && tieneCoords(sucursales[0])) {
    const unica = sucursales[0]!;
    return {
      tipo: "SUCURSAL_UNICA",
      sucursalId: unica.id_sucursal,
      nombre: unica.nombre,
      direccion: unica.direccion,
      latitud: unica.latitud,
      longitud: unica.longitud,
      coordenadasDisponibles: true,
      tieneMultiplesSucursales: false,
    };
  }

  // 2. Varias sucursales reales -> nunca elegir una arbitraria.
  if (sucursales.length > 1) {
    if (tieneCoords(detalleEmpresa)) {
      return {
        tipo: "EMPRESA_PRINCIPAL",
        sucursalId: null,
        nombre: "Casa matriz",
        direccion: detalleEmpresa!.direccion,
        latitud: detalleEmpresa!.latitud,
        longitud: detalleEmpresa!.longitud,
        coordenadasDisponibles: true,
        tieneMultiplesSucursales: true,
      };
    }

    return {
      tipo: "MULTIPLES_SUCURSALES",
      sucursalId: null,
      nombre: null,
      direccion: null,
      latitud: null,
      longitud: null,
      coordenadasDisponibles: false,
      tieneMultiplesSucursales: true,
    };
  }

  // 3. Sin sucursales (o la única sucursal no tenía coordenadas) -> ubicación principal.
  if (tieneCoords(detalleEmpresa)) {
    return {
      tipo: "EMPRESA_PRINCIPAL",
      sucursalId: null,
      nombre: "Casa matriz",
      direccion: detalleEmpresa!.direccion,
      latitud: detalleEmpresa!.latitud,
      longitud: detalleEmpresa!.longitud,
      coordenadasDisponibles: true,
      tieneMultiplesSucursales: false,
    };
  }

  // 4. Ninguna coordenada disponible: se devuelve dirección (si hay) y coordenadas null.
  return {
    tipo: "SIN_COORDENADAS",
    sucursalId: null,
    nombre: null,
    direccion: detalleEmpresa?.direccion ?? sucursales[0]?.direccion ?? null,
    latitud: null,
    longitud: null,
    coordenadasDisponibles: false,
    tieneMultiplesSucursales: sucursales.length > 1,
  };
}

export async function listarAgendasMapa(req: Request, res: Response) {
  try {
    if (!canViewMapaTecnicos(req.user)) {
      return res.status(403).json({
        message: "No tienes permisos para ver el mapa de técnicos",
      });
    }

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Parámetros inválidos",
        detalles: parsed.error.flatten(),
      });
    }

    const { fecha, estado } = parsed.data;
    const fechaUTC = normalizarFechaDesdeString(fecha);

    // Rechaza fechas con formato válido pero valor calendario inexistente (ej. 2026-02-30).
    if (formatearFechaAgenda(fechaUTC) !== fecha) {
      return res.status(400).json({
        message: "El parámetro 'fecha' no corresponde a una fecha calendario válida",
      });
    }

    const agendas = await prisma.agendaVisita.findMany({
      where: {
        fecha: fechaUTC,
        ...(estado && { estado }),
      },
      select: {
        id: true,
        fecha: true,
        estado: true,
        horaInicio: true,
        horaFin: true,
        empresaId: true,
        empresaExternaNombre: true,
        sucursalId: true,
        destinoNombre: true,
        destinoDireccion: true,
        destinoLatitud: true,
        destinoLongitud: true,
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: {
              select: { direccion: true, latitud: true, longitud: true },
            },
            sucursales: {
              select: {
                id_sucursal: true,
                nombre: true,
                direccion: true,
                latitud: true,
                longitud: true,
              },
            },
          },
        },
        tecnicos: {
          select: {
            tecnico: { select: { id_tecnico: true, nombre: true } },
          },
        },
      },
      orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
    });

    const respuesta = agendas.map((agenda) => ({
      agendaId: agenda.id,
      fecha: formatearFechaAgenda(agenda.fecha),
      estado: agenda.estado,
      horaInicio: agenda.horaInicio,
      horaFin: agenda.horaFin,
      empresa: agenda.empresa
        ? { id: agenda.empresa.id_empresa, nombre: agenda.empresa.nombre }
        : null,
      empresaExternaNombre: agenda.empresaExternaNombre,
      destino: resolverDestinoAgenda(agenda),
      tecnicos: agenda.tecnicos.map(({ tecnico }) => ({
        id: tecnico.id_tecnico,
        nombre: tecnico.nombre,
      })),
    }));

    return res.json(respuesta);
  } catch (error) {
    console.error("Error al listar agendas del mapa:", error);
    return res.status(500).json({
      message: "Error al obtener las agendas del mapa",
    });
  }
}
