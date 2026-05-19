// src/utils/equipos/anio-pc.util.ts

export type AnioPcOrigen = "AUTO" | "MANUAL" | "NO_DETERMINADO";

const ANIO_PC_MIN = 2010;

type ResultadoAnioPc = {
    anioPc: number | null;
    anioPcOrigen: AnioPcOrigen;
};

function validarAnio(anio: number): number | null {
    const anioActual = new Date().getFullYear();

    if (!Number.isInteger(anio)) return null;

    if (anio < ANIO_PC_MIN || anio > anioActual + 1) {
        return null;
    }

    return anio;
}

function detectarAnioExplicito(texto?: string | null): number | null {
    const limpio = texto?.trim().toUpperCase() ?? "";

    const match = limpio.match(/20\d{2}/);

    if (!match) return null;

    return validarAnio(Number(match[0]));
}

function detectarAnioPorModelo(
    modelo?: string | null,
    marca?: string | null
): number | null {
    const modeloLimpio = modelo?.trim().toUpperCase() ?? "";
    const marcaLimpia = marca?.trim().toUpperCase() ?? "";

    if (!modeloLimpio) return null;

    /**
     * Si el modelo trae año explícito.
     * Ej: "HP 2021", "Latitude 2020", etc.
     */
    const anioExplicito = detectarAnioExplicito(modeloLimpio);
    if (anioExplicito) return anioExplicito;

    /**
     * Lenovo ThinkPad Gen aproximado:
     * Gen 1 -> 2020
     * Gen 2 -> 2021
     * Gen 3 -> 2022
     * Gen 4 -> 2023
     * Gen 5 -> 2024
     * Gen 6 -> 2025
     */
    if (marcaLimpia.includes("LENOVO") || modeloLimpio.includes("THINKPAD")) {
        const genMatch = modeloLimpio.match(/\bGEN\s?(\d+)\b/);

        if (genMatch) {
            const gen = Number(genMatch[1]);
            const anioEstimado = 2019 + gen;

            return validarAnio(anioEstimado);
        }
    }

    /**
     * HP EliteBook generación G.
     * Ej:
     * EliteBook 840 G3 -> 2016 aprox.
     * EliteBook 840 G4 -> 2017 aprox.
     * EliteBook 840 G5 -> 2018 aprox.
     * EliteBook 840 G6 -> 2019 aprox.
     * EliteBook 840 G7 -> 2020 aprox.
     * EliteBook 840 G8 -> 2021 aprox.
     * EliteBook 840 G9 -> 2022 aprox.
     * EliteBook 840 G10 -> 2023 aprox.
     */
    if (marcaLimpia.includes("HP") || modeloLimpio.includes("ELITEBOOK")) {
        const hpGenMatch = modeloLimpio.match(/\bG\s?(\d{1,2})\b/);

        if (hpGenMatch) {
            const gen = Number(hpGenMatch[1]);

            const mapaHpEliteBook: Record<number, number> = {
                1: 2013,
                2: 2014,
                3: 2016,
                4: 2017,
                5: 2018,
                6: 2019,
                7: 2020,
                8: 2021,
                9: 2022,
                10: 2023,
                11: 2024,
            };

            const anioEstimado = mapaHpEliteBook[gen];

            if (anioEstimado) {
                return validarAnio(anioEstimado);
            }
        }
    }

    /**
 * Dell Latitude.
 * Ejemplos aproximados:
 * Latitude 5280 / 5480 / 5580 -> 2017
 * Latitude 5290 / 5490 / 5590 -> 2018
 * Latitude 5400 / 5500 -> 2019
 * Latitude 5410 / 5510 -> 2020
 * Latitude 5420 / 5520 -> 2021
 * Latitude 5430 / 5530 -> 2022
 * Latitude 5440 / 5540 -> 2023
 * Latitude 5450 / 5550 -> 2024
 */
    if (marcaLimpia.includes("DELL") || modeloLimpio.includes("LATITUDE")) {
        const latitudeMatch = modeloLimpio.match(/\bLATITUDE\s+(\d{4})\b/);

        if (latitudeMatch) {
            const modeloDell = Number(latitudeMatch[1]);

            const mapaDellLatitude: Record<number, number> = {
                5280: 2017,
                5480: 2017,
                5580: 2017,

                5290: 2018,
                5490: 2018,
                5590: 2018,

                5300: 2019,
                5400: 2019,
                5500: 2019,

                5310: 2020,
                5410: 2020,
                5510: 2020,

                5320: 2021,
                5420: 2021,
                5520: 2021,

                5330: 2022,
                5430: 2022,
                5530: 2022,

                5340: 2023,
                5440: 2023,
                5540: 2023,

                5350: 2024,
                5450: 2024,
                5550: 2024,
            };

            const anioEstimado = mapaDellLatitude[modeloDell];

            if (anioEstimado) {
                return validarAnio(anioEstimado);
            }
        }
    }

    return null;
}

