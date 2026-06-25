import { Router } from "express";
import type { Request, Response } from "express";
import { graphReaderService } from "../service/email/graph-reader.service.js";
import { prisma } from "../lib/prisma.js";

// Simple in-memory job store for mailer jobs (ephemeral)
type MailerJob = {
  id: string;
  createdAt: number;
  ratePerMin: number;
  total: number;
  successes: string[];
  failures: Array<{ to?: string; error: string }>;
  completed: number;
  status: 'queued' | 'processing' | 'done';
};

const mailerJobs: Record<string, MailerJob> = {};

const correoRouter = Router();

correoRouter.post("/test", async (req: Request, res: Response) => {
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message ?? "Error al enviar el correo",
    });
  }
});

correoRouter.post("/test-visita/:id", async (req: Request, res: Response) => {
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

    const nombreSolicitante =
      visita.solicitanteRef?.nombre ?? visita.solicitante ?? "Sin nombre";
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message ?? "Error al enviar el correo de prueba de visita",
    });
  }
});

correoRouter.post("/test-agenda/:id", async (req: Request, res: Response) => {
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
      .map(
        ({ tecnico }) => `
    <li style="margin-bottom: 8px;">
      <strong>${tecnico.nombre}</strong> - ${tecnico.email}
    </li>`
      )
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message ?? "Error al enviar el correo de prueba de agenda",
    });
  }
});

correoRouter.post("/enviar-agenda/:id", async (req: Request, res: Response) => {
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
      .filter((email): email is string => Boolean(email));

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

    const destinatarios: string[] = [];

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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message ?? "Error al enviar el correo de agenda",
    });
  }
});

export default correoRouter;

// Endpoint para envío masivo desde UI Mailer
correoRouter.post("/enviar-masivo", async (req: Request, res: Response) => {
  const { targets, subject, bodyHtml } = req.body as {
    targets?: Array<{ id?: number; nombre?: string; email?: string; attachments?: any[] }>;
    subject?: string;
    bodyHtml?: string;
    ratePerMin?: number;
  };

  if (!Array.isArray(targets) || !subject || !bodyHtml) {
    return res.status(400).json({ ok: false, message: "Se requieren 'targets', 'subject' y 'bodyHtml'" });
  }

  // attachments opcionales en el body: [{ name, contentType, contentBytes }]
  const globalAttachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

  const validTargets = targets
    .map((t) => ({ ...t, email: (t?.email ?? "").trim() }))
    .filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.email));

  const jobId = `mailjob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  mailerJobs[jobId] = {
    id: jobId,
    createdAt: Date.now(),
    ratePerMin: 0,
    total: validTargets.length,
    successes: [],
    failures: [],
    completed: 0,
    status: 'queued',
  };

  // Schedule sends spaced by delayMs
  // Registrar entradas iniciales para cada destinatario para garantizar que quede rastro
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const DATA_PATH = path.resolve(__dirname, "../../data/cotizaciones-enviadas.json");

    const rowsRaw = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, 'utf8') : '[]';
    const rows = JSON.parse(rowsRaw || '[]');

    for (const t of validTargets) {
      // evitar duplicados por jobId+to+cotizacionId
      const exists = rows.find((r: any) => r.jobId === jobId && r.to === (t.email ?? null) && (r.cotizacionId ?? null) === (cotizacionId ?? null));
      if (exists) continue;

      // intentar extraer cotizacionId de attachments
      let cotizacionId: number | null = null;
      const combined = [...globalAttachments, ...(Array.isArray(t.attachments) ? t.attachments : [])];
      for (const a of combined) {
        if (!a?.name) continue;
        const m = String(a.name).match(/Cotizacion_(\d+)\.pdf/i);
        if (m && m[1]) { cotizacionId = Number(m[1]); break; }
      }

      // intentar enriquecer con prisma si hay cotizacionId
      let clienteNombre: string | null = null;
      let creadoPor: string | null = null;
      let fechaCreacion: string | null = null;
      if (cotizacionId) {
        try {
          const { prisma } = await import("../lib/prisma.js");
          const cot = await prisma.cotizacionGestioo.findUnique({ where: { id: Number(cotizacionId) }, include: { entidad: true, tecnico: true } });
          if (cot) {
            clienteNombre = cot.entidad?.nombre ?? null;
            creadoPor = cot.tecnico?.nombre ?? null;
            fechaCreacion = (cot as any).fecha ?? (cot as any).createdAt ?? null;
          }
        } catch (err) {
          console.warn('Pre-registro: no se pudo enriquecer cotizacion', cotizacionId, err);
        }
      }

      // resolver nombre del remitente preferentemente
      let sentBy: string | null = null;
      try {
        const user = (req as any).user;
        if (user?.id) {
          const { prisma } = await import('../lib/prisma.js');
          const u = await prisma.usuario.findUnique({ where: { id: Number(user.id) } });
          sentBy = (u as any)?.nombre ?? (u as any)?.email ?? null;
        } else {
          sentBy = (req as any)?.user?.email ?? null;
        }
      } catch (err) {
        sentBy = (req as any)?.user?.email ?? null;
      }

      const entry = {
        id: (rows.length ? Math.max(...rows.map((r: any) => Number(r.id) || 0)) + 1 : 1),
        cotizacionId: cotizacionId ?? null,
        to: t.email ?? null,
        subject: subject ?? null,
        sentBy: sentBy ?? null,
        jobId: jobId ?? null,
        meta: { attachments: combined.length },
        clienteNombre,
        creadoPor,
        fechaCreacion,
        sentAt: new Date().toISOString(),
      };
      rows.unshift(entry);
    }

    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(rows, null, 2), 'utf8');
  } catch (err) {
    console.error('Error creando registros iniciales de envíos:', err);
  }

  const jobRef = mailerJobs[jobId];
  jobRef.status = 'processing';

  // Envío paralelo inmediato — sin throttling artificial.
  // Microsoft Graph maneja su propio rate limiting (429) si se supera la cuota.
  Promise.allSettled(
    validTargets.map(async (t) => {
      const perTargetAttachments = Array.isArray(t.attachments) ? t.attachments : [];
      const attachments = [...globalAttachments, ...perTargetAttachments].map((a: any) => ({
        name: a.name,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      }));

      await graphReaderService.sendReplyEmail({ to: t.email, subject, bodyHtml, attachments });
      jobRef.successes.push(t.email);
    })
  ).then((results) => {
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const err = result.reason;
        jobRef.failures.push({ to: validTargets[idx]?.email, error: err?.message ?? String(err) });
      }
    });
    jobRef.completed = validTargets.length;
    jobRef.status = 'done';
    console.log(`[Mailer] Job ${jobId} completado: ${jobRef.successes.length} ok, ${jobRef.failures.length} errores`);
  });

  return res.json({ ok: true, queued: true, jobId, requested: targets.length, queuedCount: validTargets.length, ratePerMin: 0, estimatedCompletionMs: 0 });
});

// Obtener estado de job de envío masivo
correoRouter.get("/enviar-masivo/status/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ ok: false, message: "Se requiere job id" });

  const job = mailerJobs[id];
  if (!job) return res.status(404).json({ ok: false, message: "Job no encontrado" });

  return res.json({ ok: true, job: {
    id: job.id,
    createdAt: job.createdAt,
    ratePerMin: job.ratePerMin,
    total: job.total,
    successes: job.successes,
    failures: job.failures,
    completed: job.completed,
    status: job.status,
  }});
});
