export type WcTextPayload = {
    to: string;
    type: "text";
    text: {
        body: string;
    };
};
export declare function wcSendText(to: string, body: string): Promise<void>;
//# sourceMappingURL=wc.d.ts.map