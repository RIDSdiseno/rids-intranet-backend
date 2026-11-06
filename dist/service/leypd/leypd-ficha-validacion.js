// src/service/leypd/leypd-ficha-validacion.ts
import { FICHA_LEYPD_CAMPOS, obtenerCampoFichaLeypd, } from "./leypd-ficha-campos.js";
/* =====================================================
   ERROR
===================================================== */
export class FichaLeypdValidacionError extends Error {
    errores;
    constructor(errores) {
        super("FICHA_VALIDACION");
        this.name = "FichaLeypdValidacionError";
        this.errores = errores;
    }
}
/* =====================================================
   HELPERS DE FORMATO
===================================================== */
export function esValorVacio(valor) {
    if (valor === null || valor === undefined)
        return true;
    if (typeof valor === "string")
        return valor.trim() === "";
    if (Array.isArray(valor))
        return valor.length === 0;
    return false;
}
/**
 * Valida RUT chileno por dígito verificador (módulo 11).
 * Acepta 12.345.678-9, 12345678-9 o 123456789.
 */
export function validarRutChileno(rut) {
    const limpio = rut
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
    if (limpio.length < 8 || limpio.length > 9)
        return false;
    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo))
        return false;
    let suma = 0;
    let multiplicador = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += Number(cuerpo[i]) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }
    const resto = 11 - (suma % 11);
    const dvEsperado = resto === 11 ? "0" :
        resto === 10 ? "K" :
            String(resto);
    return dv === dvEsperado;
}
function esEmailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}
function esUrlONoTiene(valor) {
    const limpio = valor.trim();
    if (limpio.toLowerCase() === "no tiene")
        return true;
    if (/\s/.test(limpio))
        return false;
    try {
        const url = new URL(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`);
        return url.hostname.includes(".");
    }
    catch {
        return false;
    }
}
/**
 * Acepta YYYY-MM-DD o ISO completo (YYYY-MM-DDTHH:mm...).
 */
function esFechaValida(valor) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    if (!match)
        return false;
    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    return (fecha.getUTCFullYear() === anio &&
        fecha.getUTCMonth() === mes - 1 &&
        fecha.getUTCDate() === dia);
}
function maxLengthCampo(campo) {
    if (campo.maxLength)
        return campo.maxLength;
    return campo.tipo === "textarea" ? 2000 : 300;
}
/* =====================================================
   VALIDAR UN CAMPO
===================================================== */
/**
 * Devuelve un mensaje de error o null si es válido.
 * Los valores vacíos no se validan aquí.
 */
export function validarValorCampoFichaLeypd(campo, valor) {
    if (esValorVacio(valor))
        return null;
    if (campo.tipo === "text" ||
        campo.tipo === "textarea" ||
        campo.tipo === "email" ||
        campo.tipo === "date") {
        if (typeof valor !== "string") {
            return "Debe ser texto.";
        }
        const max = maxLengthCampo(campo);
        if (valor.length > max) {
            return `Máximo ${max} caracteres.`;
        }
        switch (campo.formato) {
            case "rut":
                return validarRutChileno(valor)
                    ? null
                    : "RUT inválido. Verifique número y dígito verificador.";
            case "email":
                return esEmailValido(valor.trim())
                    ? null
                    : "Correo electrónico inválido.";
            case "url_o_no_tiene":
                return esUrlONoTiene(valor)
                    ? null
                    : "Ingrese una dirección web válida o «No tiene».";
            case "fecha":
                return esFechaValida(valor)
                    ? null
                    : "Fecha inválida.";
        }
    }
    return null;
}
/* =====================================================
   VALIDAR CAMBIOS
===================================================== */
/**
 * Valida un payload de cambios:
 * - solo keys del catálogo oficial
 * - formato y largo de cada valor no vacío
 */
export function validarCambiosFichaLeypd(datos) {
    const errores = {};
    for (const [key, valor] of Object.entries(datos)) {
        const campo = obtenerCampoFichaLeypd(key);
        if (!campo) {
            errores[key] = "Campo no reconocido.";
            continue;
        }
        const error = validarValorCampoFichaLeypd(campo, valor);
        if (error) {
            errores[key] = error;
        }
    }
    if (Object.keys(errores).length > 0) {
        throw new FichaLeypdValidacionError(errores);
    }
}
/**
 * Verifica obligatorios sobre los datos finales.
 *
 * Las preguntas condicionales no se exigen
 * hasta implementar la aplicabilidad (Fase A.2).
 */
export function validarObligatoriosFichaLeypd(datosFinales) {
    const errores = {};
    for (const campo of FICHA_LEYPD_CAMPOS) {
        if (!campo.obligatorio || campo.condicion)
            continue;
        if (esValorVacio(datosFinales[campo.key]?.valor)) {
            errores[campo.key] = "Campo obligatorio.";
        }
    }
    if (Object.keys(errores).length > 0) {
        throw new FichaLeypdValidacionError(errores);
    }
}
//# sourceMappingURL=leypd-ficha-validacion.js.map