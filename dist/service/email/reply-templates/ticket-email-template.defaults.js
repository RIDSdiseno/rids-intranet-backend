export const TICKET_EMAIL_TEMPLATE_KEYS = {
    AUTO_REPLY_INBOUND: "AUTO_REPLY_INBOUND",
    TICKET_CREATED_WEB: "TICKET_CREATED_WEB",
    AGENT_REPLY: "AGENT_REPLY",
};
export const DEFAULT_TICKET_EMAIL_TEMPLATES = [
    {
        key: TICKET_EMAIL_TEMPLATE_KEYS.AUTO_REPLY_INBOUND,
        name: "Respuesta automática correo entrante",
        subjectTpl: "Hemos recibido su solicitud [Ticket #{{ticketId}}]",
        bodyHtmlTpl: `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; font-size:14px; color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
  <tr>
    <td style="max-width:600px;">
      <p>Hola <strong>{{nombre}}</strong></p>

      <p>Estimad@</p>

      <p>
        Hemos recibido correctamente su solicitud de soporte. Su ticket ha sido ingresado
        en nuestro sistema y será revisado por nuestro equipo.
      </p>

      <p>
        Próximamente recibirá una actualización sobre el estado de su requerimiento.
        Puede responder a este mismo correo si desea agregar más información.
      </p>

      <p>
        <strong>N° de ticket:</strong> #{{ticketId}}<br/>
        <strong>Asunto:</strong> {{subject}}<br/>
        <strong>Área:</strong> Soporte Técnico / Atención al Cliente
      </p>

      <p>Agradecemos su contacto y confianza.</p>

      {{firmaHtml}}

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />

      <p style="color:#666; font-size:13px;">
        <strong>{{nombre}}</strong> escribió:<br/>
        <em>{{bodyOriginal}}</em>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`.trim(),
        isEnabled: true,
    },
    {
        key: TICKET_EMAIL_TEMPLATE_KEYS.TICKET_CREATED_WEB,
        name: "Confirmación ticket creado desde la web",
        subjectTpl: "Confirmación de ticket #{{ticketId}} - {{subject}}",
        bodyHtmlTpl: `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; font-size:14px; color:#333; padding:20px; max-width:600px;">
  <p><strong>Ticket #{{ticketId}}</strong></p>

  <p><strong>Asunto:</strong> {{subject}}</p>

  <p><strong>Detalle:</strong></p>

  <div style="line-height:1.6;">
    {{messageHtml}}
  </div>

  {{firmaHtml}}

  <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />

  <p style="font-size:12px; color:#666;">
    <strong>Ticket #{{ticketId}}</strong> · {{subject}}<br/>
    Soporte Técnico · Asesorías RIDS Ltda.<br/>
    soporte@rids.cl
  </p>
</body>
</html>`.trim(),
        isEnabled: true,
    },
    {
        key: TICKET_EMAIL_TEMPLATE_KEYS.AGENT_REPLY,
        name: "Respuesta del agente",
        subjectTpl: "Re: Ticket #{{ticketId}} - {{subject}}",
        bodyHtmlTpl: `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; font-size:14px; color:#333; padding:20px; max-width:600px;">
  <p>{{messageHtml}}</p>

  {{firmaHtml}}

  <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />

  <p style="font-size:12px; color:#666;">
    <strong>Ticket #{{ticketId}}</strong> · {{subject}}<br/>
    Soporte Técnico · Asesorías RIDS Ltda.<br/>
    soporte@rids.cl
  </p>
</body>
</html>`.trim(),
        isEnabled: true,
    },
];
//# sourceMappingURL=ticket-email-template.defaults.js.map