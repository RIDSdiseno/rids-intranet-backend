export const asBool = (v) => v === true || v === 1 || v === "1";
export function contarMantenimientos(visitas) {
    let rendimientoEquipo = 0;
    let ccleaner = 0;
    let actualizaciones = 0;
    let licenciaOffice = 0;
    let antivirus = 0;
    let licenciaWindows = 0;
    let estadoDisco = 0;
    let mantenimientoReloj = 0;
    for (const v of visitas) {
        if (asBool(v.rendimientoEquipo))
            rendimientoEquipo++;
        if (asBool(v.ccleaner))
            ccleaner++;
        if (asBool(v.actualizaciones))
            actualizaciones++;
        if (asBool(v.licenciaOffice))
            licenciaOffice++;
        if (asBool(v.antivirus))
            antivirus++;
        if (asBool(v.licenciaWindows))
            licenciaWindows++;
        if (asBool(v.estadoDisco))
            estadoDisco++;
        if (asBool(v.mantenimientoReloj))
            mantenimientoReloj++;
    }
    return [
        { item: "Rendimiento del equipo", cantidad: rendimientoEquipo },
        { item: "CCleaner", cantidad: ccleaner },
        { item: "Actualizaciones", cantidad: actualizaciones },
        { item: "Licencia Office", cantidad: licenciaOffice },
        { item: "Antivirus", cantidad: antivirus },
        { item: "Licencia Windows", cantidad: licenciaWindows },
        { item: "Estado del disco", cantidad: estadoDisco },
        { item: "Mantenimiento del reloj", cantidad: mantenimientoReloj },
    ];
}
export function contarExtras(visitas) {
    let impresoras = 0;
    let telefonos = 0;
    let pie = 0;
    let otros = 0;
    const detMap = new Map();
    for (const v of visitas) {
        if (asBool(v.confImpresoras))
            impresoras++;
        if (asBool(v.confTelefonos))
            telefonos++;
        if (asBool(v.confPiePagina))
            pie++;
        if (asBool(v.otros)) {
            otros++;
            const det = (v.otrosDetalle ?? "—").trim() || "—";
            detMap.set(det, (detMap.get(det) || 0) + 1);
        }
    }
    return {
        totales: [
            { item: "Impresoras", cantidad: impresoras },
            { item: "Teléfonos", cantidad: telefonos },
            { item: "Pie de página", cantidad: pie },
            { item: "Otros", cantidad: otros },
        ],
        detalles: Array.from(detMap.entries()).map(([detalle, cantidad]) => ({
            detalle,
            cantidad,
        })),
    };
}
export function contarTiposVisita(visitas) {
    let programadas = 0;
    let adicionales = 0;
    for (const v of visitas) {
        if (asBool(v.actualizaciones) ||
            asBool(v.antivirus) ||
            asBool(v.ccleaner) ||
            asBool(v.estadoDisco) ||
            asBool(v.mantenimientoReloj) ||
            asBool(v.rendimientoEquipo)) {
            programadas++;
        }
        else {
            adicionales++;
        }
    }
    return [
        { tipo: "Solicitud Programada", cantidad: programadas },
        { tipo: "Solicitudes adicionales", cantidad: adicionales },
    ];
}
export function obtenerTopUsuariosGeneral(visitas, tickets) {
    const conteo = {};
    for (const v of visitas) {
        const user = v.solicitante ?? "Sin nombre";
        conteo[user] = (conteo[user] || 0) + 1;
    }
    for (const t of tickets) {
        const user = t.ticketRequester?.name ?? "Sin nombre";
        conteo[user] = (conteo[user] || 0) + 1;
    }
    return Object.entries(conteo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([usuario, solicitudes]) => ({
        usuario,
        solicitudes,
    }));
}
//# sourceMappingURL=reportes.metrics.js.map