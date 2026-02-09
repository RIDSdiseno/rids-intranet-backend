import prisma from "../config/db.js"; // Asegúrate de tener el singleton de prisma aquí
export const saveMessage = async (phone, role, text) => {
    try {
        await prisma.chatLog.create({
            data: {
                phone,
                role,
                text,
            },
        });
    }
    catch (error) {
        console.error("Error guardando mensaje en ChatLog:", error);
        // No bloqueamos el flujo principal si falla el guardado, pero lo informamos
    }
};
export const getLongTermMemory = async (phone, limit = 10) => {
    try {
        const logs = await prisma.chatLog.findMany({
            where: { phone },
            orderBy: { createdAt: "desc" }, // Traemos los más recientes primero
            take: limit,
        });
        // Los invertimos para que queden en orden cronológico (viejo -> nuevo)
        return logs.reverse().map((log) => ({
            role: log.role,
            content: log.text,
        }));
    }
    catch (error) {
        console.error("Error obteniendo memoria de ChatLog:", error);
        return []; // Retornamos memoria vacía para no romper la ejecución
    }
};
//# sourceMappingURL=memory.service.js.map