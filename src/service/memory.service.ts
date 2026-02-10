import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Guarda un mensaje en la base de datos vinculándolo al número de teléfono.
 */
export const saveMessage = async (phone: string, role: "client" | "bot", content: string) => {
  try {
    await prisma.chatLog.create({
      data: {
        phone,
        role,
        content, // Usamos 'content' para que coincida con tu schema.prisma
      },
    });
  } catch (error) {
    console.error(" Error guardando mensaje en ChatLog:", error);
  }
};

/**
 * Recupera los últimos mensajes para dar contexto a la IA.
 */
export const getLongTermMemory = async (phone: string, limit: number) => {
  try {
    const logs = await prisma.chatLog.findMany({
      where: {
        phone: phone, // Corregido: ya no usamos el shorthand erróneo {one}
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    // Invertimos el array para que la IA reciba los mensajes del más antiguo al más nuevo
    return logs.reverse().map((log) => ({
      role: log.role,
      content: log.content, // Mapeo correcto al campo 'content' del esquema
    }));
  } catch (error) {
    console.error(" Error obteniendo memoria de ChatLog:", error);
    return []; // Retornamos memoria vacía para no romper el flujo del bot
  }
};