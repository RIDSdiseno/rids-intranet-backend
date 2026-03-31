import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
/**
 * Guarda un mensaje en la base de datos vinculándolo al número de teléfono.
 */
export const saveMessage = async (phone, role, content) => {
    try {
        await prisma.chatLog.create({
            data: {
                phone,
                role,
                text: content, // ✅ CAMBIADO
            },
        });
    }
    catch (error) {
        console.error("Error guardando mensaje en ChatLog:", error);
    }
};
/**
 * Recupera los últimos mensajes para dar contexto a la IA.
 */
export const getLongTermMemory = async (phone, limit) => {
    try {
        const logs = await prisma.chatLog.findMany({
            where: { phone },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        return logs.reverse().map((log) => ({
            role: log.role,
            content: log.text ?? "", // ✅ CAMBIADO
        }));
    }
    catch (error) {
        console.error("Error obteniendo memoria de ChatLog:", error);
        return [];
    }
};
//# sourceMappingURL=memory.service.js.map