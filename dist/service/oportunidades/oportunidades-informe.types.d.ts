import { Prisma } from "@prisma/client";
export declare const oportunidadInformeInclude: {
    entidad: {
        select: {
            id: true;
            nombre: true;
            rut: true;
            correo: true;
            telefono: true;
            direccion: true;
            origen: true;
        };
    };
    responsable: {
        select: {
            id_tecnico: true;
            nombre: true;
            email: true;
            area: true;
            cargo: true;
        };
    };
    seguimientos: {
        orderBy: {
            createdAt: "asc";
        };
        include: {
            autor: {
                select: {
                    id_tecnico: true;
                    nombre: true;
                    email: true;
                };
            };
        };
    };
    historialEtapas: {
        orderBy: {
            createdAt: "asc";
        };
        include: {
            actor: {
                select: {
                    id_tecnico: true;
                    nombre: true;
                    email: true;
                };
            };
        };
    };
    cotizaciones: {
        orderBy: {
            createdAt: "asc";
        };
        include: {
            entidad: {
                select: {
                    id: true;
                    nombre: true;
                    rut: true;
                    correo: true;
                };
            };
            tecnico: {
                select: {
                    id_tecnico: true;
                    nombre: true;
                    email: true;
                };
            };
            envios: {
                orderBy: {
                    sentAt: "asc";
                };
                select: {
                    id: true;
                    to: true;
                    subject: true;
                    sentBy: true;
                    creadoPor: true;
                    fechaCreacion: true;
                    sentAt: true;
                };
            };
            items: {
                orderBy: {
                    id: "asc";
                };
                select: {
                    id: true;
                    tipo: true;
                    nombre: true;
                    descripcion: true;
                    cantidad: true;
                    precio: true;
                    precioCosto: true;
                    porcGanancia: true;
                    porcentaje: true;
                };
            };
        };
    };
};
export type OportunidadInformeData = Prisma.OportunidadVentaGetPayload<{
    include: typeof oportunidadInformeInclude;
}>;
//# sourceMappingURL=oportunidades-informe.types.d.ts.map