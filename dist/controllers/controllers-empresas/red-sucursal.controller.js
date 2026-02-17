import { prisma } from "../../lib/prisma.js";
export async function crearEmpresaISP(req, res) {
    const empresaId = Number(req.params.empresaId);
    const body = req.body;
    if (body.esPrincipal) {
        await prisma.empresaISP.updateMany({
            where: { empresaId },
            data: { esPrincipal: false },
        });
    }
    const nueva = await prisma.empresaISP.create({
        data: {
            empresaId,
            sucursalId: body.sucursalId ?? null,
            esPrincipal: body.esPrincipal ?? false,
            operador: body.operador ?? null,
            telefono: body.telefono ?? null,
            servicio: body.servicio ?? null,
            numeroTicket: body.numeroTicket ?? null,
            wifiNombre: body.wifiNombre ?? null,
            wifiClaveRef: body.wifiClaveRef ?? null,
            ipRed: body.ipRed ?? null,
        },
    });
    res.json({ ok: true, isp: nueva });
}
export async function obtenerEmpresaISPs(req, res) {
    const empresaId = Number(req.params.empresaId);
    const isps = await prisma.empresaISP.findMany({
        where: { empresaId },
        include: { sucursal: true },
        orderBy: [
            { esPrincipal: "desc" },
            { createdAt: "asc" }
        ],
    });
    res.json(isps);
}
export async function actualizarEmpresaISP(req, res) {
    const id = Number(req.params.id);
    const body = req.body;
    const existente = await prisma.empresaISP.findUnique({
        where: { id },
    });
    if (!existente) {
        return res.status(404).json({ error: "Red no encontrada" });
    }
    if (body.esPrincipal) {
        await prisma.empresaISP.updateMany({
            where: { empresaId: existente.empresaId },
            data: { esPrincipal: false },
        });
    }
    const actualizada = await prisma.empresaISP.update({
        where: { id },
        data: {
            sucursalId: body.sucursalId ?? null,
            esPrincipal: body.esPrincipal ?? existente.esPrincipal,
            operador: body.operador ?? null,
            telefono: body.telefono ?? null,
            servicio: body.servicio ?? null,
            numeroTicket: body.numeroTicket ?? null,
            wifiNombre: body.wifiNombre ?? null,
            wifiClaveRef: body.wifiClaveRef ?? null,
            ipRed: body.ipRed ?? null,
        },
    });
    res.json({ ok: true, isp: actualizada });
    {
        return;
    }
}
export async function eliminarEmpresaISP(req, res) {
    const id = Number(req.params.id);
    await prisma.empresaISP.delete({
        where: { id },
    });
    res.json({ ok: true });
}
//# sourceMappingURL=red-sucursal.controller.js.map