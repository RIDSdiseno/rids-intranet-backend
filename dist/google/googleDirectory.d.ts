/** Autenticación por Service Account + impersonación del admin (por dominio) */
export declare function getDirectoryClient(domain?: string): import("googleapis").admin_directory_v1.Admin;
/** Lista todos los usuarios de un dominio */
export declare function listAllUsers(domain: string): Promise<{
    id: string;
    primaryEmail: string;
    name: {
        fullName: any;
        givenName: any;
        familyName: any;
    };
    suspended: boolean;
}[]>;
//# sourceMappingURL=googleDirectory.d.ts.map