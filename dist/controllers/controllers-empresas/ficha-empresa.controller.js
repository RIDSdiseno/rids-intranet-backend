import { prisma } from "../../lib/prisma.js";
/* =====================================================
   FICHA EMPRESA (BÁSICA)
===================================================== */
export async function obtenerFichaEmpresa(req, res) {
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
export async function obtenerFichaEmpresaCompleta(req, res) {
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
    const contactos = await prisma.contactoEmpresa.findMany({
        where: { empresaId },
    });
    const sucursales = await prisma.sucursal.findMany({
        where: { empresaId },
        include: {
            responsableSucursals: true,
            redSucursal: true,
            accesoRouterSucursals: true,
        },
    });
    const fichaTecnica = await prisma.fichaTecnicaEmpresa.findUnique({
        where: { empresaId },
    });
    return res.json({
        empresa,
        ficha,
        checklist: ficha.checklist ?? null,
        detalleEmpresa: empresa.detalleEmpresa ?? null,
        fichaTecnica, // 👈 NUEVO
        contactos,
        sucursales,
    });
}
/* =====================================================
   ACTUALIZAR FICHA EMPRESA
===================================================== */
export async function actualizarFichaEmpresa(req, res) {
    const empresaId = Number(req.params.empresaId);
    const { razonSocial, rut, direccion, condicionesComerciales, } = req.body;
    /* =========================
       1️⃣ EMPRESA
       ========================= */
    await prisma.empresa.update({
        where: { id_empresa: empresaId },
        data: { razonSocial },
    });
    /* =========================
       2️⃣ DETALLE EMPRESA
       ========================= */
    await prisma.detalleEmpresa.upsert({
        where: { empresa_id: empresaId },
        update: { rut, direccion },
        create: {
            empresa_id: empresaId,
            rut,
            direccion,
        },
    });
    /* =========================
       3️⃣ FICHA EMPRESA
       ========================= */
    const ficha = await prisma.fichaEmpresa.upsert({
        where: { empresaId },
        update: { condicionesComerciales },
        create: {
            empresaId,
            condicionesComerciales,
        },
    });
    return res.json({
        ok: true,
        ficha,
    });
}
/* =====================================================
   FICHA TÉCNICA EMPRESA (NUEVO)
===================================================== */
export async function obtenerFichaTecnicaEmpresa(req, res) {
    const empresaId = Number(req.params.empresaId);
    const ficha = await prisma.fichaTecnicaEmpresa.findUnique({
        where: { empresaId },
    });
    res.json(ficha);
}
/* ===================== FICHA TÉCNICA EMPRESA ===================== */
export async function upsertFichaTecnicaEmpresa(req, res) {
    try {
        const empresaId = Number(req.params.empresaId);
        if (!empresaId || Number.isNaN(empresaId)) {
            return res.status(400).json({ message: "empresaId inválido" });
        }
        const ficha = await prisma.fichaTecnicaEmpresa.upsert({
            where: { empresaId },
            update: {
                ...req.body,
            },
            create: {
                empresaId,
                ...req.body,
            },
        });
        return res.json({
            ok: true,
            ficha,
        });
    }
    catch (error) {
        console.error("Error al guardar ficha técnica:", error);
        return res.status(500).json({
            ok: false,
            message: "No se pudo guardar la ficha técnica",
        });
    }
}
//# sourceMappingURL=ficha-empresa.controller.js.map