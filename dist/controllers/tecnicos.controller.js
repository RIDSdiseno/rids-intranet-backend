// src/controllers/tecnicos.controller.ts
import { prisma } from "../lib/prisma.js";
export async function listTecnicos(_req, res) {
    try {
        const tecnicos = await prisma.tecnico.findMany({
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
            },
            orderBy: { nombre: "asc" },
        });
        return res.status(200).json(tecnicos);
    }
    catch (error) {
        console.error("Error al listar técnicos:", error);
        return res.status(500).json({ error: "Error al listar técnicos" });
    }
}
//# sourceMappingURL=tecnicos.controller.js.map