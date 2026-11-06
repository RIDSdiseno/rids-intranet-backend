export type MsUser = {
    id: string;
    name: string;
    email: string | null;
    suspended: boolean;
    licenses: Array<{
        skuId: string;
        skuPartNumber: string;
        displayName?: string;
    }>;
};
type ListOpts = {
    filterDomain?: string | string[];
};
export declare function listUsersWithLicenses(opts?: ListOpts): Promise<MsUser[]>;
/**
 * Token app-only para leer SharePoint vía Graph.
 */
export declare function obtenerTokenSharepoint(): Promise<string>;
export {};
//# sourceMappingURL=graph.d.ts.map