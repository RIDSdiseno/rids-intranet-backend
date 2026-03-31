import { prisma } from "../../../lib/prisma.js";
import { ticketEmailTemplateService } from "../../../service/email/reply-templates/ticket-email-template.service.js";
export async function getTicketEmailSignature(_req, res) {
    try {
        const data = await ticketEmailTemplateService.getSignatureSettings();
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("[helpdesk] getTicketEmailSignature error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener firma",
        });
    }
}
export async function updateTicketEmailSignature(req, res) {
    try {
        const { nombre, cargo, area, email, telefono, sitioWeb1, sitioWeb2, imageUrl, isEnabled, } = req.body;
        const existing = await prisma.ticketEmailSignature.findFirst({
            orderBy: { id: "asc" },
        });
        const data = existing
            ? await prisma.ticketEmailSignature.update({
                where: { id: existing.id },
                data: {
                    ...(nombre !== undefined && { nombre }),
                    ...(cargo !== undefined && { cargo }),
                    ...(area !== undefined && { area }),
                    ...(email !== undefined && { email }),
                    ...(telefono !== undefined && { telefono }),
                    ...(sitioWeb1 !== undefined && { sitioWeb1 }),
                    ...(sitioWeb2 !== undefined && { sitioWeb2 }),
                    ...(imageUrl !== undefined && { imageUrl }),
                    ...(isEnabled !== undefined && { isEnabled }),
                },
            })
            : await prisma.ticketEmailSignature.create({
                data: {
                    nombre: nombre ?? "Equipo de Soporte Técnico",
                    cargo: cargo ?? "Soporte Técnico",
                    area: area ?? "Asesorías RIDS Ltda.",
                    email: email ?? "soporte@rids.cl",
                    telefono: telefono ?? null,
                    sitioWeb1: sitioWeb1 ?? null,
                    sitioWeb2: sitioWeb2 ?? null,
                    imageUrl: imageUrl ?? null,
                    isEnabled: isEnabled ?? true,
                },
            });
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("[helpdesk] updateTicketEmailSignature error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al guardar firma",
        });
    }
}
//# sourceMappingURL=ticket-default-signature.controller.js.map