import { Prisma, EtapaOportunidadVenta, PrioridadOportunidadVenta, MonedaGestioo, EstadoDesarrolloPropuesta, TipoServicioOportunidad, RiesgoTecnicoOportunidad } from "@prisma/client";
export declare class OportunidadNoEncontradaError extends Error {
    constructor(message?: string);
}
export declare class EtapaOportunidadInvalidaError extends Error {
    constructor(message?: string);
}
export declare class CierreOportunidadInvalidoError extends Error {
    constructor(message?: string);
}
export declare class ResponsableOportunidadInvalidoError extends Error {
    constructor(message?: string);
}
export declare class EntidadOportunidadInvalidaError extends Error {
    constructor(message?: string);
}
export declare class OrdenOportunidadInvalidoError extends Error {
    constructor(message?: string);
}
export declare class CotizacionOportunidadRequeridaError extends Error {
    constructor(message?: string);
}
export declare class CotizacionYaVinculadaError extends Error {
    constructor(message?: string);
}
export declare class CotizacionNoEncontradaError extends Error {
    constructor(message?: string);
}
export declare class CotizacionNoVinculadaError extends Error {
    constructor(message?: string);
}
export declare class DesvinculacionCotizacionInvalidaError extends Error {
    constructor(message?: string);
}
export interface CrearOportunidadInput {
    titulo: string;
    responsableId?: number | undefined;
    entidadId?: number | null | undefined;
    proyecto?: string | null | undefined;
    contactoNombre?: string | null | undefined;
    contactoEmail?: string | null | undefined;
    contactoTelefono?: string | null | undefined;
    prioridad?: PrioridadOportunidadVenta | undefined;
    montoEstimado?: number | null | undefined;
    moneda?: MonedaGestioo | undefined;
    probabilidadCierre?: number | null | undefined;
    fechaProbableCierre?: Date | null | undefined;
    proximaAccion?: string | null | undefined;
    fechaProximaAccion?: Date | null | undefined;
    observaciones?: string | null | undefined;
    estadoDesarrolloPropuesta?: EstadoDesarrolloPropuesta | null | undefined;
    tipoServicio?: TipoServicioOportunidad | null | undefined;
    tipoServicioOtro?: string | null | undefined;
    informacionPendiente?: string | null | undefined;
    riesgoTecnico?: RiesgoTecnicoOportunidad | null | undefined;
    condicionesEspeciales?: string | null | undefined;
    fechaComprometidaEnvio?: Date | null | undefined;
    comentariosInternos?: string | null | undefined;
    montoPropuesto?: number | null | undefined;
    fechaEnvioPropuesta?: Date | null | undefined;
    fechaVencimientoPropuesta?: Date | null | undefined;
    comentariosCliente?: string | null | undefined;
    objeciones?: string | null | undefined;
    versionPropuesta?: string | null | undefined;
    contrapropuestas?: string | null | undefined;
    ajustesSolicitados?: string | null | undefined;
}
export interface EditarOportunidadInput {
    titulo?: string | undefined;
    responsableId?: number | undefined;
    entidadId?: number | null | undefined;
    proyecto?: string | null | undefined;
    contactoNombre?: string | null | undefined;
    contactoEmail?: string | null | undefined;
    contactoTelefono?: string | null | undefined;
    prioridad?: PrioridadOportunidadVenta | undefined;
    montoEstimado?: number | null | undefined;
    moneda?: MonedaGestioo | undefined;
    probabilidadCierre?: number | null | undefined;
    fechaProbableCierre?: Date | null | undefined;
    proximaAccion?: string | null | undefined;
    fechaProximaAccion?: Date | null | undefined;
    observaciones?: string | null | undefined;
    fechaUltimoContacto?: Date | null | undefined;
    estadoDesarrolloPropuesta?: EstadoDesarrolloPropuesta | null | undefined;
    tipoServicio?: TipoServicioOportunidad | null | undefined;
    tipoServicioOtro?: string | null | undefined;
    informacionPendiente?: string | null | undefined;
    riesgoTecnico?: RiesgoTecnicoOportunidad | null | undefined;
    condicionesEspeciales?: string | null | undefined;
    fechaComprometidaEnvio?: Date | null | undefined;
    comentariosInternos?: string | null | undefined;
    montoPropuesto?: number | null | undefined;
    fechaEnvioPropuesta?: Date | null | undefined;
    fechaVencimientoPropuesta?: Date | null | undefined;
    comentariosCliente?: string | null | undefined;
    objeciones?: string | null | undefined;
    versionPropuesta?: string | null | undefined;
    contrapropuestas?: string | null | undefined;
    ajustesSolicitados?: string | null | undefined;
}
export interface CambiarEtapaInput {
    etapa: EtapaOportunidadVenta;
    motivoPerdida?: string | undefined;
    motivoPostergacion?: string | undefined;
    fechaReactivacion?: Date | undefined;
    fechaCierre?: Date | undefined;
    montoFinal?: number | null | undefined;
}
export interface CrearSeguimientoInput {
    comentario: string;
    fechaContacto?: Date | undefined;
    proximaAccion?: string | null | undefined;
    fechaProximaAccion?: Date | null | undefined;
}
export interface FiltrosOportunidadInput {
    etapa?: EtapaOportunidadVenta | undefined;
    responsableId?: number | undefined;
    entidadId?: number | undefined;
    prioridad?: PrioridadOportunidadVenta | undefined;
    texto?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}
