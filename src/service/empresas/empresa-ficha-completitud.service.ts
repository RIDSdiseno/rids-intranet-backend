// src/service/empresas/empresa-ficha-completitud.service.ts
import {
    prisma,
} from "../../lib/prisma.js";

/* =====================================================
   TIPOS
===================================================== */

export type EstadoCompletitudSeccion =
    | "COMPLETA"
    | "INCOMPLETA"
    | "SIN_DATOS"
    | "NO_APLICA";

export type FaltanteFichaEmpresa = {
    campo:
    string;

    label:
    string;

    registro?:
    string;
};

export type CompletitudSeccionFicha = {
    key:
    string;

    label:
    string;

    obligatoria:
    boolean;

    estado:
    EstadoCompletitudSeccion;

    porcentaje:
    number;

    totalCampos:
    number;

    camposCompletos:
    number;

    faltantes:
    FaltanteFichaEmpresa[];
};

export type CompletitudFichaEmpresa = {
    estado:
    "COMPLETA" |
    "INCOMPLETA";

    porcentaje:
    number;

    totalSecciones:
    number;

    seccionesCompletas:
    number;

    seccionesIncompletas:
    number;

    totalFaltantes:
    number;

    secciones:
    CompletitudSeccionFicha[];
};


/* =====================================================
   HELPERS
===================================================== */

function tieneValor(
    value:
        unknown
): boolean {

    if (
        value === null ||
        value === undefined
    ) {
        return false;
    }

    if (
        typeof value ===
        "string"
    ) {
        return (
            value.trim().length >
            0
        );
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return (
            value.length >
            0
        );
    }

    if (
        typeof value ===
        "number"
    ) {
        return Number.isFinite(
            value
        );
    }

    if (
        typeof value ===
        "boolean"
    ) {
        return value;
    }

    return true;
}


type CampoEvaluado = {
    campo:
    string;

    label:
    string;

    completo:
    boolean;

    registro?:
    string;

};


function crearSeccion({
    key,
    label,
    obligatoria,
    campos,
    sinDatos = false,
    noAplica = false,
}: {
    key:
    string;

    label:
    string;

    obligatoria:
    boolean;

    campos:
    CampoEvaluado[];

    sinDatos?:
    boolean;

    noAplica?:
    boolean;
}): CompletitudSeccionFicha {

    const totalCampos =
        campos.length;

    const camposCompletos =
        campos.filter(
            campo =>
                campo.completo
        ).length;

    const faltantes =
        campos
            .filter(
                campo =>
                    !campo.completo
            )
            .map(
                campo => ({
                    campo:
                        campo.campo,

                    label:
                        campo.label,

                    ...(campo.registro
                        ? {
                            registro:
                                campo.registro,
                        }
                        : {}),
                })
            );

    const porcentaje =
        totalCampos >
            0
            ? Math.round(
                (
                    camposCompletos /
                    totalCampos
                ) *
                100
            )
            : 100;

    let estado:
        EstadoCompletitudSeccion;

    if (
        noAplica
    ) {
        estado =
            "NO_APLICA";

    } else if (
        sinDatos
    ) {
        estado =
            "SIN_DATOS";

    } else if (
        faltantes.length ===
        0
    ) {
        estado =
            "COMPLETA";

    } else {
        estado =
            "INCOMPLETA";
    }

    return {
        key,
        label,
        obligatoria,
        estado,
        porcentaje,
        totalCampos,
        camposCompletos,
        faltantes,
    };
}


/* =====================================================
   LABELS CHECKLIST
===================================================== */

const CHECKLIST_LABELS = {
    levantamientoEquipos:
        "Levantamiento de equipos",

    inventarioSoftware:
        "Inventario de software",

    soporteComputacional:
        "Soporte computacional",

    sitiosWeb:
        "Sitios web",

    visitasPresenciales:
        "Visitas presenciales",

    contratoFirmado:
        "Contrato firmado",

    facturasArchivadas:
        "Facturas archivadas",

    historialIncidencias:
        "Historial de incidencias",

    reunionesRevision:
        "Reuniones de revisión",

    registroAccesos:
        "Registro de accesos",

    metasDigitales:
        "Metas digitales",

    planAccion:
        "Plan de acción",
} as const;


/* =====================================================
   FICHA TÉCNICA
===================================================== */

