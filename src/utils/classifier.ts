export type TicketArea = "SOPORTE" | "INFORMATICA" | "VENTAS" | "ADMIN";

export const AREA_KEYWORDS: Record<TicketArea, string[]> = {
    INFORMATICA: ["infraestuctura", "servidor", "red", "conectividad", "backup", "base de datos", "nube", "hosting", "almacenamiento", "router", "switch", "dimage", "cintax", "error", "seguridad", "vulnerabilidad", "virus", "phishing", "hackeo", "sospechoso", "alerta", "certificado", "firewall", "Acceso", "login", "contraseña", "mfa", "token", "bloqueo", "credenciales", "permisos", "usuario", "hardware", "software", "actualizacion", "actualización", "pantalla azul", "pantalla", "monitor", "teclado", "mouse", "impresora", "toner", "laptop", "computadora", "cargador", "problema", "no funciona", "sistema", "soporte", "ti", "it", "windows", "correo", "outlook", "office", "vpn"],
    VENTAS: ["confirmación de orden", "confirmacion de orden", "Documentación", "cotizacion", "presupuesto", "factura", "boleta", "nota de credito", "guia de despacho", "orden de compra", "Logistica", "despacho", "stock", "inventario", "entrega", "retraso", "transporte", "bodega", "producto", "Finanzas", "pago", "transferencia", "reembolso", "devolucion", "descuento", "abono", "cobranza", "cuenta corriente", "orden #", "orden", "pedido", "compra", "cotización", "cliente", "ventas", "store@intcomex.com", "intcomex", "adelanto", "fpay", "facturación", "facturacion"],
    SOPORTE: ["soporte técnico", "soporte tecnico", "ayuda", "asistencia", "reparacion", "mantenimiento"],
    ADMIN: ["facturacion", "facturación", "pago", "transferencia", "sueldo", "nomina", "nómina", "honorarios", "contrato", "anexo", "liquidación", "liquidación", "presupuesto", "gasto", "reembolso", "rendicion", "rendición", "banco", "cartola", "SII", "impuestos", "tesoreria", "tesorería", "aprobacion", "aprobación", "firma", "autorizacion", "autorización", "gerencia", "jefatura", "recursos humanos", "rrhh"]
};

export function classifyTicket(text: string): TicketArea {
    const lowerText = text.toLowerCase();
    let bestArea: TicketArea = "SOPORTE"; 
    let maxMatches = 0;

    for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
        const matches = keywords.filter(word => lowerText.includes(word.toLowerCase())).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestArea = area as TicketArea;
        }
    }
    return bestArea;
}