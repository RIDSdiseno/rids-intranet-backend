export interface EnviarInformeOportunidadInput {
    oportunidadId: number;
    destinatarios: string[];
    mensaje?: string | undefined;
}
export declare function obtenerDatosInformeOportunidad(oportunidadId: number): Promise<{
    cotizaciones: ({
        tecnico: {
            nombre: string;
            email: string;
            id_tecnico: number;
        } | null;
        entidad: {
            nombre: string;
            rut: string | null;
            id: number;
            correo: string | null;
        } | null;
        items: {
            nombre: string | null;
            id: number;
            tipo: import("@prisma/client").$Enums.ItemTipoGestioo;
            descripcion: string | null;
            precio: number;
            porcGanancia: number | null;
            cantidad: number;
            porcentaje: number | null;
            precioCosto: number | null;
        }[];
        envios: {
            id: number;
            subject: string | null;
            creadoPor: string | null;
            fechaCreacion: Date | null;
            to: string | null;
            sentBy: string | null;
            sentAt: Date;
        }[];
    } & {
        createdAt: Date;
        updatedAt: Date;
        tecnicoId: number | null;
        id: number;
        tipo: import("@prisma/client").$Enums.TipoCotizacionGestioo;
        estado: import("@prisma/client").$Enums.EstadoCotizacionGestioo;
        fecha: Date;
        moneda: import("@prisma/client").$Enums.MonedaGestioo;
        entidadId: number | null;
        imagen: string | null;
        total: number;
        iva: number;
        subtotal: number;
        descuentos: number;
        tasaCambio: number | null;
        comentariosCotizacion: string | null;
        personaResponsable: string | null;
        ordenGenerada: boolean;
        oportunidadVentaId: number | null;
    })[];
    entidad: {
        nombre: string;
        telefono: string | null;
        rut: string | null;
        origen: import("@prisma/client").$Enums.OrigenGestioo;
        id: number;
        direccion: string | null;
        correo: string | null;
    } | null;
    responsable: {
        nombre: string;
        email: string;
        cargo: string | null;
        id_tecnico: number;
        area: string | null;
    };
    historialEtapas: ({
        actor: {
            nombre: string;
            email: string;
            id_tecnico: number;
        } | null;
    } & {
        createdAt: Date;
        id: number;
        actorId: number | null;
        oportunidadId: number;
        etapaAnterior: import("@prisma/client").$Enums.EtapaOportunidadVenta | null;
        etapaNueva: import("@prisma/client").$Enums.EtapaOportunidadVenta;
        nota: string | null;
    })[];
    seguimientos: ({
        autor: {
            nombre: string;
            email: string;
            id_tecnico: number;
        };
    } & {
        createdAt: Date;
        id: number;
        estado: import("@prisma/client").$Enums.EstadoSeguimientoOportunidad;
        completadoAt: Date | null;
        oportunidadId: number;
        proximaAccion: string | null;
        fechaProximaAccion: Date | null;
        autorId: number;
        comentario: string;
        fechaContacto: Date | null;
        notaEstado: string | null;
    })[];
} & {
    createdAt: Date;
    updatedAt: Date;
    id: number;
    observaciones: string | null;
    notas: string | null;
    titulo: string;
    activo: boolean;
    moneda: import("@prisma/client").$Enums.MonedaGestioo;
    entidadId: number | null;
    prioridad: import("@prisma/client").$Enums.PrioridadOportunidadVenta;
    codigo: string;
    etapa: import("@prisma/client").$Enums.EtapaOportunidadVenta;
    proyecto: string | null;
    contactoNombre: string | null;
    contactoEmail: string | null;
    contactoTelefono: string | null;
    responsableId: number;
    montoEstimado: import("@prisma/client/runtime/library").Decimal | null;
    probabilidadCierre: number | null;
    proximaAccion: string | null;
    fechaProximaAccion: Date | null;
    fechaUltimoContacto: Date | null;
    motivoPerdida: string | null;
    fechaCierre: Date | null;
    montoFinal: import("@prisma/client/runtime/library").Decimal | null;
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
    montoPropuesto: import("@prisma/client/runtime/library").Decimal | null;
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
export declare function enviarInformeOportunidad(input: EnviarInformeOportunidadInput): Promise<{
    enviado: boolean;
    oportunidadId: number;
    codigo: string;
    destinatarios: string[];
    nombreArchivo: string;
    messageId: string;
}>;
//# sourceMappingURL=oportunidades-informe.service.d.ts.map