const FICHA_TECNICA_LABELS = {
    tecnicoPrincipal:
        "Técnico principal",

    tecnicosRespaldo:
        "Técnicos de respaldo",

    sistemasOperativos:
        "Sistemas operativos",

    proveedorInternet:
        "Proveedor de Internet",

    dominioWeb:
        "Dominio web",

    antivirusSeguridad:
        "Antivirus / seguridad",

    aplicacionesCriticas:
        "Aplicaciones críticas",

    certificadoSSL:
        "Certificado SSL",

    configuracionIP:
        "Configuración IP",

    correosCorporativos:
        "Correos corporativos",

    fechaUltimaVisita:
        "Fecha última visita",

    hostingProveedor:
        "Proveedor de hosting",

    impresorasPerifericos:
        "Impresoras / periféricos",

    licenciasVigentes:
        "Licencias vigentes",

    otrosEquipos:
        "Otros equipos",

    pcsNotebooks:
        "PCs / notebooks",

    proximaVisitaProgramada:
        "Próxima visita programada",

    routersSwitches:
        "Routers / switches",

    servidores:
        "Descripción de servidores",

    velocidadContratada:
        "Velocidad contratada",
} as const;


/* =====================================================
   EVALUAR EMPRESAS
===================================================== */

export async function evaluarCompletitudFichasEmpresas(
    empresaIds:
        number[]
): Promise<
    Map<
        number,
        CompletitudFichaEmpresa
    >
