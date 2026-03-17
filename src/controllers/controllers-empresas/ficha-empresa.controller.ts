import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";

/* =====================================================
   FICHA EMPRESA (BÁSICA)
===================================================== */

export async function obtenerFichaEmpresa(req: Request, res: Response) {
  const empresaId = Number(req.params.empresaId);

  let ficha = await prisma.fichaEmpresa.findUnique({
    where: { empresaId },
    include: { checklist: true },
  });

  if (!ficha) {
    ficha = await prisma.fichaEmpresa.create({
      data: { empresaId },
      include: { checklist: true },
    });
  }

  res.json(ficha);
}

/* =====================================================
   FICHA EMPRESA COMPLETA (MODAL)
===================================================== */
export async function obtenerFichaEmpresaCompleta(req: Request, res: Response) {
  const empresaId = Number(req.params.empresaId);

  const empresa = await prisma.empresa.findUnique({
    where: { id_empresa: empresaId },
    include: {
      detalleEmpresa: true,
    },
  });

  if (!empresa) {
    return res.status(404).json({ message: "Empresa no encontrada" });
  }

  let ficha = await prisma.fichaEmpresa.findUnique({
    where: { empresaId },
    include: { checklist: true },
  });

  if (!ficha) {
    ficha = await prisma.fichaEmpresa.create({
      data: { empresaId },
      include: { checklist: true },
    });
  }

  const fichaTecnica = await prisma.fichaTecnicaEmpresa.findUnique({
    where: { empresaId },
  });

  const contactos = await prisma.contactoEmpresa.findMany({
    where: { empresaId },
    include: {
      sucursal: true, // 👈 clave
    },
    orderBy: [
      { principal: "desc" },
      { nombre: "asc" },
    ],
  });

  const sucursales = await prisma.sucursal.findMany({
    where: { empresaId },
    include: {
      responsableSucursals: true,
      redSucursal: true,
      accesoRouterSucursals: true,
    },
    orderBy: { nombre: "asc" },
  });

  return res.json({
    empresa,
    ficha,
    checklist: ficha.checklist ?? null,
    detalleEmpresa: empresa.detalleEmpresa ?? null,
    fichaTecnica,
    contactos,   // 👈 JEFES DE LA EMPRESA
    sucursales,
  });
}

/* =====================================================
   ACTUALIZAR FICHA EMPRESA
===================================================== */
export async function actualizarFichaEmpresa(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);

    if (!empresaId || Number.isNaN(empresaId)) {
      return res.status(400).json({ message: "empresaId inválido" });
    }

    const {
      razonSocial,
      rut,
      direccion,        // 🔵 Principal
      direcciones,      // 🟢 Sucursales
      telefono,
      email,
      condicionesComerciales,
      contactos,
    } = req.body;

    /* =====================================================
       1️⃣ EMPRESA
    ===================================================== */
    await prisma.empresa.update({
      where: { id_empresa: empresaId },
      data: {
        razonSocial: razonSocial ?? null,
      },
    });

    /* =====================================================
       🔥 LIMPIAR DIRECCIONES SECUNDARIAS
       - eliminar vacías
       - eliminar si coinciden con principal
    ===================================================== */
    const cleanedDirecciones =
      Array.isArray(direcciones)
        ? direcciones
          .filter((d: any) =>
            d?.direccion &&
            typeof d.direccion === "string" &&
            d.direccion.trim() !== "" &&
            d.direccion.trim() !== direccion?.trim()
          )
          .map((d: any) => ({
            tipo: d.tipo ?? "Sucursal",
            direccion: d.direccion.trim(),
          }))
        : null;

    /* =====================================================
       2️⃣ DETALLE EMPRESA
    ===================================================== */
    await prisma.detalleEmpresa.upsert({
      where: { empresa_id: empresaId },

      update: {
        rut: rut ?? null,
        direccion: direccion ?? null,
        direcciones:
          cleanedDirecciones && cleanedDirecciones.length > 0
            ? (cleanedDirecciones as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        telefono: telefono ?? null,
        email: email ?? null,
      },

      create: {
        rut: rut ?? null,
        direccion: direccion ?? null,
        direcciones:
          cleanedDirecciones && cleanedDirecciones.length > 0
            ? (cleanedDirecciones as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        telefono: telefono ?? null,
        email: email ?? null,

        empresa: {
          connect: { id_empresa: empresaId },
        },
      },
    });

    /* =====================================================
       3️⃣ FICHA
    ===================================================== */
    await prisma.fichaEmpresa.upsert({
      where: { empresaId },
      update: {
        condicionesComerciales: condicionesComerciales ?? null,
      },
      create: {
        empresaId,
        condicionesComerciales: condicionesComerciales ?? null,
      },
    });

    /* =====================================================
       4️⃣ CONTACTOS
    ===================================================== */
    if (Array.isArray(contactos)) {
      await prisma.contactoEmpresa.deleteMany({
        where: { empresaId },
      });

      const cleanedContactos = contactos
        .filter((c: any) => c?.nombre)
        .map((c: any) => ({
          empresaId,
          sucursalId: c.sucursalId ?? null, // 👈 importante
          nombre: c.nombre,
          cargo: c.cargo ?? null,
          email: c.email ?? null,
          telefono: c.telefono ?? null,
          principal: !!c.principal,
        }));

      if (cleanedContactos.length > 0) {
        await prisma.contactoEmpresa.createMany({
          data: cleanedContactos,
        });
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Error al actualizar ficha empresa:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo actualizar la ficha empresa",
    });
  }
}

