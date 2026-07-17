export declare function getOverride(empresaKey: string, tipoDoc: string, folio: string): Promise<string | null>;
export declare function setOverride(empresaKey: string, tipoDoc: string, folio: string, fechaIso: string | null): Promise<void>;
export declare function listOverrides(): Promise<Record<string, string>>;
declare const _default: {
    getOverride: typeof getOverride;
    setOverride: typeof setOverride;
    listOverrides: typeof listOverrides;
};
export default _default;
//# sourceMappingURL=rcv-vencimientos.store.d.ts.map