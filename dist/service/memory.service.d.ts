export declare const saveMessage: (phone: string, role: string, text: string) => Promise<void>;
export declare const getLongTermMemory: (phone: string, limit?: number) => Promise<{
    role: string;
    content: string;
}[]>;
//# sourceMappingURL=memory.service.d.ts.map