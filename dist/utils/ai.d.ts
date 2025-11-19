export type RunAIInput = {
    userText: string;
    context?: {
        from: string;
        lastUserMsg?: string;
        lastAIReply?: string;
        turns?: number;
        email?: string;
        company?: string;
        name?: string;
        phone?: string;
        transcript?: Array<{
            from: "client" | "bot";
            text: string;
        }>;
    };
};
export declare function runAI(input: RunAIInput): Promise<string>;
//# sourceMappingURL=ai.d.ts.map