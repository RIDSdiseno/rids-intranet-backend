import { prisma } from "../../lib/prisma.js";
export async function buscarContactos(req, res) {
    try {
        const search = String(req.query.search || "");
        const contactos = await prisma.solicitante.findMany({
            where: {
                OR: [
                    {
                        email: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        nombre: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
                isActive: true,
            },
            select: {
                email: true,
                nombre: true,
            },
            take: 10, // 🔥 limit
        });
        return res.json({
            ok: true,
            contactos,
        });
    }
    catch (error) {
        console.error("buscarContactos error:", error);
        return res.status(500).json({ ok: false });
    }
}
//# sourceMappingURL=contactos.controller.js.map