export interface FiltrosDashboardInput {
    fechaDesde?: Date | undefined;
    fechaHasta?: Date | undefined;
    tipoFecha?: "ingreso" | "cierre" | "probableCierre" | undefined;
    responsableId?: number | undefined;
    etapa?: EtapaOportunidadVenta | undefined;
    origen?: "RIDS" | "ECONNET" | "OTRO" | undefined;
    tipoServicio?: TipoServicioOportunidad | undefined;
    entidadId?: number | undefined;
    texto?: string | undefined;
    diasSinSeguimiento?: number | undefined;
}
export declare function crearOportunidad(actorId: number, payload: CrearOportunidadInput): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
}>;
export declare function listarOportunidades(filtros: FiltrosOportunidadInput): Promise<{
    data: ({
        _count: {
            cotizaciones: number;
        };
        entidad: {
            nombre: string;
            id: number;
        } | null;
        responsable: {
            nombre: string;
            email: string;
            id_tecnico: number;
        };
    } & {
        createdAt: Date;
        updatedAt: Date;
        id: number;
        observaciones: string | null;
        titulo: string;
        activo: boolean;
        entidadId: number | null;
        prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
        moneda: import("@prisma/client").$Enums.MonedaGestioo;
        codigo: string;
        proyecto: string | null;
        contactoNombre: string | null;
        contactoEmail: string | null;
        contactoTelefono: string | null;
        responsableId: number;
        etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
        montoEstimado: Prisma.Decimal | null;
        probabilidadCierre: number | null;
        proximaAccion: string | null;
        fechaProximaAccion: Date | null;
        fechaUltimoContacto: Date | null;
        motivoPerdida: string | null;
        fechaCierre: Date | null;
        montoFinal: Prisma.Decimal | null;
        orden: number;
        desactivadoAt: Date | null;
        comentariosInternos: string | null;
        condicionesEspeciales: string | null;
        estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
        fechaComprometidaEnvio: Date | null;
        informacionPendiente: string | null;
        riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
        tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
        tipoServicioOtro: string | null;
        montoPropuesto: Prisma.Decimal | null;
        fechaEnvioPropuesta: Date | null;
        fechaVencimientoPropuesta: Date | null;
        comentariosCliente: string | null;
        objeciones: string | null;
        versionPropuesta: string | null;
        contrapropuestas: string | null;
        ajustesSolicitados: string | null;
        motivoPostergacion: string | null;
        fechaReactivacion: Date | null;
        fechaProbableCierre: Date | null;
    })[];
    meta: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}>;
