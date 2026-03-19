import { Router } from "express";
import { graphReaderService } from "../service/email/graph-reader.service.js";
import { prisma } from "../lib/prisma.js";
const correoRouter = Router();
correoRouter.post("/test", async (req, res) => {
    const { to, subject, bodyHtml } = req.body;
    if (!to || !subject || !bodyHtml) {
        return res.status(400).json({
            ok: false,
            message: "Los campos 'to', 'subject' y 'bodyHtml' son requeridos",
        });
    }
    try {
        await graphReaderService.sendReplyEmail({ to, subject, bodyHtml });
        return res.json({ ok: true, message: "Correo enviado correctamente" });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message ?? "Error al enviar el correo",
        });
    }
});
correoRouter.post("/test-visita/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({
            ok: false,
            message: "Debe proporcionar el ID de la visita",
        });
    }
    const idRaw = Number(id);
    if (!Number.isInteger(idRaw) || idRaw <= 0) {
        return res.status(400).json({
            ok: false,
            message: "ID de visita inválido",
        });
    }
    const correoPrueba = process.env.CORREO_PRUEBA_DESTINO;
    if (!correoPrueba) {
        return res.status(500).json({
            ok: false,
            message: "La variable de entorno CORREO_PRUEBA_DESTINO no está definida",
        });
    }
    try {
        const visita = await prisma.visita.findUnique({
            where: { id_visita: idRaw },
            include: {
                solicitanteRef: true,
                tecnico: true,
                empresa: true,
            },
        });
        if (!visita) {
            return res.status(404).json({
                ok: false,
                message: `No se encontró una visita con id ${idRaw}`,
            });
        }
        const nombreSolicitante = visita.solicitanteRef?.nombre ?? visita.solicitante ?? "Sin nombre";
        const nombreTecnico = visita.tecnico?.nombre ?? "Sin técnico asignado";
        const nombreEmpresa = visita.empresa?.nombre ?? "Sin empresa";
        const fechaInicio = visita.inicio.toLocaleString("es-CL", {
            timeZone: "America/Santiago",
            dateStyle: "full",
            timeStyle: "short",
        });
        const subject = `[PRUEBA] Recordatorio de visita - ${nombreEmpresa}`;
        const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #f5a623; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">⚠️ CORREO DE PRUEBA - NO ES UN ENVÍO REAL AL CLIENTE</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Recordatorio de visita técnica</h2>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Visita ID #${visita.id_visita}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Solicitante</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${nombreSolicitante}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${nombreEmpresa}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Técnico asignado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${nombreTecnico}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Fecha de visita</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${fechaInicio}</td>
    </tr>
  </table>

  <p style="margin-top: 24px; color: #555;">
    Este correo es un recordatorio de su próxima visita técnica. Si tiene alguna consulta o necesita reprogramar, no dude en contactarnos.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este es un correo de prueba enviado a <strong>${correoPrueba}</strong>. El destinatario real NO ha sido notificado.
  </p>
</div>
    `.trim();
        await graphReaderService.sendReplyEmail({
            to: correoPrueba,
            subject,
            bodyHtml,
        });
        return res.json({
            ok: true,
            message: "Correo de prueba de visita enviado correctamente",
            to: correoPrueba,
            visitaId: visita.id_visita,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message ?? "Error al enviar el correo de prueba de visita",
        });
    }
});
correoRouter.post("/test-agenda/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({
            ok: false,
            message: "Debe proporcionar el ID de la agenda",
        });
    }
    const agendaId = Number(id);
    if (!Number.isInteger(agendaId) || agendaId <= 0) {
        return res.status(400).json({
            ok: false,
            message: "ID de agenda inválido",
        });
    }
    try {
        const agenda = await prisma.agendaVisita.findUnique({
            where: { id: agendaId },
            include: {
                empresa: true,
                tecnicos: {
                    include: {
                        tecnico: true,
                    },
                },
            },
        });
        if (!agenda) {
            return res.status(404).json({
                ok: false,
                message: `No se encontró una agenda con id ${agendaId}`,
            });
        }
        if (agenda.tecnicos.length === 0) {
            return res.status(400).json({
                ok: false,
                message: "La agenda no tiene técnicos asignados",
            });
        }
        const correoPrueba = process.env.CORREO_PRUEBA_DESTINO;
        if (!correoPrueba) {
            return res.status(500).json({
                ok: false,
                message: "La variable de entorno CORREO_PRUEBA_DESTINO no está definida",
            });
        }
        const nombreEmpresa = agenda.empresa?.nombre ?? "Sin empresa";
        const fechaAgenda = agenda.fecha.toISOString().slice(0, 10);
        const tecnicosHtml = agenda.tecnicos
            .map(({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${tecnico.nombre}</strong> - ${tecnico.email}
    </li>`)
            .join("");
        const subject = `[PRUEBA] Agenda técnica - ${nombreEmpresa}`;
        const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #f5a623; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">CORREO DE PRUEBA - NO SE ENVIARÁ A LOS TÉCNICOS REALES</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Prueba de agenda técnica</h2>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${agenda.id}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${fechaAgenda}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${nombreEmpresa}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.tipo}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.estado}</td>
    </tr>
    ${agenda.horaInicio?.trim()
            ? `
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.horaInicio.trim()}</td>
    </tr>`
            : ""}
    ${agenda.horaFin?.trim()
            ? `
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.horaFin.trim()}</td>
    </tr>`
            : ""}
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Técnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  ${agenda.mensaje?.trim()
            ? `
  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Mensaje para técnico</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${agenda.mensaje.trim()}</p>
  </div>`
            : ""}

  ${agenda.notas?.trim()
            ? `
  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Notas internas</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${agenda.notas.trim()}</p>
  </div>`
            : ""}

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este es un correo de prueba enviado a <strong>${correoPrueba}</strong>. Los técnicos reales no han sido notificados.
  </p>
