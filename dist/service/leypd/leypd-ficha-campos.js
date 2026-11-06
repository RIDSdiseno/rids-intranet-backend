// src/service/leypd/leypd-ficha-campos.ts
export const FICHA_LEYPD_GRUPOS = [
    {
        key: "DATOS_EMPRESA",
        orden: 1,
        titulo: "Datos de la empresa",
    },
    {
        key: "SITIO_WEB",
        orden: 2,
        titulo: "Sitio web",
    },
    {
        key: "RESPONSABLES",
        orden: 3,
        titulo: "Responsables",
    },
    {
        key: "TRATAMIENTO_DATOS",
        orden: 4,
        titulo: "Qué datos se tratan y por cuánto tiempo",
    },
    {
        key: "APROBACIONES_FECHAS",
        orden: 5,
        titulo: "Aprobaciones y fechas",
    },
];
/* =====================================================
   CATÁLOGO OFICIAL — 24 PREGUNTAS
===================================================== */
export const FICHA_LEYPD_CAMPOS = [
    /* =================================================
       1. DATOS DE LA EMPRESA
    ================================================= */
    {
        numero: 1,
        key: "razonSocial",
        grupo: "DATOS_EMPRESA",
        label: "Razón social",
        descripcion: "Razón social oficial de la empresa.",
        tipo: "text",
        obligatorio: true,
        elementos: [
            1,
            6,
        ],
        precarga: true,
        placeholder: "Razón social de la empresa",
    },
    {
        numero: 2,
        key: "rut",
        grupo: "DATOS_EMPRESA",
        label: "RUT de la empresa",
        descripcion: "Ingrese el RUT en formato 12.345.678-9.",
        tipo: "text",
        obligatorio: true,
        elementos: [
            1,
            6,
        ],
        precarga: true,
        placeholder: "12.345.678-9",
    },
    {
        numero: 3,
        key: "domicilioLegal",
        grupo: "DATOS_EMPRESA",
        label: "Domicilio legal",
        descripcion: "Dirección legal principal de la empresa.",
        tipo: "text",
        obligatorio: true,
        elementos: [
            1,
            6,
        ],
        precarga: true,
        placeholder: "Dirección legal de la empresa",
    },
    {
        numero: 4,
        key: "contactoOficialEmpresa",
        grupo: "DATOS_EMPRESA",
        label: "Correo y teléfono de contacto oficiales de la empresa",
        descripcion: "Estos datos serán utilizados como contacto oficial en el aviso legal.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            6,
        ],
        precarga: true,
        placeholder: "Correo electrónico y teléfono oficial",
    },
    /* =================================================
       2. SITIO WEB
    ================================================= */
    {
        numero: 5,
        key: "sitioWeb",
        grupo: "SITIO_WEB",
        label: "Dirección del sitio web de la empresa",
        descripcion: "Si la empresa no posee sitio web, responda «No tiene».",
        tipo: "text",
        obligatorio: true,
        elementos: [
            1,
            2,
            3,
            7,
        ],
        precarga: true,
        placeholder: "https://empresa.cl o No tiene",
    },
    {
        numero: 6,
        key: "hostingProveedor",
        grupo: "SITIO_WEB",
        label: "Proveedor de hosting del sitio web",
        descripcion: "Proveedor donde se encuentra alojado el sitio web de la empresa.",
        tipo: "text",
        obligatorio: false,
        elementos: [
            1,
        ],
        precarga: true,
        placeholder: "Proveedor de hosting",
    },
    {
        numero: 7,
        key: "administradorSitioWeb",
        grupo: "SITIO_WEB",
        label: "¿Quién administra el sitio web?",
        descripcion: "Indique la persona o proveedor que puede instalar el banner de cookies y publicar las políticas.",
        tipo: "textarea",
        obligatorio: false,
        elementos: [
            3,
        ],
        precarga: false,
        placeholder: "Nombre, empresa/proveedor y datos de contacto",
    },
    /* =================================================
       3. RESPONSABLES
    ================================================= */
    {
        numero: 8,
        key: "correoPrivacidad",
        grupo: "RESPONSABLES",
        label: "Correo para solicitudes de privacidad",
        descripcion: "Se recomienda utilizar un correo dedicado, por ejemplo privacidad@empresa.cl.",
        tipo: "email",
        obligatorio: true,
        elementos: [
            1,
            6,
            12,
        ],
        precarga: false,
        placeholder: "privacidad@empresa.cl",
    },
    {
        numero: 9,
        key: "responsableDerechosTitulares",
        grupo: "RESPONSABLES",
        label: "¿Quién atiende las solicitudes de derechos de las personas?",
        descripcion: "Indique nombre, cargo y teléfono del responsable.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            12,
        ],
        precarga: true,
        placeholder: "Nombre, cargo y teléfono",
    },
    {
        numero: 10,
        key: "responsableIncidentesSeguridad",
        grupo: "RESPONSABLES",
        label: "Responsable de la empresa ante incidentes de seguridad",
        descripcion: "Persona que recibirá o gestionará avisos urgentes relacionados con incidentes de seguridad.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            11,
        ],
        precarga: true,
        placeholder: "Nombre, cargo, teléfono y correo",
    },
    {
        numero: 11,
        key: "responsableRegistroConsentimientos",
        grupo: "RESPONSABLES",
        label: "¿Quién mantiene el registro de consentimientos?",
        descripcion: "Indique la persona o cargo responsable de mantener y revisar el registro de consentimientos.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            4,
        ],
        precarga: false,
        placeholder: "Nombre y cargo del responsable",
    },
    /* =================================================
       4. QUÉ DATOS SE TRATAN Y POR CUÁNTO TIEMPO
    ================================================= */
    {
        numero: 12,
        key: "fuentesDatosPersonales",
        grupo: "TRATAMIENTO_DATOS",
        label: "¿Dónde recoge datos personales la empresa y qué datos?",
        descripcion: "Indique los puntos de recopilación de datos personales y los tipos de datos obtenidos en cada uno.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            1,
            5,
        ],
        precarga: false,
        placeholder: "Sitio web, formularios, correo, contratos, atención presencial, etc.",
    },
    {
        numero: 13,
        key: "canalesDatosSalud",
        grupo: "TRATAMIENTO_DATOS",
        label: "¿Por qué canales recibe datos de salud de pacientes?",
        descripcion: "Indique los canales utilizados para recibir o tratar información de salud.",
        tipo: "textarea",
        obligatorio: false,
        elementos: [
            1,
        ],
        precarga: false,
        condicion: "RUBRO_SALUD",
        placeholder: "Correo, plataforma clínica, formulario, WhatsApp, etc.",
    },
    {
        numero: 14,
        key: "canalPostulacionesCurriculum",
        grupo: "TRATAMIENTO_DATOS",
        label: "¿Por qué canal recibe postulaciones y cuánto tiempo guarda los currículum?",
        descripcion: "Indique los canales de recepción de postulaciones y el período general de conservación de currículum.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            1,
        ],
        precarga: false,
        condicion: "EMPRESA_PERSONAS",
        placeholder: "Portal laboral, correo, formulario web y plazo de conservación",
    },
    {
        numero: 15,
        key: "plazosConservacionDatos",
        grupo: "TRATAMIENTO_DATOS",
        label: "Plazos de conservación por tipo de dato y quién elimina al vencer",
        descripcion: "Indique los principales tipos de datos, su período de conservación y quién es responsable de eliminarlos al finalizar dicho plazo.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            1,
            12,
        ],
        precarga: false,
        placeholder: "Ej.: clientes 5 años — elimina Administración",
    },
    {
        numero: 16,
        key: "plazoCurriculumNoSeleccionados",
        grupo: "TRATAMIENTO_DATOS",
        label: "Plazo de conservación del currículum de postulantes no seleccionados",
        descripcion: "Indique cuánto tiempo se conservarán los currículum de candidatos que no fueron seleccionados.",
        tipo: "text",
        obligatorio: false,
        elementos: [
            6,
        ],
        precarga: false,
        placeholder: "Ej.: 6 meses",
    },
    {
        numero: 17,
        key: "sistemasConUsuarioContrasena",
        grupo: "TRATAMIENTO_DATOS",
        label: "Sistemas del negocio que utilizan usuario y contraseña",
        descripcion: "Liste ERP, banca, SII u otros sistemas relevantes. No incluya contraseñas.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            9,
        ],
        precarga: true,
        placeholder: "ERP, Microsoft 365, banca, SII, CRM, etc. No incluir contraseñas.",
    },
    {
        numero: 18,
        key: "condicionesCompraOnline",
        grupo: "TRATAMIENTO_DATOS",
        label: "Condiciones de compra del sitio",
        descripcion: "Indique condiciones relacionadas con IVA, despacho, devoluciones y derecho a retracto.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            6,
        ],
        precarga: false,
        condicion: "VENTA_ONLINE",
        placeholder: "IVA, despacho, devoluciones, retracto, etc.",
    },
    {
        numero: 19,
        key: "responsableDatosTrabajadoresDestinados",
        grupo: "TRATAMIENTO_DATOS",
        label: "En contratos con empresas usuarias, ¿quién es responsable de los datos de los trabajadores destinados?",
        descripcion: "Defina la responsabilidad respecto de los datos personales de trabajadores destinados a empresas usuarias.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            6,
        ],
        precarga: false,
        condicion: "EMPRESA_PERSONAS",
        placeholder: "Indique empresa responsable, contraparte o distribución de responsabilidades",
    },
    /* =================================================
       5. APROBACIONES Y FECHAS
    ================================================= */
    {
        numero: 20,
        key: "fechaPublicacionPoliticaPrivacidad",
        grupo: "APROBACIONES_FECHAS",
        label: "Fecha de publicación de la Política de Privacidad",
        descripcion: "Fecha en la que la política de privacidad fue o será publicada.",
        tipo: "date",
        obligatorio: false,
        elementos: [
            1,
        ],
        precarga: false,
    },
    {
        numero: 21,
        key: "aprobacionPoliticaPrivacidad",
        grupo: "APROBACIONES_FECHAS",
        label: "Aprobación de la Política de Privacidad",
        descripcion: "Indique nombre y cargo de quien aprueba la política, junto con la fecha de aprobación.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            1,
        ],
        precarga: false,
        placeholder: "Nombre, cargo y fecha de aprobación",
    },
    {
        numero: 22,
        key: "aprobacionPoliticaSeguridad",
        grupo: "APROBACIONES_FECHAS",
        label: "Aprobación de la Política de Seguridad",
        descripcion: "Indique responsable, cargo y fecha de aprobación de la Política de Seguridad.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            10,
        ],
        precarga: false,
        placeholder: "Nombre, cargo y fecha de aprobación",
    },
    {
        numero: 23,
        key: "fechaActivacionMfa",
        grupo: "APROBACIONES_FECHAS",
        label: "Fecha de activación de la verificación en dos pasos (MFA)",
        descripcion: "Fecha en que se activó o se planifica activar MFA para los usuarios.",
        tipo: "date",
        obligatorio: false,
        elementos: [
            9,
        ],
        precarga: false,
    },
    {
        numero: 24,
        key: "clausulaResguardoPostContrato",
        grupo: "APROBACIONES_FECHAS",
        label: "Cláusula de resguardo al término del contrato",
        descripcion: "Indique aprobación y plazo acordado para el resguardo de información al finalizar el contrato. La propuesta base es de 5 años desde el término.",
        tipo: "textarea",
        obligatorio: true,
        elementos: [
            13,
        ],
        precarga: false,
        placeholder: "Aprobación, responsable y plazo de resguardo",
    },
];
/* =====================================================
   CONSTANTES
===================================================== */
export const TOTAL_CAMPOS_FICHA_LEYPD = FICHA_LEYPD_CAMPOS.length;
export const TOTAL_GRUPOS_FICHA_LEYPD = FICHA_LEYPD_GRUPOS.length;
/* =====================================================
   HELPERS
===================================================== */
export function obtenerCampoFichaLeypd(key) {
    return FICHA_LEYPD_CAMPOS.find((campo) => campo.key === key);
}
export function obtenerCampoFichaLeypdPorNumero(numero) {
    return FICHA_LEYPD_CAMPOS.find((campo) => campo.numero === numero);
}
export function obtenerCamposGrupoFichaLeypd(grupo) {
    return FICHA_LEYPD_CAMPOS.filter((campo) => campo.grupo === grupo);
}
export function obtenerCamposElementoLeypd(elementoNumero) {
    return FICHA_LEYPD_CAMPOS.filter((campo) => campo.elementos.includes(elementoNumero));
}
export function obtenerCamposConPrecargaLeypd() {
    return FICHA_LEYPD_CAMPOS.filter((campo) => campo.precarga);
}
export function obtenerCamposCondicionalesLeypd() {
    return FICHA_LEYPD_CAMPOS.filter((campo) => Boolean(campo.condicion));
}
/* =====================================================
   VALIDACIÓN DEL CATÁLOGO
===================================================== */
export function validarCatalogoFichaLeypd() {
    /* =========================
       TOTAL DE PREGUNTAS
    ========================= */
    if (FICHA_LEYPD_CAMPOS.length !==
        24) {
        throw new Error(`[LEYPD] La ficha debe contener exactamente 24 preguntas. Actualmente contiene ${FICHA_LEYPD_CAMPOS.length}.`);
    }
    /* =========================
       TOTAL DE GRUPOS
    ========================= */
    if (FICHA_LEYPD_GRUPOS.length !==
        5) {
        throw new Error(`[LEYPD] La ficha debe contener exactamente 5 grupos. Actualmente contiene ${FICHA_LEYPD_GRUPOS.length}.`);
    }
    /* =========================
       KEYS DUPLICADAS
    ========================= */
    const keys = FICHA_LEYPD_CAMPOS.map((campo) => campo.key);
    const keysDuplicadas = keys.filter((key, index) => keys.indexOf(key) !==
        index);
    if (keysDuplicadas.length >
        0) {
        throw new Error(`[LEYPD] Existen keys duplicadas en la ficha: ${[
            ...new Set(keysDuplicadas),
        ].join(", ")}`);
    }
    /* =========================
       NÚMEROS DUPLICADOS
    ========================= */
    const numeros = FICHA_LEYPD_CAMPOS.map((campo) => campo.numero);
    const numerosDuplicados = numeros.filter((numero, index) => numeros.indexOf(numero) !==
        index);
    if (numerosDuplicados.length >
        0) {
        throw new Error(`[LEYPD] Existen números de pregunta duplicados: ${[
            ...new Set(numerosDuplicados),
        ].join(", ")}`);
    }
    /* =========================
       SECUENCIA 1 → 24
    ========================= */
    for (let numero = 1; numero <= 24; numero++) {
        if (!numeros.includes(numero)) {
            throw new Error(`[LEYPD] Falta la pregunta número ${numero}.`);
        }
    }
    /* =========================
       ELEMENTOS VÁLIDOS
    ========================= */
    for (const campo of FICHA_LEYPD_CAMPOS) {
        if (campo.elementos.length ===
            0) {
            throw new Error(`[LEYPD] El campo "${campo.key}" no está asociado a ningún elemento.`);
        }
        for (const elemento of campo.elementos) {
            if (elemento <
                1 ||
                elemento >
                    13) {
                throw new Error(`[LEYPD] El campo "${campo.key}" referencia un elemento inválido: ${elemento}.`);
            }
        }
    }
}
/* =====================================================
   VALIDACIÓN AL CARGAR EL MÓDULO
===================================================== */
validarCatalogoFichaLeypd();
//# sourceMappingURL=leypd-ficha-campos.js.map