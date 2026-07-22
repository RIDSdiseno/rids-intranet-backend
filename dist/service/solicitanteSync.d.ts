/** Shape mínimo que usamos del Directory API */
export type GoogleUser = {
    id: string;
    primaryEmail: string;
    name?: {
        fullName?: string;
        givenName?: string;
        familyName?: string;
    };
    suspended?: boolean;
    archived?: boolean;
    deleted?: boolean;
};
export declare function upsertSolicitanteFromGoogle_min(user: GoogleUser, empresaId: number): Promise<{
    nombre: string;
    deactivatedAt: Date | null;
    isActive: boolean;
    id_solicitante: number;
    email: string | null;
    telefono: string | null;
    empresaId: number;
    clienteId: number | null;
    googleUserId: string | null;
    microsoftUserId: string | null;
    accountType: import("@prisma/client").$Enums.AccountType | null;
    deletedAt: Date | null;
    rut: string | null;
    createdAt: Date;
    updatedAt: Date;
} | null>;
/** Alias para compatibilidad */
export { upsertSolicitanteFromGoogle_full as upsertSolicitanteFromGoogle };
export declare function upsertSolicitanteFromGoogle_full(user: GoogleUser, empresaId: number): Promise<{
    nombre: string;
    deactivatedAt: Date | null;
    isActive: boolean;
    id_solicitante: number;
    email: string | null;
    telefono: string | null;
    empresaId: number;
    clienteId: number | null;
    googleUserId: string | null;
    microsoftUserId: string | null;
    accountType: import("@prisma/client").$Enums.AccountType | null;
    deletedAt: Date | null;
    rut: string | null;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function deactivateMissingGoogleSolicitantes(empresaId: number, googleIdsActivos: string[]): Promise<{
    count: number;
    users: {
        nombre: string;
        id_solicitante: number;
        email: string | null;
        empresaId: number;
        googleUserId: string | null;
    }[];
}>;
//# sourceMappingURL=solicitanteSync.d.ts.map