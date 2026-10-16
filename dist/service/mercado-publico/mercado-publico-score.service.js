const PALABRAS_CLAVE = [
    {
        terminos: [
            "soporte informatico",
            "soporte informático",
            "soporte ti",
            "mesa de ayuda",
            "help desk",
            "helpdesk",
        ],
        puntos: 25,
    },
    {
        terminos: [
            "mantencion computadores",
            "mantención computadores",
            "mantenimiento computadores",
            "mantenimiento informatico",
            "mantenimiento informático",
        ],
        puntos: 20,
    },
    {
        terminos: [
            "notebook",
            "laptop",
            "computador",
            "computadores",
            "pc",
            "equipamiento computacional",
            "equipos computacionales",
        ],
        puntos: 15,
    },
    {
        terminos: [
            "servidor",
            "servidores",
            "storage",
            "nas",
        ],
        puntos: 15,
    },
    {
        terminos: [
            "redes",
            "red",
            "switch",
            "router",
            "wifi",
            "cableado estructurado",
        ],
        puntos: 15,
    },
    {
        terminos: [
            "microsoft 365",
            "office 365",
            "licencias microsoft",
            "licenciamiento",
        ],
        puntos: 15,
    },
    {
        terminos: [
            "ciberseguridad",
            "firewall",
            "antivirus",
            "seguridad informatica",
            "seguridad informática",
        ],
        puntos: 20,
    },
    {
        terminos: [
            "desarrollo web",
            "desarrollo software",
            "sistema web",
            "aplicacion web",
            "aplicación web",
        ],
        puntos: 15,
    },
];
function normalizar(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
function escaparRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function contieneTermino(texto, termino) {
    const terminoNormalizado = normalizar(termino).trim();
    if (!terminoNormalizado) {
        return false;
    }
    /*
     * Para expresiones de varias palabras:
     *
     * soporte informatico
     * microsoft 365
     * mesa de ayuda
     *
     * hacemos coincidencia directa.
     */
    if (terminoNormalizado.includes(" ")) {
        return texto.includes(terminoNormalizado);
    }
    /*
     * Para palabras individuales:
     *
     * pc
     * nas
     * wifi
     * switch
     *
     * se exige palabra completa para evitar
     * falsos positivos.
     */
    const expresion = new RegExp(`(^|[^a-z0-9])${escaparRegex(terminoNormalizado)}([^a-z0-9]|$)`, "i");
    return expresion.test(texto);
}
export function calcularScoreMercadoPublico({ nombre, descripcion, items, montoEstimado, fechaCierre, }) {
    const texto = normalizar([
        nombre,
        descripcion,
        ...(items ?? [])
            .flatMap((item) => [
            item.nombre,
            item.descripcion,
            item.categoria,
        ]),
    ]
        .filter(Boolean)
        .join(" "));
    /*
     * Separamos la afinidad tecnológica
     * de la conveniencia comercial.
     */
    let scoreAfinidad = 0;
    let scoreComercial = 0;
    const coincidencias = new Set();
    // ==========================================
    // AFINIDAD TECNOLÓGICA
    // ==========================================
    for (const grupo of PALABRAS_CLAVE) {
        const encontrada = grupo.terminos.find((termino) => contieneTermino(texto, termino));
        if (encontrada) {
            scoreAfinidad +=
                grupo.puntos;
            coincidencias.add(encontrada);
        }
    }
    /*
     * Una licitación sin ninguna señal TI
     * no puede convertirse en oportunidad
     * solo por monto o plazo.
     */
    const tieneAfinidadTecnica = scoreAfinidad > 0;
    if (!tieneAfinidadTecnica) {
        return {
            score: 0,
            scoreAfinidad: 0,
            scoreComercial: 0,
            tieneAfinidadTecnica: false,
            nivel: "BAJA",
            coincidencias: [],
        };
    }
    // ==========================================
    // MONTO
    // ==========================================
    if (montoEstimado &&
        montoEstimado >=
            20_000_000) {
        scoreComercial +=
            15;
    }
    else if (montoEstimado &&
        montoEstimado >=
            5_000_000) {
        scoreComercial +=
            10;
    }
    else if (montoEstimado &&
        montoEstimado >=
            1_000_000) {
        scoreComercial +=
            5;
    }
    // ==========================================
    // PLAZO
    // ==========================================
    if (fechaCierre) {
        const dias = Math.ceil((fechaCierre.getTime() -
            Date.now()) /
            86_400_000);
        if (dias >=
            5) {
            scoreComercial +=
                10;
        }
        else if (dias >=
            2) {
            scoreComercial +=
                5;
        }
    }
    // ==========================================
    // SCORE FINAL
    // ==========================================
    const score = Math.max(0, Math.min(100, scoreAfinidad +
        scoreComercial));
    let nivel;
    if (score >=
        85) {
        nivel =
            "MUY_ALTA";
    }
    else if (score >=
        65) {
        nivel =
            "ALTA";
    }
    else if (score >=
        40) {
        nivel =
            "MEDIA";
    }
    else {
        nivel =
            "BAJA";
    }
    return {
        score,
        scoreAfinidad,
        scoreComercial,
        tieneAfinidadTecnica,
        nivel,
        coincidencias: Array.from(coincidencias),
    };
}
//# sourceMappingURL=mercado-publico-score.service.js.map