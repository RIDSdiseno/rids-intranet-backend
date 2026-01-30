import { prisma } from "../../lib/prisma.js";
export async function obtenerEmpresaISP(req, res) {
    const empresaId = Number(req.params.empresaId);
    let isp = await prisma.empresaISP.findUnique({
        where: { empresaId },
    });
    if (!isp) {
        isp = await prisma.empresaISP.create({
            data: { empresaId },
        });
    }
    res.json(isp);
}
export async function upsertEmpresaISP(req, res) {
    const empresaId = Number(req.params.empresaId);
    const body = req.body;
    const isp = await prisma.empresaISP.upsert({
        where: { empresaId },
        update: {
            operador: body.operador ?? null,
            telefono: body.telefono ?? null,
            servicio: body.servicio ?? null,
            numeroTicket: body.numeroTicket ?? null,
            wifiNombre: body.wifiNombre ?? null,
            wifiClaveRef: body.wifiClaveRef ?? null,
            ipRed: body.ipRed ?? null,
        },
        create: {
            empresaId,
            operador: body.operador ?? null,
            telefono: body.telefono ?? null,
            servicio: body.servicio ?? null,
            numeroTicket: body.numeroTicket ?? null,
            wifiNombre: body.wifiNombre ?? null,
            wifiClaveRef: body.wifiClaveRef ?? null,
            ipRed: body.ipRed ?? null,
        },
    });
    res.json({ ok: true, isp });
}
//# sourceMappingURL=red-sucursal.controller.js.map