export declare function obtenerFunnel(): Promise<{
    cantidadCotizaciones: number;
    cotizacionPrincipal: {
        id: number;
        estado: import("@prisma/client").$Enums.EstadoCotizacionGestioo;
    } | null;
    id: number;
    titulo: string;
    entidad: {
        nombre: string;
        id: number;
    } | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    responsable: {
        nombre: string;
        id_tecnico: number;
    };
    proyecto: string | null;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    fechaCierre: Date | null;
    orden: number;
    fechaProbableCierre: Date | null;
}[]>;
export declare function obtenerDashboardFunnel(filtros: FiltrosDashboardInput): Promise<{
    kpis: {
        total: number;
        activas: number;
        ganadas: number;
        perdidas: number;
        postergadas: number;
        pipelineTotal: number;
        montoGanado: number;
        montoPerdido: number;
        tasaCierre: number;
        clientesReactivados: number;
        sinSeguimiento: number;
        accionesVencidas: number;
    };
    proximasAcciones: {
        vencidas: number;
        hoy: number;
        proximos7: number;
    };
    porEtapa: {
        cantidad: number;
        monto: number;
        etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    }[];
    rankingResponsables: {
        responsableId: number;
        responsable: string;
        total: number;
        activas: number;
        ganadas: number;
        perdidas: number;
        postergadas: number;
        montoTotal: number;
        montoGanado: number;
    }[];
    sinSeguimiento: {
        cantidad: number;
        items: {
            id: number;
            codigo: string;
            titulo: string;
            proyecto: string | null;
            entidad: string | null;
            responsable: string;
            etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
            ultimaActividad: Date;
            proximaAccion: string | null;
            valor: number;
        }[];
    };
    avanzado: {
        porTipoServicio: {
            cantidad: number;
            monto: number;
            tipoServicio: string;
        }[];
        topClientes: {
            cantidad: number;
            monto: number;
            cliente: string;
        }[];
        forecast: {
            d30: {
                cantidad: number;
                montoTotal: number;
                montoPonderado: number;
            };
            d60: {
                cantidad: number;
                montoTotal: number;
                montoPonderado: number;
            };
            d90: {
                cantidad: number;
                montoTotal: number;
                montoPonderado: number;
            };
        };
        motivos: {
            perdida: {
                motivo: string;
                cantidad: number;
            }[];
            postergacion: {
                motivo: string;
                cantidad: number;
            }[];
        };
        riesgo: {
            detenidas: {
                cantidad: number;
                items: {
                    id: number;
                    codigo: string;
                    titulo: string;
                    proyecto: string | null;
                    entidad: string | null;
                    responsable: string;
                    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
                    ultimaActividad: Date;
                    proximaAccion: string | null;
                    valor: number;
                }[];
            };
            sinProximaAccion: {
                cantidad: number;
                items: {
                    id: number;
                    codigo: string;
                    titulo: string;
                    entidad: string | null;
                    responsable: string;
                    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
                    valor: number;
                }[];
            };
        };
        conversionPorEtapa: {
            etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
            cantidad: number;
            porcentajeDelTotal: number;
            tasaConversionSiguiente: number;
        }[];
    };
}>;
export declare function obtenerOportunidadPorId(id: number): Promise<{
    auditoria: {
        empresaId: number | null;
        createdAt: Date;
        id: number;
        actorId: number | null;
        entity: string;
        entityId: string;
        action: import("@prisma/client").$Enums.AuditAction;
        changes: Prisma.JsonValue | null;
        description: string | null;
    }[];
    cotizaciones: {
        createdAt: Date;
        id: number;
        estado: import("@prisma/client").$Enums.EstadoCotizacionGestioo;
        entidad: {
            nombre: string;
            id: number;
        } | null;
        total: number;
        moneda: import("@prisma/client").$Enums.MonedaGestioo;
    }[];
    entidad: {
        nombre: string;
        telefono: string | null;
        empresaId: number | null;
        rut: string | null;
        origen: import("@prisma/client").$Enums.OrigenGestioo;
        id: number;
        direccion: string | null;
        tipo: import("@prisma/client").$Enums.TipoEntidadGestioo;
        correo: string | null;
    } | null;
    responsable: {
        nombre: string;
        email: string;
        id_tecnico: number;
        rol: string;
    };
    historialEtapas: ({
        actor: {
            nombre: string;
            id_tecnico: number;
        } | null;
    } & {
        createdAt: Date;
        id: number;
        actorId: number | null;
        oportunidadId: number;
        etapaAnterior: import("@prisma/client").$Enums.EtapaOportunidadVenta | null;
        etapaNueva: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    })[];
    seguimientos: ({
        autor: {
            nombre: string;
            id_tecnico: number;
        };
    } & {
        createdAt: Date;
        id: number;
        oportunidadId: number;
        proximaAccion: string | null;
        fechaProximaAccion: Date | null;
        autorId: number;
        comentario: string;
        fechaContacto: Date | null;
    })[];
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
}>;
export declare function editarOportunidad(id: number, payload: EditarOportunidadInput): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
}>;
export declare function cambiarEtapaOportunidad(id: number, actorId: number | null, payload: CambiarEtapaInput): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
}>;
export declare function reordenarOportunidad(id: number, nuevoOrden: number): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
} | null>;
export declare function desactivarOportunidad(id: number): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    titulo: string;
    activo: boolean;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    codigo: string;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    montoEstimado: Prisma.Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: Prisma.Decimal | null;
    orden: number;
    desactivadoAt: Date | null;
    comentariosInternos: string | null;
    condicionesEspeciales: string | null;
    estadoDesarrolloPropuesta: import("@prisma/client").$Enums.EstadoDesarrolloPropuesta | null;
    fechaComprometidaEnvio: Date | null;
    informacionPendiente: string | null;
    riesgoTecnico: import("@prisma/client").$Enums.RiesgoTecnicoOportunidad | null;
    tipoServicio: import("@prisma/client").$Enums.TipoServicioOportunidad | null;
    tipoServicioOtro: string | null;
    montoPropuesto: Prisma.Decimal | null;
    fechaEnvioPropuesta: Date | null;
    fechaVencimientoPropuesta: Date | null;
    comentariosCliente: string | null;
    objeciones: string | null;
    versionPropuesta: string | null;
    contrapropuestas: string | null;
    ajustesSolicitados: string | null;
    motivoPostergacion: string | null;
    fechaReactivacion: Date | null;
    fechaProbableCierre: Date | null;
}>;
export declare function crearSeguimiento(oportunidadId: number, actorId: number, payload: CrearSeguimientoInput): Promise<{
    createdAt: Date;
    id: number;
    oportunidadId: number;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    autorId: number;
    comentario: string;
    fechaContacto: Date | null;
}>;
export declare function listarSeguimientos(oportunidadId: number): Promise<({
    autor: {
        nombre: string;
        id_tecnico: number;
    };
} & {
    createdAt: Date;
    id: number;
    oportunidadId: number;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    autorId: number;
    comentario: string;
    fechaContacto: Date | null;
})[]>;
export declare function obtenerHistorial(oportunidadId: number): Promise<{
    cambiosEtapa: ({
        actor: {
            nombre: string;
            id_tecnico: number;
        } | null;
    } & {
        createdAt: Date;
        id: number;
        actorId: number | null;
        oportunidadId: number;
        etapaAnterior: import("@prisma/client").$Enums.EtapaOportunidadVenta | null;
        etapaNueva: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    })[];
    auditoria: {
        empresaId: number | null;
        createdAt: Date;
        id: number;
        actorId: number | null;
        entity: string;
        entityId: string;
        action: import("@prisma/client").$Enums.AuditAction;
        changes: Prisma.JsonValue | null;
        description: string | null;
    }[];
}>;
export declare function listarCotizacionesOportunidad(oportunidadId: number): Promise<({
    entidad: {
        nombre: string;
        id: number;
    } | null;
} & {
    createdAt: Date;
    updatedAt: Date;
    tecnicoId: number | null;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoCotizacionGestioo;
    estado: import("@prisma/client").$Enums.EstadoCotizacionGestioo;
    fecha: Date;
    entidadId: number | null;
    imagen: string | null;
    total: number;
    iva: number;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    subtotal: number;
    descuentos: number;
    tasaCambio: number | null;
    comentariosCotizacion: string | null;
    personaResponsable: string | null;
    ordenGenerada: boolean;
    oportunidadVentaId: number | null;
})[]>;
export declare function vincularCotizacion(oportunidadId: number, cotizacionId: number): Promise<{
    id: number;
    oportunidadVentaId: number | null;
}>;
export declare function desvincularCotizacion(oportunidadId: number, cotizacionId: number): Promise<{
    createdAt: Date;
    updatedAt: Date;
    tecnicoId: number | null;
    id: number;
    tipo: import("@prisma/client").$Enums.TipoCotizacionGestioo;
    estado: import("@prisma/client").$Enums.EstadoCotizacionGestioo;
    fecha: Date;
    entidadId: number | null;
    imagen: string | null;
    total: number;
    iva: number;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    subtotal: number;
    descuentos: number;
    tasaCambio: number | null;
    comentariosCotizacion: string | null;
    personaResponsable: string | null;
    ordenGenerada: boolean;
    oportunidadVentaId: number | null;
}>;
export declare function sincronizarOportunidadPorCotizacionAprobada(cotizacionId: number, actorId: number | null): Promise<void>;
//# sourceMappingURL=oportunidades.service.d.ts.map