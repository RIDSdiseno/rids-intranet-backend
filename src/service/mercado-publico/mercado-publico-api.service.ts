const BASE_URL =
    process.env.MERCADO_PUBLICO_API_BASE_URL ||
    "https://api.mercadopublico.cl/servicios/v1/publico";


const TICKET =
    process.env.MERCADO_PUBLICO_API_TICKET;


if (
    !TICKET
) {
    console.warn(
        "[MERCADO PUBLICO] Falta MERCADO_PUBLICO_API_TICKET"
    );
}


function getTicket(): string {

    if (
        !TICKET
    ) {
        throw new Error(
            "MERCADO_PUBLICO_API_TICKET no está configurado"
        );
    }

    return TICKET;
}


function construirUrl(
    path: string,
    params: Record<string, string | number | undefined>
): string {

    const url =
        new URL(
            `${BASE_URL}/${path}`
        );


    for (
        const [
            key,
            value,
        ] of Object.entries(
            params
        )
    ) {

        if (
            value === undefined
        ) {
            continue;
        }


        url.searchParams.set(
            key,
            String(
                value
            )
        );
    }


    url.searchParams.set(
        "ticket",
        getTicket()
    );


    return url.toString();
}


async function requestMercadoPublico<T>(
    url: string,
    intento: number = 1
): Promise<T> {

    const response =
        await fetch(
            url,
            {
                headers: {
                    Accept:
                        "application/json",
                },
            }
        );


    /*
     * Mercado Público devuelve 429
     * cuando detecta demasiadas solicitudes
     * cercanas/simultáneas.
     */
    if (
        response.status ===
        429 &&
        intento <=
        3
    ) {

        const espera =
            intento === 1
                ? 3000
                : intento === 2
                    ? 6000
                    : 12000;


        console.warn(
            `[MERCADO PUBLICO] 429. Reintento ${intento}/3 en ${espera} ms`
        );


        await new Promise(
            (
                resolve
            ) =>
                setTimeout(
                    resolve,
                    espera
                )
        );


        return requestMercadoPublico<T>(
            url,
            intento + 1
        );
    }


    if (
        !response.ok
    ) {

        const body =
            await response
                .text()
                .catch(
                    () =>
                        ""
                );


        throw new Error(
            `Mercado Público respondió ${response.status}: ${body.slice(
                0,
                500
            )}`
        );
    }


    return response.json() as Promise<T>;
}


export type MercadoPublicoLicitacionApi = {

    CodigoExterno?: string;

    Nombre?: string;

    CodigoEstado?: number;

    FechaCierre?: string;

    Descripcion?: string;

    Estado?: string;

    Tipo?: string;

    Moneda?: string;

    MontoEstimado?: number;

    Comprador?: {

        CodigoOrganismo?: string;

        NombreOrganismo?: string;

        RutUnidad?: string;

        CodigoUnidad?: string;

        NombreUnidad?: string;

        DireccionUnidad?: string;

        ComunaUnidad?: string;

        RegionUnidad?: string;

        NombreUsuario?: string;

        CargoUsuario?: string;
    };

    Fechas?: {

        FechaCreacion?: string;

        FechaCierre?: string;

        FechaPublicacion?: string;
    };

    NombreResponsableContrato?: string;

    EmailResponsableContrato?: string;

    FonoResponsableContrato?: string;

    Items?: {

        Cantidad?: number;

        Listado?: Array<{

            CodigoProducto?: number;

            CodigoCategoria?: string;

            Categoria?: string;

            NombreProducto?: string;

            Descripcion?: string;

            Cantidad?: number;
        }>;
    };

    [key: string]:
    unknown;
};


type MercadoPublicoRespuesta = {

    Cantidad?: number;

    FechaCreacion?: string;

    Version?: string;

    Listado?: MercadoPublicoLicitacionApi[];
};


export async function consultarLicitacionesPorFecha(
    fecha:
        string,
    estado:
        string = "todos"
) {

    const url =
        construirUrl(
            "licitaciones.json",
            {
                fecha,
                estado,
            }
        );


    return requestMercadoPublico<MercadoPublicoRespuesta>(
        url
    );
}


export async function consultarLicitacionesActivas() {

    const url =
        construirUrl(
            "licitaciones.json",
            {
                estado:
                    "activas",
            }
        );


    return requestMercadoPublico<MercadoPublicoRespuesta>(
        url
    );
}


export async function consultarLicitacionDetalle(
    codigo:
        string
) {

    const url =
        construirUrl(
            "licitaciones.json",
            {
                codigo,
            }
        );


    const response =
        await requestMercadoPublico<MercadoPublicoRespuesta>(
            url
        );


    return (
        response
            .Listado?.[0] ??
        null
    );
}