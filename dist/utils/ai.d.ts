export type RunAIInput = {
    userText: string;
    context: {
        from: string;
        intent?: string;
        turns?: number;
        email?: string;
        company?: string;
        name?: string;
        phone?: string;
        transcript: Array<{
            from: "client" | "bot";
            text: string;
        }>;
    };
};
export declare const runAI: ({ userText, context }: RunAIInput) => Promise<string>;
//# sourceMappingURL=ai.d.ts.map