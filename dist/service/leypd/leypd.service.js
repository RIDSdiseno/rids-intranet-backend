// src/service/leypd/leypd.service.ts
import { prisma, } from "../../lib/prisma.js";
import { LEYPD_ELEMENTOS, TOTAL_ELEMENTOS_LEYPD, obtenerElementoCatalogo, } from "./leypd-catalogo.js";
/* =====================================================
   HELPERS
===================================================== */
function combinarElementosConCatalogo(registros) {
    const porNumero = new Map(registros.map((registro) => [
        registro.numero,
        registro,
    ]));
    return LEYPD_ELEMENTOS.map((catalogo) => {
        const registro = porNumero.get(catalogo.numero);
        return {
            ...catalogo,
            id: registro?.id ??
                null,
            estado: (registro?.estado ??
                "NO_INICIADO"),
            responsable: registro?.responsable ??
                null,
            fechaCompromiso: registro?.fechaCompromiso ??
                null,
            evidencia: registro?.evidencia ??
                null,
            observaciones: registro?.observaciones ??
                null,
            actualizadoPorId: registro
                ?.actualizadoPorId ??
                null,
            createdAt: registro?.createdAt ??
                null,
            updatedAt: registro?.updatedAt ??
                null,
        };
    });
}
function calcularResumenLeypd(elementos) {
    const implementados = elementos.filter((item) => item.estado ===
        "IMPLEMENTADO").length;
    const noAplica = elementos.filter((item) => item.estado ===
        "NO_APLICA").length;
    const enProgreso = elementos.filter((item) => item.estado ===
        "EN_PROGRESO").length;
    const sinIniciar = elementos.filter((item) => item.estado ===
        "NO_INICIADO").length;
    const completados = implementados +
        noAplica;
    const porcentaje = TOTAL_ELEMENTOS_LEYPD >
        0
        ? Math.round((completados /
            TOTAL_ELEMENTOS_LEYPD) *
            100)
        : 0;
    const ahora = new Date();
    const vencidos = elementos.filter((item) => {
        if (!item.fechaCompromiso) {
            return false;
        }
        return (item.fechaCompromiso <
            ahora &&
            item.estado !==
                "IMPLEMENTADO" &&
            item.estado !==
                "NO_APLICA");
    }).length;
    const ultimaActualizacion = elementos
        .map((item) => item.updatedAt)
        .filter((fecha) => fecha instanceof
        Date)
        .sort((a, b) => b.getTime() -
        a.getTime())[0] ??
        null;
    return {
        total: TOTAL_ELEMENTOS_LEYPD,
        implementados,
        noAplica,
        enProgreso,
        sinIniciar,
        completados,
        porcentaje,
        vencidos,
        ultimaActualizacion,
    };
}
/* =====================================================
   RESUMEN SHAREPOINT (LISTADO)
===================================================== */
/**
 * Resumen liviano del estado SharePoint de una empresa.
 * No devuelve documentos: solo conteos para la tabla.
 */