/* =====================================================
   FICHA TÉCNICA EMPRESA (NUEVO)
===================================================== */

/* =====================================================
   FICHA TÉCNICA EMPRESA (FIX DEFINITIVO)
===================================================== */
export async function obtenerFichaTecnicaEmpresa(req: Request, res: Response) {
  const empresaId = Number(req.params.empresaId);

  if (!empresaId || Number.isNaN(empresaId)) {
    return res.status(400).json({ message: "empresaId inválido" });
  }

  let ficha = await prisma.fichaTecnicaEmpresa.findUnique({
    where: { empresaId },
  });

  // 🔥 SI NO EXISTE, SE CREA AUTOMÁTICAMENTE
  if (!ficha) {
    ficha = await prisma.fichaTecnicaEmpresa.create({
      data: {
        empresaId,
      },
    });
  }

  return res.status(200).json(ficha);
}

/* ===================== FICHA TÉCNICA EMPRESA ===================== */
export async function upsertFichaTecnicaEmpresa(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);

    if (!empresaId || Number.isNaN(empresaId)) {
      return res.status(400).json({ message: "empresaId inválido" });
    }

    const body = req.body;

    const ficha = await prisma.fichaTecnicaEmpresa.upsert({
      where: { empresaId },
      update: {
        tecnicoPrincipal: body.tecnicoPrincipal ?? null,
        tecnicosRespaldo: body.tecnicosRespaldo ?? null,
        fechaUltimaVisita: body.fechaUltimaVisita
          ? new Date(body.fechaUltimaVisita)
          : null,
        proximaVisitaProgramada: body.proximaVisitaProgramada
          ? new Date(body.proximaVisitaProgramada)
          : null,
        observacionesVisita: body.observacionesVisita ?? null,

        pcsNotebooks: body.pcsNotebooks ?? null,
        servidores: body.servidores ?? null,
        impresorasPerifericos: body.impresorasPerifericos ?? null,
        otrosEquipos: body.otrosEquipos ?? null,

        sistemasOperativos: body.sistemasOperativos ?? null,
        aplicacionesCriticas: body.aplicacionesCriticas ?? null,
        licenciasVigentes: body.licenciasVigentes ?? null,
        antivirusSeguridad: body.antivirusSeguridad ?? null,

        proveedorInternet: body.proveedorInternet ?? null,
        velocidadContratada: body.velocidadContratada ?? null,
        routersSwitches: body.routersSwitches ?? null,
        configuracionIP: body.configuracionIP ?? null,

        dominioWeb: body.dominioWeb ?? null,
        hostingProveedor: body.hostingProveedor ?? null,
        certificadoSSL: body.certificadoSSL ?? null,
        correosCorporativos: body.correosCorporativos ?? null,
        redesSociales: body.redesSociales ?? null,

        metodoRespaldo: body.metodoRespaldo ?? null,
        frecuenciaRespaldo: body.frecuenciaRespaldo ?? null,
        responsableRespaldo: body.responsableRespaldo ?? null,
        ultimaRestauracion: body.ultimaRestauracion
          ? new Date(body.ultimaRestauracion)
          : null,
      },
      create: {
        empresaId,
        tecnicoPrincipal: body.tecnicoPrincipal ?? null,
        tecnicosRespaldo: body.tecnicosRespaldo ?? null,
        fechaUltimaVisita: body.fechaUltimaVisita
          ? new Date(body.fechaUltimaVisita)
          : null,
        proximaVisitaProgramada: body.proximaVisitaProgramada
          ? new Date(body.proximaVisitaProgramada)
          : null,
        observacionesVisita: body.observacionesVisita ?? null,

        pcsNotebooks: body.pcsNotebooks ?? null,
        servidores: body.servidores ?? null,
        impresorasPerifericos: body.impresorasPerifericos ?? null,
        otrosEquipos: body.otrosEquipos ?? null,

        sistemasOperativos: body.sistemasOperativos ?? null,
        aplicacionesCriticas: body.aplicacionesCriticas ?? null,
        licenciasVigentes: body.licenciasVigentes ?? null,
        antivirusSeguridad: body.antivirusSeguridad ?? null,

        proveedorInternet: body.proveedorInternet ?? null,
        velocidadContratada: body.velocidadContratada ?? null,
        routersSwitches: body.routersSwitches ?? null,
        configuracionIP: body.configuracionIP ?? null,

        dominioWeb: body.dominioWeb ?? null,
        hostingProveedor: body.hostingProveedor ?? null,
        certificadoSSL: body.certificadoSSL ?? null,
        correosCorporativos: body.correosCorporativos ?? null,
        redesSociales: body.redesSociales ?? null,

        metodoRespaldo: body.metodoRespaldo ?? null,
        frecuenciaRespaldo: body.frecuenciaRespaldo ?? null,
        responsableRespaldo: body.responsableRespaldo ?? null,
        ultimaRestauracion: body.ultimaRestauracion
          ? new Date(body.ultimaRestauracion)
          : null,
      },
    });

    return res.status(200).json({
      ok: true,
      ficha,
    });
  } catch (error) {
    console.error("Error al guardar ficha técnica:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo guardar la ficha técnica",
    });
  }
}

/* =====================================================
   CHECKLIST DE GESTIÓN EMPRESA
===================================================== */
export async function upsertChecklistEmpresa(req: Request, res: Response) {
  const empresaId = Number(req.params.empresaId);

  if (!empresaId || Number.isNaN(empresaId)) {
    return res.status(400).json({ message: "empresaId inválido" });
  }

  try {
    // 1️⃣ asegurar fichaEmpresa
    let fichaEmpresa = await prisma.fichaEmpresa.findUnique({
      where: { empresaId },
    });

    if (!fichaEmpresa) {
      fichaEmpresa = await prisma.fichaEmpresa.create({
        data: { empresaId },
      });
    }

    // 2️⃣ upsert checklist
    const checklist = await prisma.checklistGestionEmpresa.upsert({
      where: { fichaEmpresaId: fichaEmpresa.id },
      update: {
        ...req.body,
      },
      create: {
        fichaEmpresaId: fichaEmpresa.id,
        ...req.body,
      },
    });

    return res.status(200).json({
      ok: true,
      checklist,
    });
  } catch (error) {
    console.error("Error al guardar checklist:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo guardar el checklist",
    });
  }
}

