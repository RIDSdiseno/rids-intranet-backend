export type AnioPcOrigen = "AUTO" | "MANUAL" | "NO_DETERMINADO";
type ResultadoAnioPc = {
    anioPc: number | null;
    anioPcOrigen: AnioPcOrigen;
};
export declare function calcularAnioPcDesdeSerial(serial?: string | null, marca?: string | null, modelo?: string | null, procesador?: string | null): ResultadoAnioPc;
export declare function normalizarAnioPc(value: unknown): number | null;
export {};
//# sourceMappingURL=anio-pc.util.d.ts.map