> {

    const ids =
        Array.from(
            new Set(
                empresaIds.filter(
                    id =>
                        Number.isInteger(
                            id
                        ) &&
                        id >
                        0
                )
            )
        );

    if (
        ids.length ===
        0
    ) {
        return new Map();
    }

    /*
     * Una sola consulta Prisma para todas las empresas.
     *
     * Traemos únicamente los campos necesarios
     * para calcular la completitud.
     */
    const empresas =
        await prisma
            .empresa
            .findMany({
                where: {
                    id_empresa: {
                        in:
                            ids,
                    },
                },

                select: {
                    id_empresa:
                        true,

                    nombre:
                        true,

                    razonSocial:
                        true,

                    dominios:
                        true,

                    detalleEmpresa: {
                        select: {
                            rut:
                                true,

                            direccion:
                                true,

                            telefono:
                                true,

                            email:
                                true,

                            diasCredito:
                                true,
                        },
                    },

                    contactoEmpresas: {
                        select: {
                            id:
                                true,

                            nombre:
                                true,

                            cargo:
                                true,

                            email:
                                true,

                            telefono:
                                true,

                            principal:
                                true,
                        },
                    },

                    fichaEmpresa: {
                        select: {
                            condicionesComerciales:
                                true,

                            servidoresAplica:
                                true,

                            checklist: {
                                select: {
                                    levantamientoEquipos:
                                        true,

                                    inventarioSoftware:
                                        true,

                                    soporteComputacional:
                                        true,

                                    sitiosWeb:
                                        true,

                                    visitasPresenciales:
                                        true,

                                    contratoFirmado:
                                        true,

                                    facturasArchivadas:
                                        true,

                                    historialIncidencias:
                                        true,

                                    reunionesRevision:
                                        true,

                                    registroAccesos:
                                        true,

                                    metasDigitales:
                                        true,

                                    planAccion:
                                        true,
                                },
                            },
                        },
                    },

                    fichaTecnicaEmpresa: {
                        select: {
                            tecnicoPrincipal:
                                true,

                            tecnicosRespaldo:
                                true,

                            sistemasOperativos:
                                true,

                            proveedorInternet:
                                true,

                            dominioWeb:
                                true,

                            antivirusSeguridad:
                                true,

                            aplicacionesCriticas:
                                true,

                            certificadoSSL:
                                true,

                            configuracionIP:
                                true,

                            correosCorporativos:
                                true,

                            fechaUltimaVisita:
                                true,

                            hostingProveedor:
                                true,

                            impresorasPerifericos:
                                true,

                            licenciasVigentes:
                                true,

                            otrosEquipos:
                                true,

                            pcsNotebooks:
                                true,

                            proximaVisitaProgramada:
                                true,

                            routersSwitches:
                                true,

                            servidores:
                                true,

                            velocidadContratada:
                                true,
                        },
                    },

                    entidadGestioos: {
                        select: {
                            id:
                                true,

                            nombre:
                                true,

                            rut:
                                true,
                        },
                    },

                    suscripcionesContratos: {
                        select: {
                            id:
                                true,
                        },
                    },

                    empresaISP: {
                        select: {
                            id:
                                true,

                            operador:
                                true,

                            telefono:
                                true,

                            servicio:
                                true,

                            numeroTicket:
                                true,

                            wifiNombre:
                                true,

                            wifiClaveRef:
                                true,

                            ipRed:
                                true,

                            esPrincipal:
                                true,
                        },
                    },

                    sucursales: {
                        select: {
                            id_sucursal:
                                true,

                            nombre:
                                true,

                            direccion:
                                true,

                            telefono:
                                true,
                        },
                    },

                    servidors: {
                        select: {
                            id:
                                true,

                            nombre:
                                true,

                            nombreUsuario:
                                true,

                            ipExterna:
                                true,

                            probado:
                                true,
                        },
                    },
                },
            });

    const resultado =
        new Map<
            number,
            CompletitudFichaEmpresa
        >();


    for (
        const empresa
        of empresas
    ) {

        const secciones:
            CompletitudSeccionFicha[] =
            [];


        /* =================================================
           1. CLIENTE
        ================================================= */

        const camposCliente:
            CampoEvaluado[] =
            [
                {
                    campo:
                        "nombre",

                    label:
                        "Nombre",

                    completo:
                        tieneValor(
                            empresa.nombre
                        ),
                },

                {
                    campo:
                        "razonSocial",

                    label:
                        "Razón social",

                    completo:
                        tieneValor(
                            empresa.razonSocial
                        ),
                },

                {
                    campo:
                        "dominios",

                    label:
                        "Dominio",

                    completo:
                        empresa.dominios
                            .length >
                        0,
                },

                {
                    campo:
                        "rut",

                    label:
                        "RUT",

                    completo:
                        tieneValor(
                            empresa
                                .detalleEmpresa
                                ?.rut
                        ),
                },

                {
                    campo:
                        "direccion",

                    label:
                        "Dirección",

                    completo:
                        tieneValor(
                            empresa
                                .detalleEmpresa
                                ?.direccion
                        ),
                },

                {
                    campo:
                        "diasCredito",

                    label:
                        "Días de crédito",

                    completo:
                        tieneValor(
                            empresa
                                .detalleEmpresa
                                ?.diasCredito
                        ),
                },

                {
                    campo:
                        "condicionesComerciales",

                    label:
                        "Condiciones comerciales",

                    completo:
                        tieneValor(
                            empresa
                                .fichaEmpresa
                                ?.condicionesComerciales
                        ),
                },

                {
                    campo:
                        "contactos",

                    label:
                        "Al menos un contacto",

                    completo:
                        empresa
                            .contactoEmpresas
                            .length >
                        0,
                },
            ];


        for (
            const contacto
            of empresa
                .contactoEmpresas
        ) {

            const registro =
                contacto.nombre ||
                `Contacto #${contacto.id}`;

            camposCliente.push(
                {
                    campo:
                        `contacto.${contacto.id}.nombre`,

                    label:
                        "Nombre del contacto",

                    registro,

                    completo:
                        tieneValor(
                            contacto.nombre
                        ),
                },

                {
                    campo:
                        `contacto.${contacto.id}.cargo`,

                    label:
                        "Cargo del contacto",

                    registro,

                    completo:
                        tieneValor(
                            contacto.cargo
                        ),
                },

                {
                    campo:
                        `contacto.${contacto.id}.email`,

                    label:
                        "Email del contacto",

                    registro,

                    completo:
                        tieneValor(
                            contacto.email
                        ),
                },

                {
                    campo:
                        `contacto.${contacto.id}.telefono`,

                    label:
                        "Teléfono del contacto",

                    registro,

                    completo:
                        tieneValor(
                            contacto.telefono
                        ),
                }
            );
        }


        secciones.push(
            crearSeccion({
                key:
                    "cliente",

                label:
                    "Cliente",

                obligatoria:
                    true,

                campos:
                    camposCliente,
            })
        );


        /* =================================================
           2. RELACIÓN COMERCIAL
        ================================================= */

        secciones.push(
            crearSeccion({
                key:
                    "relacion-comercial",

                label:
                    "Relación comercial",

                obligatoria:
                    true,

                sinDatos:
                    empresa
                        .entidadGestioos
                        .length ===
                    0,

                campos: [
                    {
                        campo:
                            "entidadRelacionada",

                        label:
                            "Entidad comercial relacionada",

                        completo:
                            empresa
                                .entidadGestioos
                                .length >
                            0,
                    },
                ],
            })
        );


        /* =================================================
   3. SUSCRIPCIONES Y CONTRATOS
================================================= */

        const tieneSuscripciones =
            empresa
                .suscripcionesContratos
                .length >
            0;

        secciones.push(
            crearSeccion({
                key:
                    "suscripciones",

                label:
                    "Suscripciones y Contratos",

                obligatoria:
                    true,

                sinDatos:
                    !tieneSuscripciones,

                campos: [
                    {
                        campo:
                            "suscripcion",

                        label:
                            "Al menos una suscripción o contrato registrado",

                        completo:
                            tieneSuscripciones,
                    },
                ],
            })
        );


        /* =================================================
   4. CHECKLIST
================================================= */

        const checklist =
            empresa
                .fichaEmpresa
                ?.checklist;

        const tieneChecklistSeleccionado =
            checklist
                ? Object.keys(
                    CHECKLIST_LABELS
                ).some(
                    key =>
                        Boolean(
                            checklist[
                            key as keyof typeof CHECKLIST_LABELS
                            ]
                        )
                )
                : false;

        secciones.push(
            crearSeccion({
                key:
                    "checklist",

                label:
                    "Checklist",

                obligatoria:
                    true,

                sinDatos:
                    !checklist,

                campos: [
                    {
                        campo:
                            "checklistSeleccionado",

                        label:
                            "Al menos un ítem del checklist seleccionado",

                        completo:
                            tieneChecklistSeleccionado,
                    },
                ],
            })
        );


        /* =================================================
           5. FICHA TÉCNICA
        ================================================= */

        const fichaTecnica =
            empresa
                .fichaTecnicaEmpresa;


        const camposFichaTecnica:
            CampoEvaluado[] =
            Object.entries(
                FICHA_TECNICA_LABELS
            ).map(
                (
                    [
                        key,
                        label,
                    ]
                ) => ({
                    campo:
                        key,

                    label,

                    completo:
                        fichaTecnica
                            ? tieneValor(
                                fichaTecnica[
                                key as keyof typeof FICHA_TECNICA_LABELS
                                ]
                            )
                            : false,
                })
            );


        secciones.push(
            crearSeccion({
                key:
                    "tecnica",

                label:
                    "Ficha técnica",

                obligatoria:
                    true,

                sinDatos:
                    !fichaTecnica,

                campos:
                    camposFichaTecnica,
            })
        );


        /* =================================================
           6. REDES / ISP
        ================================================= */

        const camposRedes:
            CampoEvaluado[] =
            [];


        if (
            empresa
                .empresaISP
                .length ===
            0
        ) {

            camposRedes.push(
                {
                    campo:
                        "isp",

                    label:
                        "Al menos un ISP / red",

                    completo:
                        false,
                }
            );

        } else {

            camposRedes.push(
                {
                    campo:
                        "ispPrincipal",

                    label:
                        "ISP principal",

                    completo:
                        empresa
                            .empresaISP
                            .some(
                                isp =>
                                    isp.esPrincipal
                            ),
                }
            );


            for (
                const isp
                of empresa
                    .empresaISP
            ) {

                const registro =
                    isp.operador ||
                    `ISP #${isp.id}`;

                const camposISP = [
                    [
                        "operador",
                        "Operador",
                        isp.operador,
                    ],

                    [
                        "telefono",
                        "Teléfono",
                        isp.telefono,
                    ],

                    [
                        "servicio",
                        "Servicio",
                        isp.servicio,
                    ],

                    [
                        "numeroTicket",
                        "Número de ticket / referencia",
                        isp.numeroTicket,
                    ],

                    [
                        "wifiNombre",
                        "Nombre WiFi",
                        isp.wifiNombre,
                    ],

                    [
                        "wifiClaveRef",
                        "Referencia de clave WiFi",
                        isp.wifiClaveRef,
                    ],

                    [
                        "ipRed",
                        "IP / red",
                        isp.ipRed,
                    ],
                ] as const;


                for (
                    const [
                        campo,
                        label,
                        valor,
                    ]
                    of camposISP
                ) {

                    camposRedes.push(
                        {
                            campo:
                                `isp.${isp.id}.${campo}`,

                            label,

                            registro,

                            completo:
                                tieneValor(
                                    valor
                                ),
                        }
                    );
                }
            }
        }


        secciones.push(
            crearSeccion({
                key:
                    "redes",

                label:
                    "Redes / ISP",

                obligatoria:
                    true,

                sinDatos:
                    empresa
                        .empresaISP
                        .length ===
                    0,

                campos:
                    camposRedes,
            })
        );


        /* =================================================
           7. SUCURSALES
           OPCIONAL: NO AFECTA EL ESTADO GENERAL
        ================================================= */

        const camposSucursales:
            CampoEvaluado[] =
            empresa
                .sucursales
                .flatMap(
                    sucursal => {

                        const registro =
                            sucursal.nombre ||
                            `Sucursal #${sucursal.id_sucursal}`;

                        return [
                            {
                                campo:
                                    `sucursal.${sucursal.id_sucursal}.nombre`,

                                label:
                                    "Nombre",

                                registro,

                                completo:
                                    tieneValor(
                                        sucursal.nombre
                                    ),
                            },

                            {
                                campo:
                                    `sucursal.${sucursal.id_sucursal}.direccion`,

                                label:
                                    "Dirección",

                                registro,

                                completo:
                                    tieneValor(
                                        sucursal.direccion
                                    ),
                            },

                            {
                                campo:
                                    `sucursal.${sucursal.id_sucursal}.telefono`,

                                label:
                                    "Teléfono",

                                registro,

                                completo:
                                    tieneValor(
                                        sucursal.telefono
                                    ),
                            },
                        ];
                    }
                );


        secciones.push(
            crearSeccion({
                key:
                    "sucursales",

                label:
                    "Sucursales",

                obligatoria:
                    false,

                /*
                 * Puede estar totalmente vacía.
                 * Se informa, pero jamás penaliza.
                 */
                sinDatos:
                    empresa
                        .sucursales
                        .length ===
                    0,

                campos:
                    camposSucursales,
            })
        );


        /* =================================================
   8. SERVIDORES
================================================= */

        const camposServidores:
            CampoEvaluado[] =
            [];

        const servidoresAplica =
            empresa
                .fichaEmpresa
                ?.servidoresAplica ??
            true;

        if (
            servidoresAplica
        ) {

            if (
                empresa
                    .servidors
                    .length ===
                0
            ) {

                camposServidores.push({
                    campo:
                        "servidor",

                    label:
                        "Al menos un servidor",

                    completo:
                        false,
                });

            } else {

                for (
                    const servidor
                    of empresa.servidors
                ) {

                    const registro =
                        servidor.nombre ||
                        `Servidor #${servidor.id}`;

                    camposServidores.push(
                        {
                            campo:
                                `servidor.${servidor.id}.nombre`,

                            label:
                                "Nombre del servidor",

                            registro,

                            completo:
                                tieneValor(
                                    servidor.nombre
                                ),
                        },

                        {
                            campo:
                                `servidor.${servidor.id}.nombreUsuario`,

                            label:
                                "Usuario del servidor",

                            registro,

                            completo:
                                tieneValor(
                                    servidor.nombreUsuario
                                ),
                        },

                        {
                            campo:
                                `servidor.${servidor.id}.ipExterna`,

                            label:
                                "IP externa",

                            registro,

                            completo:
                                tieneValor(
                                    servidor.ipExterna
                                ),
                        },

                        {
                            campo:
                                `servidor.${servidor.id}.probado`,

                            label:
                                "Acceso probado",

                            registro,

                            completo:
                                servidor.probado,
                        }
                    );
                }
            }
        }

        secciones.push(
            crearSeccion({
                key:
                    "servidores",

                label:
                    "Servidores",

                obligatoria:
                    servidoresAplica,

                noAplica:
                    !servidoresAplica,

                sinDatos:
                    servidoresAplica &&
                    empresa.servidors.length ===
                    0,

                campos:
                    camposServidores,
            })
        );


        /* =================================================
           ESTADO GENERAL

           IMPORTANTE:
           Sucursales queda fuera de este cálculo.
        ================================================= */

        const obligatorias =
            secciones.filter(
                seccion =>
                    seccion.obligatoria
            );


        const seccionesCompletas =
            obligatorias.filter(
                seccion =>
                    seccion.estado ===
                    "COMPLETA"
            ).length;


        const seccionesIncompletas =
            obligatorias.length -
            seccionesCompletas;


        /*
         * Promedio por sección.
         *
         * Así Ficha Técnica no pesa 26 veces más
         * que Relación Comercial solo porque tiene
         * muchos campos.
         */
        const porcentaje =
            obligatorias.length >
                0
                ? Math.round(
                    obligatorias.reduce(
                        (
                            total,
                            seccion
                        ) =>
                            total +
                            seccion.porcentaje,
                        0
                    ) /
                    obligatorias.length
                )
                : 100;


        const totalFaltantes =
            obligatorias.reduce(
                (
                    total,
                    seccion
                ) =>
                    total +
                    seccion
                        .faltantes
                        .length,
                0
            );


        resultado.set(
            empresa.id_empresa,
            {
                estado:
                    seccionesIncompletas ===
                        0
                        ? "COMPLETA"
                        : "INCOMPLETA",

                porcentaje,

                totalSecciones:
                    obligatorias.length,

                seccionesCompletas,

                seccionesIncompletas,

                totalFaltantes,

                secciones,
            }
        );
    }


    return resultado;
}