function resumirSharepoint(registro) {
    if (!registro) {
        return {
            vinculado: false,
            carpetaWebUrl: null,
            sincronizadoAt: null,
            ultimoError: null,
            carpetasFaltantes: 0,
            documentosFaltantes: 0,
        };
    }
    const elementos = registro.elementos &&
        typeof registro.elementos === "object" &&
        !Array.isArray(registro.elementos)
        ? Object.values(registro.elementos)
        : [];
    const sincronizado = Boolean(registro.sincronizadoAt);
    return {
        vinculado: true,
        carpetaWebUrl: registro.carpetaWebUrl,
        sincronizadoAt: registro.sincronizadoAt,
        ultimoError: registro.ultimoError,
        carpetasFaltantes: sincronizado
            ? elementos.filter((e) => !e?.existe).length
            : 0,
        documentosFaltantes: sincronizado
            ? elementos.reduce((total, e) => total +
                (Array.isArray(e?.faltantes)
                    ? e.faltantes.length
                    : 0), 0)
            : 0,
    };
}
/* =====================================================
   LISTADO GLOBAL
===================================================== */
export async function listarEmpresasLeypd() {
    const empresas = await prisma.empresa.findMany({
        where: {
            isActive: true,
        },
        select: {
            id_empresa: true,
            nombre: true,
            razonSocial: true,
            leypdElementos: true,
            leypdFicha: {
                select: {
                    id: true,
                    datos: true,
                    respondidoAt: true,
                    updatedAt: true,
                },
            },
            leypdSharepoint: {
                select: {
                    carpetaWebUrl: true,
                    sincronizadoAt: true,
                    ultimoError: true,
                    elementos: true,
                },
            },
        },
        orderBy: {
            nombre: "asc",
        },
    });
    const resultado = empresas.map((empresa) => {
        const elementos = combinarElementosConCatalogo(empresa
            .leypdElementos);
        const resumen = calcularResumenLeypd(elementos);
        return {
            empresaId: empresa.id_empresa,
            empresaNombre: empresa.nombre,
            razonSocial: empresa.razonSocial,
            ...resumen,
            ficha: {
                existe: Boolean(empresa
                    .leypdFicha),
                respondida: Boolean(empresa
                    .leypdFicha
                    ?.respondidoAt),
                respondidoAt: empresa
                    .leypdFicha
                    ?.respondidoAt ??
                    null,
                updatedAt: empresa
                    .leypdFicha
                    ?.updatedAt ??
                    null,
            },
            sharepoint: resumirSharepoint(empresa.leypdSharepoint),
        };
    });
    return {
        resumen: {
            totalEmpresas: resultado.length,
            clientesCompletos: resultado.filter((empresa) => empresa.porcentaje ===
                100).length,
            clientesSinIniciar: resultado.filter((empresa) => empresa.sinIniciar ===
                TOTAL_ELEMENTOS_LEYPD).length,
            compromisosVencidos: resultado.reduce((total, empresa) => total +
                empresa.vencidos, 0),
            sharepointVinculadas: resultado.filter((empresa) => empresa.sharepoint.vinculado).length,
            elementosImplementados: resultado.reduce((total, empresa) => total +
                empresa.implementados, 0),
        },
        empresas: resultado,
    };
}
/* =====================================================
   DETALLE EMPRESA
===================================================== */
export async function obtenerDetalleLeypdEmpresa(empresaId) {
    const empresa = await prisma.empresa.findUnique({
        where: {
            id_empresa: empresaId,
        },
        select: {
            id_empresa: true,
            nombre: true,
            razonSocial: true,
            isActive: true,
            leypdElementos: true,
        },
    });
    if (!empresa) {
        throw new Error("EMPRESA_NO_ENCONTRADA");
    }
    const elementos = combinarElementosConCatalogo(empresa.leypdElementos);
    const resumen = calcularResumenLeypd(elementos);
    return {
        empresa: {
            id_empresa: empresa.id_empresa,
            nombre: empresa.nombre,
            razonSocial: empresa.razonSocial,
            isActive: empresa.isActive,
        },
        resumen,
        elementos,
    };
}
/* =====================================================
   ACTUALIZAR ELEMENTO
===================================================== */
export async function actualizarElementoLeypd(empresaId, numero, input) {
    const catalogo = obtenerElementoCatalogo(numero);
    if (!catalogo) {
        throw new Error("ELEMENTO_LEYPD_INVALIDO");
    }
    const empresa = await prisma.empresa.findUnique({
        where: {
            id_empresa: empresaId,
        },
        select: {
            id_empresa: true,
        },
    });
    if (!empresa) {
        throw new Error("EMPRESA_NO_ENCONTRADA");
    }
    return prisma.leypdElemento.upsert({
        where: {
            empresaId_numero: {
                empresaId,
                numero,
            },
        },
        create: {
            empresaId,
            numero,
            estado: input.estado,
            responsable: input.responsable ??
                null,
            fechaCompromiso: input.fechaCompromiso ??
                null,
            evidencia: input.evidencia ??
                null,
            observaciones: input.observaciones ??
                null,
            actualizadoPorId: input.actualizadoPorId ??
                null,
        },
        update: {
            estado: input.estado,
            responsable: input.responsable ??
                null,
            fechaCompromiso: input.fechaCompromiso ??
                null,
            evidencia: input.evidencia ??
                null,
            observaciones: input.observaciones ??
                null,
            actualizadoPorId: input.actualizadoPorId ??
                null,
        },
    });
}
//# sourceMappingURL=leypd.service.js.map