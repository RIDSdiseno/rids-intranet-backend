import type { NivelAfinidadMercadoPublico } from "@prisma/client";
export declare function calcularScoreMercadoPublico({ nombre, descripcion, items, montoEstimado, fechaCierre, }: {
    nombre?: string | null;
    descripcion?: string | null;
    items?: Array<{
        nombre?: string | null;
        descripcion?: string | null;
        categoria?: string | null;
    }>;
    montoEstimado?: number | null;
    fechaCierre?: Date | null;
}): {
    score: number;
    scoreAfinidad: number;
    scoreComercial: number;
    tieneAfinidadTecnica: boolean;
    nivel: NivelAfinidadMercadoPublico;
    coincidencias: never[];
} | {
    score: number;
    scoreAfinidad: number;
    scoreComercial: number;
    tieneAfinidadTecnica: true;
    nivel: import("@prisma/client").$Enums.NivelAfinidadMercadoPublico;
    coincidencias: string[];
};
//# sourceMappingURL=mercado-publico-score.service.d.ts.map