function detectarAnioHpPorSerial(serial?: string | null): number | null {
    const serialLimpio = serial?.trim().toUpperCase() ?? "";

    if (!serialLimpio) return null;

    const posibleDigitoAnio = serialLimpio[3];

    if (!posibleDigitoAnio || !/^[0-9]$/.test(posibleDigitoAnio)) {
        return null;
    }

    const digito = Number(posibleDigitoAnio);
    const anioActual = new Date().getFullYear();

    const candidatos = [2010 + digito, 2020 + digito]
        .map(validarAnio)
        .filter((anio): anio is number => anio !== null);

    if (candidatos.length === 0) return null;

    /**
     * Evita elegir 2026 para equipos antiguos.
     * Si hay dos candidatos válidos, preferimos el menor.
     * Esto es más seguro para inventario corporativo,
     * porque muchos seriales antiguos pueden caer en la década equivocada.
     */
    if (candidatos.length > 1) {
        return Math.min(...candidatos);
    }

    return candidatos[0] ?? null;
}

export function calcularAnioPcDesdeSerial(
    serial?: string | null,
    marca?: string | null,
    modelo?: string | null,
    procesador?: string | null
): ResultadoAnioPc {
    const serialLimpio = serial?.trim().toUpperCase() ?? "";
    const marcaLimpia = marca?.trim().toUpperCase() ?? "";

    if (!serialLimpio && !modelo) {
        return {
            anioPc: null,
            anioPcOrigen: "NO_DETERMINADO",
        };
    }

    /**
     * 1. Año explícito en serial.
     */
    const anioEnSerial = detectarAnioExplicito(serialLimpio);

    if (anioEnSerial) {
        return {
            anioPc: anioEnSerial,
            anioPcOrigen: "AUTO",
        };
    }

    /**
     * 2. Modelo/generación.
     * Esto debe ir antes del fallback HP por serial.
     */
    const anioPorModelo = detectarAnioPorModelo(modelo, marca);

    if (anioPorModelo) {
        return {
            anioPc: anioPorModelo,
            anioPcOrigen: "AUTO",
        };
    }

    /**
     * 3. Fallback HP por serial.
     * Solo si no pudimos obtener nada desde el modelo.
     */
    if (marcaLimpia.includes("HP") || marcaLimpia.includes("HEWLETT")) {
        const anioHpSerial = detectarAnioHpPorSerial(serialLimpio);

        if (anioHpSerial) {
            return {
                anioPc: anioHpSerial,
                anioPcOrigen: "AUTO",
            };
        }
    }

    const anioPorProcesador = detectarAnioPorProcesador(procesador);

    if (anioPorProcesador) {
        return {
            anioPc: anioPorProcesador,
            anioPcOrigen: "AUTO",
        };
    }

    return {
        anioPc: null,
        anioPcOrigen: "NO_DETERMINADO",
    };
}

export function normalizarAnioPc(value: unknown): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    return validarAnio(Number(value));
}

function detectarAnioPorProcesador(procesador?: string | null): number | null {
    const cpu = procesador?.trim().toUpperCase() ?? "";

    if (!cpu) return null;

    /**
     * Intel Core formato común:
     * i5-3340M  -> generación 3 -> 2013 aprox
     * i7-6600U  -> generación 6 -> 2016 aprox
     * i5-7300U  -> generación 7 -> 2017 aprox
     * i5-8250U  -> generación 8 -> 2018 aprox
     * i5-10210U -> generación 10 -> 2020 aprox
     * i5-1135G7 -> generación 11 -> 2021 aprox
     * i5-1240P  -> generación 12 -> 2022 aprox
     * i5-1335U  -> generación 13 -> 2023 aprox
     */
    const intelMatch = cpu.match(/\bI[3579][-\s]?(\d{4,5})[A-Z0-9]*\b/);

    if (intelMatch) {
        const modeloCpu = intelMatch[1];

        if (!modeloCpu) return null;

        let gen: number | null = null;

        if (modeloCpu.length === 4) {
            // Ej: 3340, 6600, 7300, 8250
            gen = Number(modeloCpu[0]);
        } else if (modeloCpu.length === 5) {
            // Ej: 10210, 1135, 1240, 1335
            gen = Number(modeloCpu.slice(0, 2));
        }

        if (!gen || !Number.isFinite(gen)) return null;

        const mapaIntelGen: Record<number, number> = {
            1: 2010,
            2: 2011,
            3: 2013,
            4: 2014,
            5: 2015,
            6: 2016,
            7: 2017,
            8: 2018,
            9: 2019,
            10: 2020,
            11: 2021,
            12: 2022,
            13: 2023,
            14: 2024,
        };

        const anioEstimado = mapaIntelGen[gen];

        if (anioEstimado) {
            return validarAnio(anioEstimado);
        }
    }

    /**
     * AMD Ryzen formato común:
     * Ryzen 5 3500U -> 2019 aprox
     * Ryzen 5 4500U -> 2020 aprox
     * Ryzen 5 5500U -> 2021 aprox
     * Ryzen 5 5600U -> 2021 aprox
     * Ryzen 5 6600U -> 2022 aprox
     * Ryzen 7 7730U -> 2023 aprox
     */
    const ryzenMatch = cpu.match(/\bRYZEN\s?[3579]\s?(\d{4})[A-Z0-9]*\b/);

    if (ryzenMatch) {
        const modeloRyzen = ryzenMatch[1];

        if (!modeloRyzen) return null;

        const serie = Number(modeloRyzen[0]);

        const mapaRyzenSerie: Record<number, number> = {
            2: 2018,
            3: 2019,
            4: 2020,
            5: 2021,
            6: 2022,
            7: 2023,
            8: 2024,
        };

        const anioEstimado = mapaRyzenSerie[serie];

        if (anioEstimado) {
            return validarAnio(anioEstimado);
        }
    }

    return null;
}