</div>
    `.trim();
        await graphReaderService.sendReplyEmail({
            to: correoPrueba,
            subject,
            bodyHtml,
        });
        return res.json({
            ok: true,
            message: "Correo de prueba de agenda enviado correctamente",
            to: correoPrueba,
            agendaId: agenda.id,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message ?? "Error al enviar el correo de prueba de agenda",
        });
    }
});
correoRouter.post("/enviar-agenda/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({
            ok: false,
            message: "Debe proporcionar el ID de la agenda",
        });
    }
    const agendaId = Number(id);
    if (!Number.isInteger(agendaId) || agendaId <= 0) {
        return res.status(400).json({
            ok: false,
            message: "ID de agenda inválido",
        });
    }
    try {
        const agenda = await prisma.agendaVisita.findUnique({
            where: { id: agendaId },
            include: {
                empresa: true,
                tecnicos: {
                    include: {
                        tecnico: true,
                    },
                },
            },
        });
        if (!agenda) {
            return res.status(404).json({
                ok: false,
                message: `No se encontró una agenda con id ${agendaId}`,
            });
        }
        if (agenda.tecnicos.length === 0) {
            return res.status(400).json({
                ok: false,
                message: "La agenda no tiene técnicos asignados",
            });
        }
        const destinatariosValidos = agenda.tecnicos
            .map(({ tecnico }) => tecnico.email?.trim())
            .filter((email) => Boolean(email));
        if (destinatariosValidos.length === 0) {
            return res.status(400).json({
                ok: false,
                message: "La agenda no tiene correos válidos para envío",
            });
        }
        const nombreEmpresa = agenda.empresa?.nombre ?? "Sin empresa";
        const fechaAgenda = agenda.fecha.toISOString().slice(0, 10);
        const tecnicosHtml = agenda.tecnicos
            .map(({ tecnico }) => {
            const email = tecnico.email?.trim();
            return `
    <li style="margin-bottom: 8px;">
      <strong>${tecnico.nombre}</strong> - ${email || "Sin email"}
    </li>`;
        })
            .join("");
        const subject = `[AGENDA] Agenda técnica - ${nombreEmpresa}`;
        const bodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background-color: #f5a623; padding: 12px 20px; border-radius: 6px 6px 0 0; margin-bottom: 20px;">
    <strong style="color: #fff; font-size: 14px;">AGENDA TÉCNICA ASIGNADA - CORREO ENVIADO A LOS TÉCNICOS ASIGNADOS</strong>
  </div>

  <h2 style="color: #333; margin-bottom: 4px;">Agenda técnica</h2>
  <p style="color: #888; font-size: 13px; margin-top: 0;">Agenda ID #${agenda.id}</p>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; width: 40%; border: 1px solid #eee;">Fecha</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${fechaAgenda}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Empresa</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${nombreEmpresa}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Tipo</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.tipo}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Estado</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.estado}</td>
    </tr>
    ${agenda.horaInicio?.trim()
            ? `
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora inicio</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.horaInicio.trim()}</td>
    </tr>`
            : ""}
    ${agenda.horaFin?.trim()
            ? `
    <tr>
      <td style="padding: 8px 12px; background: #f9f9f9; font-weight: bold; border: 1px solid #eee;">Hora fin</td>
      <td style="padding: 8px 12px; border: 1px solid #eee;">${agenda.horaFin.trim()}</td>
    </tr>`
            : ""}
  </table>

  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Técnicos asignados</h3>
    <ul style="padding-left: 20px; color: #555;">
${tecnicosHtml}
    </ul>
  </div>

  ${agenda.mensaje?.trim()
            ? `
  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Mensaje para técnico</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${agenda.mensaje.trim()}</p>
  </div>`
            : ""}

  ${agenda.notas?.trim()
            ? `
  <div style="margin-top: 24px;">
    <h3 style="color: #333; margin-bottom: 12px;">Notas internas</h3>
    <p style="color: #555; margin: 0; line-height: 1.5;">${agenda.notas.trim()}</p>
  </div>`
            : ""}

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 11px; color: #aaa; text-align: center;">
    Este correo fue enviado a los técnicos asignados a esta agenda.
  </p>
</div>
    `.trim();
        const destinatarios = [];
        for (const to of destinatariosValidos) {
            await graphReaderService.sendReplyEmail({
                to,
                subject,
                bodyHtml,
            });
            destinatarios.push(to);
        }
        return res.json({
            ok: true,
            message: "Correo de agenda enviado correctamente",
            destinatarios,
            agendaId: agenda.id,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message ?? "Error al enviar el correo de agenda",
        });
    }
});
export default correoRouter;
//# sourceMappingURL=correo.routes.js.map