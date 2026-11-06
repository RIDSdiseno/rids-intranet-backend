// src/service/leypd/leypd-catalogo.ts
/* =====================================================
   CATÁLOGO OFICIAL LEY PD
===================================================== */
export const LEYPD_ELEMENTOS = [
    {
        numero: 1,
        codigo: "01",
        titulo: "Política de Privacidad actualizada",
        carpeta: "01 Política de Privacidad",
        descripcion: "Revisión, elaboración y actualización de la política de privacidad aplicable a la empresa.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Politica_Privacidad",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Revision_Politica_Privacidad",
                tipo: "DOCX",
                condicional: true,
            },
        ],
    },
    {
        numero: 2,
        codigo: "02",
        titulo: "Política de Cookies",
        carpeta: "02 Política de Cookies",
        descripcion: "Política que informa y regula el uso de cookies y tecnologías similares.",
        aplicabilidad: "CONDICIONAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Politica_Cookies",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 3,
        codigo: "03",
        titulo: "Banner de consentimiento para cookies",
        carpeta: "03 Banner de Cookies",
        descripcion: "Implementación del mecanismo de información y consentimiento para cookies.",
        aplicabilidad: "CONDICIONAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Implementacion_Banner",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "banner-cookies",
                tipo: "JS",
            },
        ],
    },
    {
        numero: 4,
        codigo: "04",
        titulo: "Gestión del consentimiento",
        carpeta: "04 Gestión del Consentimiento",
        descripcion: "Gestión, comunicación y respaldo de los consentimientos relacionados con el tratamiento de datos.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Procedimiento_Consentimiento",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Politica_Uso_TI_y_Datos",
                tipo: "DOCX",
            },
            {
                orden: 3,
                nombreBase: "Registro_Consentimientos",
                tipo: "XLSX",
            },
            {
                orden: 4,
                nombreBase: "Comunicacion_Usuarios",
                tipo: "CARPETA",
            },
            {
                orden: 1,
                nombreBase: "Correo_Usuarios",
                tipo: "DOCX",
                subcarpeta: "Comunicacion_Usuarios",
            },
        ],
    },
    {
        numero: 5,
        codigo: "05",
        titulo: "Formularios adaptados a la normativa",
        carpeta: "05 Formularios",
        descripcion: "Revisión y adecuación de formularios y textos utilizados para recopilar datos personales.",
        aplicabilidad: "CONDICIONAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Revision_Formularios",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Textos_Formulario_y_Chat",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 6,
        codigo: "06",
        titulo: "Avisos legales",
        carpeta: "06 Avisos Legales",
        descripcion: "Avisos legales y cláusulas informativas aplicables al tratamiento de datos.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Aviso_Legal",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Clausulas_Informativas",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 7,
        codigo: "07",
        titulo: "Certificado SSL",
        carpeta: "07 Certificado SSL",
        descripcion: "Verificación y respaldo de certificados SSL/TLS utilizados por los servicios web de la empresa.",
        aplicabilidad: "CONDICIONAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Certificado_SSL",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 8,
        codigo: "08",
        titulo: "Protección de accesos administrativos",
        carpeta: "08 Accesos Administrativos",
        descripcion: "Definición y control de cuentas con privilegios administrativos.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Estandar_Accesos_Administrativos",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Inventario_Cuentas_Admin",
                tipo: "XLSX",
            },
        ],
    },
    {
        numero: 9,
        codigo: "09",
        titulo: "Autenticación en dos pasos (2FA)",
        carpeta: "09 Autenticación 2FA",
        descripcion: "Planificación, implementación y control de cobertura de autenticación multifactor.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Plan_MFA",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Cobertura_MFA",
                tipo: "XLSX",
            },
        ],
    },
    {
        numero: 10,
        codigo: "10",
        titulo: "Medidas de ciberseguridad",
        carpeta: "10 Ciberseguridad",
        descripcion: "Políticas, controles y evaluación general del estado de ciberseguridad.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Politica_Seguridad",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Estado_Ciberseguridad",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 11,
        codigo: "11",
        titulo: "Protección frente a accesos no autorizados",
        carpeta: "11 Accesos No Autorizados",
        descripcion: "Procedimientos y registros asociados a incidentes, vulneraciones y accesos no autorizados.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Protocolo_Vulneraciones",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Registro_Incidentes",
                tipo: "XLSX",
            },
            {
                orden: 3,
                nombreBase: "Guia_ANCI",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 12,
        codigo: "12",
        titulo: "Procedimientos para la gestión de datos personales",
        carpeta: "12 Procedimientos Datos Personales",
        descripcion: "Procedimientos internos para derechos de titulares, solicitudes, soporte y operaciones relacionadas con datos personales.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Expediente_Ley21719",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Procedimiento_Derechos_Titulares",
                tipo: "DOCX",
            },
            {
                orden: 3,
                nombreBase: "Registro_Solicitudes",
                tipo: "XLSX",
            },
            {
                orden: 4,
                nombreBase: "Procedimientos_Soporte_TI",
                tipo: "DOCX",
            },
            {
                orden: 5,
                nombreBase: "Politica_Visitas",
                tipo: "DOCX",
            },
        ],
    },
    {
        numero: 13,
        codigo: "13",
        titulo: "Resguardo de información al término del contrato",
        carpeta: "13 Resguardo Post Contrato",
        descripcion: "Medidas contractuales y operacionales para proteger la información al finalizar la relación contractual.",
        aplicabilidad: "GENERAL",
        documentos: [
            {
                orden: 1,
                nombreBase: "Anexo_Encargo_Tratamiento",
                tipo: "DOCX",
            },
            {
                orden: 2,
                nombreBase: "Clausula_Resguardo_Post_Contrato",
                tipo: "DOCX",
            },
        ],
    },
];
/* =====================================================
   CONSTANTES
===================================================== */
export const TOTAL_ELEMENTOS_LEYPD = LEYPD_ELEMENTOS.length;
/* =====================================================
   HELPERS
===================================================== */
export function obtenerElementoCatalogo(numero) {
    return LEYPD_ELEMENTOS.find((item) => item.numero === numero);
}
export function obtenerElementoCatalogoPorCodigo(codigo) {
    return LEYPD_ELEMENTOS.find((item) => item.codigo === codigo);
}
export function obtenerCarpetaElementoLeypd(numero) {
    return (obtenerElementoCatalogo(numero)?.carpeta ??
        null);
}
export function formatearNumeroLeypd(numero) {
    return String(numero).padStart(2, "0");
}
export function generarNombreFichaElemento(numero, cliente) {
    return (`00 Ficha Elemento ` +
        `${formatearNumeroLeypd(numero)} ` +
        `${cliente}.docx`);
}
export function generarNombreInformeElemento(numero, cliente) {
    return (`00 Informe RIDS Elemento ` +
        `${formatearNumeroLeypd(numero)} ` +
        `${cliente}.pdf`);
}
export function generarNombreChecklistLeypd(cliente) {
    return (`00 Checklist LEYPD ` +
        `${cliente}.xlsx`);
}
export function generarNombreDocumentoLeypd(documento, cliente) {
    if (documento.tipo ===
        "CARPETA") {
        return documento.nombreBase;
    }
    const orden = String(documento.orden).padStart(2, "0");
    switch (documento.tipo) {
        case "DOCX":
            return `${orden} ${documento.nombreBase}_${cliente}.docx`;
        case "PDF":
            return `${orden} ${documento.nombreBase}_${cliente}.pdf`;
        case "XLSX":
            return `${orden} ${documento.nombreBase}_${cliente}.xlsx`;
        case "JS":
            return `${orden} ${documento.nombreBase}.js`;
        default:
            return documento.nombreBase;
    }
}
//# sourceMappingURL=leypd-catalogo.js.map