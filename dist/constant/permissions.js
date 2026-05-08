// src/constants/permissions.ts
export const PERMISSIONS = {
    // =====================
    // General / Inicio
    // =====================
    HOME_VIEW: "HOME_VIEW",
    // =====================
    // Empresas / Clientes
    // =====================
    EMPRESAS_VIEW: "EMPRESAS_VIEW",
    EMPRESAS_CREATE: "EMPRESAS_CREATE",
    EMPRESAS_EDIT: "EMPRESAS_EDIT",
    EMPRESAS_DELETE: "EMPRESAS_DELETE",
    EMPRESAS_TECH_VIEW: "EMPRESAS_TECH_VIEW",
    EMPRESAS_TECH_EDIT: "EMPRESAS_TECH_EDIT",
    // =====================
    // Solicitantes / Usuarios cliente
    // =====================
    SOLICITANTES_VIEW: "SOLICITANTES_VIEW",
    SOLICITANTES_CREATE: "SOLICITANTES_CREATE",
    SOLICITANTES_EDIT: "SOLICITANTES_EDIT",
    SOLICITANTES_DELETE: "SOLICITANTES_DELETE",
    // =====================
    // Equipos
    // =====================
    EQUIPOS_VIEW: "EQUIPOS_VIEW",
    EQUIPOS_CREATE: "EQUIPOS_CREATE",
    EQUIPOS_EDIT: "EQUIPOS_EDIT",
    EQUIPOS_DELETE: "EQUIPOS_DELETE",
    // =====================
    // Técnicos / Usuarios internos
    // =====================
    TECNICOS_VIEW: "TECNICOS_VIEW",
    TECNICOS_CREATE: "TECNICOS_CREATE",
    TECNICOS_EDIT: "TECNICOS_EDIT",
    TECNICOS_DELETE: "TECNICOS_DELETE",
    TECNICOS_CHANGE_ROLE: "TECNICOS_CHANGE_ROLE",
    // =====================
    // Visitas
    // =====================
    VISITAS_VIEW: "VISITAS_VIEW",
    VISITAS_CREATE: "VISITAS_CREATE",
    VISITAS_EDIT: "VISITAS_EDIT",
    VISITAS_DELETE: "VISITAS_DELETE",
    VISITAS_DASHBOARD_VIEW: "VISITAS_DASHBOARD_VIEW",
    // =====================
    // Agenda
    // =====================
    AGENDA_VIEW: "AGENDA_VIEW",
    AGENDA_CREATE: "AGENDA_CREATE",
    AGENDA_EDIT: "AGENDA_EDIT",
    AGENDA_DELETE: "AGENDA_DELETE",
    // =====================
    // Mantenciones remotas / TeamViewer
    // =====================
    MANTENCIONES_VIEW: "MANTENCIONES_VIEW",
    MANTENCIONES_CREATE: "MANTENCIONES_CREATE",
    MANTENCIONES_EDIT: "MANTENCIONES_EDIT",
    MANTENCIONES_DELETE: "MANTENCIONES_DELETE",
    MANTENCIONES_DASHBOARD_VIEW: "MANTENCIONES_DASHBOARD_VIEW",
    // =====================
    // Tickets / Helpdesk
    // =====================
    TICKETS_VIEW: "TICKETS_VIEW",
    TICKETS_CREATE: "TICKETS_CREATE",
    TICKETS_REPLY: "TICKETS_REPLY",
    TICKETS_INTERNAL_NOTE: "TICKETS_INTERNAL_NOTE",
    TICKETS_ASSIGN: "TICKETS_ASSIGN",
    TICKETS_CHANGE_STATUS: "TICKETS_CHANGE_STATUS",
    TICKETS_CHANGE_PRIORITY: "TICKETS_CHANGE_PRIORITY",
    TICKETS_CLOSE: "TICKETS_CLOSE",
    TICKETS_DELETE: "TICKETS_DELETE",
    TICKETS_DASHBOARD_VIEW: "TICKETS_DASHBOARD_VIEW",
    TICKETS_SLA_VIEW: "TICKETS_SLA_VIEW",
    TICKETS_SLA_MANAGE: "TICKETS_SLA_MANAGE",
    TICKETS_TEMPLATES_MANAGE: "TICKETS_TEMPLATES_MANAGE",
    // =====================
    // Cotizaciones / Gestioo
    // =====================
    COTIZACIONES_VIEW: "COTIZACIONES_VIEW",
    COTIZACIONES_CREATE: "COTIZACIONES_CREATE",
    COTIZACIONES_EDIT: "COTIZACIONES_EDIT",
    COTIZACIONES_DELETE: "COTIZACIONES_DELETE",
    COTIZACIONES_APPROVE: "COTIZACIONES_APPROVE",
    COTIZACIONES_GENERATE_PDF: "COTIZACIONES_GENERATE_PDF",
    // =====================
    // Productos / Servicios / Inventario
    // =====================
    PRODUCTOS_VIEW: "PRODUCTOS_VIEW",
    PRODUCTOS_CREATE: "PRODUCTOS_CREATE",
    PRODUCTOS_EDIT: "PRODUCTOS_EDIT",
    PRODUCTOS_DELETE: "PRODUCTOS_DELETE",
    SERVICIOS_VIEW: "SERVICIOS_VIEW",
    SERVICIOS_CREATE: "SERVICIOS_CREATE",
    SERVICIOS_EDIT: "SERVICIOS_EDIT",
    SERVICIOS_DELETE: "SERVICIOS_DELETE",
    // =====================
    // Órdenes de taller / Trabajos
    // =====================
    ORDENES_VIEW: "ORDENES_VIEW",
    ORDENES_CREATE: "ORDENES_CREATE",
    ORDENES_EDIT: "ORDENES_EDIT",
    ORDENES_DELETE: "ORDENES_DELETE",
    ORDENES_CHANGE_STATUS: "ORDENES_CHANGE_STATUS",
    // =====================
    // Documentos / Entregas
    // =====================
    DOCUMENTOS_VIEW: "DOCUMENTOS_VIEW",
    DOCUMENTOS_CREATE: "DOCUMENTOS_CREATE",
    DOCUMENTOS_EDIT: "DOCUMENTOS_EDIT",
    DOCUMENTOS_DELETE: "DOCUMENTOS_DELETE",
    ENTREGAS_VIEW: "ENTREGAS_VIEW",
    ENTREGAS_CREATE: "ENTREGAS_CREATE",
    ENTREGAS_EDIT: "ENTREGAS_EDIT",
    ENTREGAS_DELETE: "ENTREGAS_DELETE",
    // =====================
    // Facturación / SII / RCV
    // =====================
    FACTURAS_VIEW: "FACTURAS_VIEW",
    FACTURAS_VENTAS_VIEW: "FACTURAS_VENTAS_VIEW",
    FACTURAS_COMPRAS_VIEW: "FACTURAS_COMPRAS_VIEW",
    FACTURAS_SYNC: "FACTURAS_SYNC",
    FACTURAS_DETALLE_VIEW: "FACTURAS_DETALLE_VIEW",
    FACTURAS_EXPORT: "FACTURAS_EXPORT",
    FACTURAS_CONFIG_MANAGE: "FACTURAS_CONFIG_MANAGE",
    // =====================
    // Reportes
    // =====================
    REPORTES_VIEW: "REPORTES_VIEW",
    REPORTES_CREATE: "REPORTES_CREATE",
    REPORTES_DOWNLOAD: "REPORTES_DOWNLOAD",
    REPORTES_HISTORY_VIEW: "REPORTES_HISTORY_VIEW",
    REPORTES_DELETE: "REPORTES_DELETE",
    // =====================
    // Freshdesk histórico
    // =====================
    FRESHDESK_VIEW: "FRESHDESK_VIEW",
    FRESHDESK_SYNC: "FRESHDESK_SYNC",
    FRESHDESK_DASHBOARD_VIEW: "FRESHDESK_DASHBOARD_VIEW",
    // =====================
    // Configuración general
    // =====================
    SETTINGS_VIEW: "SETTINGS_VIEW",
    SETTINGS_MANAGE: "SETTINGS_MANAGE",
    // =====================
    // Auditoría / Logs
    // =====================
    AUDIT_LOGS_VIEW: "AUDIT_LOGS_VIEW",
};
export const PERMISSION_LABELS = {
    HOME_VIEW: "Ver inicio",
    EMPRESAS_VIEW: "Ver empresas",
    EMPRESAS_CREATE: "Crear empresas",
    EMPRESAS_EDIT: "Editar empresas",
    EMPRESAS_DELETE: "Eliminar empresas",
    EMPRESAS_TECH_VIEW: "Ver ficha técnica de empresa",
    EMPRESAS_TECH_EDIT: "Editar ficha técnica de empresa",
    SOLICITANTES_VIEW: "Ver solicitantes",
    SOLICITANTES_CREATE: "Crear solicitantes",
    SOLICITANTES_EDIT: "Editar solicitantes",
    SOLICITANTES_DELETE: "Eliminar solicitantes",
    EQUIPOS_VIEW: "Ver equipos",
    EQUIPOS_CREATE: "Crear equipos",
    EQUIPOS_EDIT: "Editar equipos",
    EQUIPOS_DELETE: "Eliminar equipos",
    TECNICOS_VIEW: "Ver técnicos/usuarios",
    TECNICOS_CREATE: "Crear técnicos/usuarios",
    TECNICOS_EDIT: "Editar técnicos/usuarios",
    TECNICOS_DELETE: "Eliminar técnicos/usuarios",
    TECNICOS_CHANGE_ROLE: "Cambiar rol de usuario",
    VISITAS_VIEW: "Ver visitas",
    VISITAS_CREATE: "Crear visitas",
    VISITAS_EDIT: "Editar visitas",
    VISITAS_DELETE: "Eliminar visitas",
    VISITAS_DASHBOARD_VIEW: "Ver dashboard de visitas",
    AGENDA_VIEW: "Ver agenda",
    AGENDA_CREATE: "Crear agenda",
    AGENDA_EDIT: "Editar agenda",
    AGENDA_DELETE: "Eliminar agenda",
    MANTENCIONES_VIEW: "Ver mantenciones remotas",
    MANTENCIONES_CREATE: "Crear mantenciones remotas",
    MANTENCIONES_EDIT: "Editar mantenciones remotas",
    MANTENCIONES_DELETE: "Eliminar mantenciones remotas",
    MANTENCIONES_DASHBOARD_VIEW: "Ver dashboard de mantenciones remotas",
    TICKETS_VIEW: "Ver tickets",
    TICKETS_CREATE: "Crear tickets",
    TICKETS_REPLY: "Responder tickets",
    TICKETS_INTERNAL_NOTE: "Crear nota interna",
    TICKETS_ASSIGN: "Asignar tickets",
    TICKETS_CHANGE_STATUS: "Cambiar estado de tickets",
    TICKETS_CHANGE_PRIORITY: "Cambiar prioridad de tickets",
    TICKETS_CLOSE: "Cerrar tickets",
    TICKETS_DELETE: "Eliminar tickets",
    TICKETS_DASHBOARD_VIEW: "Ver dashboard de tickets",
    TICKETS_SLA_VIEW: "Ver SLA de tickets",
    TICKETS_SLA_MANAGE: "Administrar SLA de tickets",
    TICKETS_TEMPLATES_MANAGE: "Administrar plantillas de tickets",
    COTIZACIONES_VIEW: "Ver cotizaciones",
    COTIZACIONES_CREATE: "Crear cotizaciones",
    COTIZACIONES_EDIT: "Editar cotizaciones",
    COTIZACIONES_DELETE: "Eliminar cotizaciones",
    COTIZACIONES_APPROVE: "Aprobar cotizaciones",
    COTIZACIONES_GENERATE_PDF: "Generar PDF de cotización",
    PRODUCTOS_VIEW: "Ver productos",
    PRODUCTOS_CREATE: "Crear productos",
    PRODUCTOS_EDIT: "Editar productos",
    PRODUCTOS_DELETE: "Eliminar productos",
    SERVICIOS_VIEW: "Ver servicios",
    SERVICIOS_CREATE: "Crear servicios",
    SERVICIOS_EDIT: "Editar servicios",
    SERVICIOS_DELETE: "Eliminar servicios",
    ORDENES_VIEW: "Ver órdenes de taller",
    ORDENES_CREATE: "Crear órdenes de taller",
    ORDENES_EDIT: "Editar órdenes de taller",
    ORDENES_DELETE: "Eliminar órdenes de taller",
    ORDENES_CHANGE_STATUS: "Cambiar estado de órdenes",
    DOCUMENTOS_VIEW: "Ver documentos",
    DOCUMENTOS_CREATE: "Crear documentos",
    DOCUMENTOS_EDIT: "Editar documentos",
    DOCUMENTOS_DELETE: "Eliminar documentos",
    ENTREGAS_VIEW: "Ver entregas",
    ENTREGAS_CREATE: "Crear entregas",
    ENTREGAS_EDIT: "Editar entregas",
    ENTREGAS_DELETE: "Eliminar entregas",
    FACTURAS_VIEW: "Ver módulo de facturación",
    FACTURAS_VENTAS_VIEW: "Ver ventas RCV",
    FACTURAS_COMPRAS_VIEW: "Ver compras RCV",
    FACTURAS_SYNC: "Sincronizar facturas",
    FACTURAS_DETALLE_VIEW: "Ver detalle de factura",
    FACTURAS_EXPORT: "Exportar facturas",
    FACTURAS_CONFIG_MANAGE: "Administrar configuración de facturación",
    REPORTES_VIEW: "Ver reportes",
    REPORTES_CREATE: "Generar reportes",
    REPORTES_DOWNLOAD: "Descargar reportes",
    REPORTES_HISTORY_VIEW: "Ver historial de reportes",
    REPORTES_DELETE: "Eliminar reportes",
    FRESHDESK_VIEW: "Ver Freshdesk histórico",
    FRESHDESK_SYNC: "Sincronizar Freshdesk",
    FRESHDESK_DASHBOARD_VIEW: "Ver dashboard Freshdesk",
    SETTINGS_VIEW: "Ver configuración",
    SETTINGS_MANAGE: "Administrar configuración",
    AUDIT_LOGS_VIEW: "Ver auditoría/logs",
};
//# sourceMappingURL=permissions.js.map