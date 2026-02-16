export type MemoryMessage = {
    role: "client" | "bot" | "assistant";
    content: string;
};
/**
 * Guarda un mensaje en la base de datos vinculándolo al número de teléfono.
 */
export declare const saveMessage: (phone: string, role: "client" | "bot", content: string) => Promise<void>;
/**
 * Recupera los últimos mensajes para dar contexto a la IA.
 */
export declare const getLongTermMemory: (phone: string, limit: number) => Promise<MemoryMessage[]>;
//# sourceMappingURL=memory.service.d.ts.map