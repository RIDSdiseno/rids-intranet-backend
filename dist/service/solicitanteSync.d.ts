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
};
export declare function upsertSolicitanteFromGoogle_min(user: GoogleUser, empresaId: number): Promise<{
    id_solicitante: number;
    clienteId: number | null;
    googleUserId: string | null;
    microsoftUserId: string | null;
    nombre: string;
    email: string | null;
    telefono: string | null;
    empresaId: number;
    isActive: boolean;
    accountType: import("@prisma/client").$Enums.AccountType | null;
    deletedAt: Date | null;
} | null>;
/** Alias para compatibilidad */
export { upsertSolicitanteFromGoogle_min as upsertSolicitanteFromGoogle };
export declare function upsertSolicitanteFromGoogle_full(user: GoogleUser, empresaId: number): Promise<{
    id_solicitante: number;
    clienteId: number | null;
    googleUserId: string | null;
    microsoftUserId: string | null;
    nombre: string;
    email: string | null;
    telefono: string | null;
    empresaId: number;
    isActive: boolean;
    accountType: import("@prisma/client").$Enums.AccountType | null;
    deletedAt: Date | null;
}>;
//# sourceMappingURL=solicitanteSync.d.ts.map