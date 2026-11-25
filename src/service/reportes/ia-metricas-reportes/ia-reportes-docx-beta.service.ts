// src/service/ia-metricas-reportes/ia-reportes-docx-beta.service.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("IA no devolvió JSON válido para Word beta");
  }
}

function sanitizeForJSON(value: any): any {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForJSON);
  }

  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = sanitizeForJSON(val);
    }
    return out;
  }

  return value;
}

function formatMinutosAHoras(minutos: number): string {
  const total = Math.max(0, Math.round(Number(minutos) || 0));

  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;

  return `${h} h ${m} min`;
}

function normalizarDuracionVisita(v: any): string {
  if (v?.duracionTexto) return v.duracionTexto;

  if (typeof v?.duracionMinutos === "number") {
    return formatMinutosAHoras(v.duracionMinutos);
  }

  if (typeof v?.duracionMs === "number") {
    return formatMinutosAHoras(Math.round(v.duracionMs / 1000 / 60));
  }

  if (v?.inicio && v?.fin) {
    const inicio = new Date(v.inicio).getTime();
    const fin = new Date(v.fin).getTime();

    if (Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio) {
      return formatMinutosAHoras(Math.round((fin - inicio) / 1000 / 60));
    }
  }

  return "0 min";
}

function getDuracionVisitaMinutos(v: any): number {
  /*
    Devuelve duración exacta en minutos.
    No redondeamos cada visita antes de sumar, para que coincida con:
    ROUND(SUM(EXTRACT(EPOCH FROM ("fin" - "inicio")) / 60))
  */
  if (typeof v?.duracionMinutos === "number") {
    return Math.max(0, Number(v.duracionMinutos) || 0);
  }

  if (typeof v?.duracionMs === "number") {
    return Math.max(0, (Number(v.duracionMs) || 0) / 1000 / 60);
  }

  if (v?.inicio && v?.fin) {
    const inicio = new Date(v.inicio).getTime();
    const fin = new Date(v.fin).getTime();

    if (Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio) {
      return Math.max(0, (fin - inicio) / 1000 / 60);
    }
  }

  return 0;
}

function getSolicitanteKeyVisita(v: any): string | null {
  /*
    Identifica al solicitante real de la visita.
    Si viene S/A, vacío o sin solicitante, no se cuenta.
  */
  const nombreSolicitante = String(
    v?.solicitante?.nombre ??
    v?.solicitanteRef?.nombre ??
    v?.solicitante ??
    ""
  )
    .trim()
    .toLowerCase();

  if (
    !nombreSolicitante ||
    nombreSolicitante === "s/a" ||
    nombreSolicitante === "sin solicitante" ||
    nombreSolicitante === "null" ||
    nombreSolicitante === "undefined"
  ) {
    return null;
  }

  const rawValue =
    v?.idSolicitante ??
    v?.solicitanteId ??
    v?.solicitanteRef?.id ??
    v?.solicitanteRef?.id_solicitante ??
    v?.solicitanteRef?.email ??
    v?.solicitanteRef?.correo ??
    v?.solicitante?.id ??
    v?.solicitante?.id_solicitante ??
    v?.solicitante?.email ??
    v?.solicitante?.correo ??
    v?.solicitante?.nombre ??
    v?.solicitante ??
    null;

  if (!rawValue) return null;

  const key = String(rawValue).trim().toLowerCase();

  if (!key || key === "null" || key === "undefined") {
    return null;
  }

  return key;
}

function calcularTiempoPromedioAtencionSolicitantes(visitas: any[]) {
  /*
    KPI general:
    Total minutos exactos de atenciones con solicitante real / solicitantes únicos atendidos.

    Coincide con psql:
    ROUND(SUM(minutos)) / COUNT(DISTINCT solicitante)
  */
  const solicitantesUnicos = new Set<string>();

  let totalMinutosExactos = 0;
  let atencionesConSolicitante = 0;
  let atencionesSinSolicitante = 0;

  for (const visita of visitas ?? []) {
    const solicitanteKey = getSolicitanteKeyVisita(visita);

    if (!solicitanteKey) {
      atencionesSinSolicitante += 1;
      continue;
    }

    const minutos = getDuracionVisitaMinutos(visita);

    if (minutos <= 0) {
      continue;
    }

    atencionesConSolicitante += 1;
    totalMinutosExactos += minutos;
    solicitantesUnicos.add(solicitanteKey);
  }

  const totalMinutos = Math.round(totalMinutosExactos);
  const totalSolicitantesAtendidos = solicitantesUnicos.size;

  const promedioMinutos =
    totalSolicitantesAtendidos > 0
      ? Math.round(totalMinutos / totalSolicitantesAtendidos)
      : 0;

  return {
    atencionesConSolicitante,
    atencionesSinSolicitante,
    totalMinutos,
    totalTiempoTexto: formatMinutosAHoras(totalMinutos),
    totalSolicitantesAtendidos,
    promedioMinutos,
    promedioTexto: formatMinutosAHoras(promedioMinutos),
  };
}

function prepararContextoWordBeta(data: any) {
  const safe = sanitizeForJSON(data);

  const inventarioFuente =
    safe.inventario?.detalle ??
    safe.inventario?.equipos ??
    [];

  // Usamos el detalle real de visitas para recalcular los KPIs de terreno.
  // Esto evita tomar valores precalculados antiguos o de otra fuente.
  const visitasDetalle = safe.visitas?.detalle ?? [];

  const kpiAtencionSolicitantes =
    calcularTiempoPromedioAtencionSolicitantes(visitasDetalle);

  /*
   * Perfil del cliente en el período (Word IA adaptativo):
   *  - REMOTO: sin visitas presenciales → el informe se enfoca en soporte
   *    remoto, mesa de ayuda e inventario.
   *  - CON_TERRENO: incluye además la atención en terreno.
   */
  const perfil: "REMOTO" | "CON_TERRENO" =
    visitasDetalle.length > 0 ? "CON_TERRENO" : "REMOTO";

  const equiposActivos = inventarioFuente.filter(
    (e: any) => !/baja/i.test(String(e?.estadoEquipo ?? e?.estado ?? ""))
  ).length;
  const equiposTotal = inventarioFuente.length;
  const equiposInactivos = equiposTotal - equiposActivos;

  const minutosRemotas = Math.round(
    (safe.mantenciones?.detalle ?? []).reduce(
      (acc: number, m: any) => acc + getDuracionVisitaMinutos(m),
      0
    )
  );

  return {
    perfil,
    equiposActivos,
    equiposTotal,
    equiposInactivos,
    minutosRemotasTexto: formatMinutosAHoras(minutosRemotas),
    empresa: safe.empresa?.nombre ?? "Empresa no identificada",
    periodo: safe.month ?? safe.periodo ?? "Periodo no identificado",
    kpis: {
      visitas: {
        count: kpiAtencionSolicitantes.atencionesConSolicitante,

        // Total recalculado desde el detalle real de visitas.
        totalTiempoTexto: kpiAtencionSolicitantes.totalTiempoTexto,

        // Nuevo KPI solicitado.
        promedioAtencionSolicitantesTexto:
          kpiAtencionSolicitantes.promedioTexto,

        totalSolicitantesAtendidos:
          kpiAtencionSolicitantes.totalSolicitantesAtendidos,
      },
      equipos: { count: safe.kpis?.equipos?.count ?? 0 },
      tickets: { total: safe.kpis?.tickets?.total ?? 0 },
      mantenciones: { total: safe.kpis?.mantenciones?.total ?? 0 },
      licencias: {
        total: safe.licencias?.total ?? 0,
        totalUsuariosConLicencia: safe.licencias?.totalUsuariosConLicencia ?? 0,
        porTipo: safe.licencias?.porTipo ?? [],
      }
    },
    visitas: {
      // Total de atenciones válidas con solicitante real y duración válida.
      total: kpiAtencionSolicitantes.atencionesConSolicitante,

      // Total recalculado desde el detalle real de visitas.
      totalTiempoTexto: kpiAtencionSolicitantes.totalTiempoTexto,

      // Nuevo KPI general.
      promedioAtencionSolicitantesTexto:
        kpiAtencionSolicitantes.promedioTexto,

      totalSolicitantesAtendidos:
        kpiAtencionSolicitantes.totalSolicitantesAtendidos,

      porTipo: safe.visitas?.porTipo ?? [],
      porTecnico: safe.visitas?.porTecnico ?? [],

      // Detalle: se mantiene solo información legible para la IA.
      detalle: visitasDetalle.slice(0, 12).map((v: any) => ({
        tecnico: v.tecnico,
        solicitante: v.solicitante,
        inicio: v.inicio,
        fin: v.fin,
        duracionTexto: normalizarDuracionVisita(v),
      })),
    },
    licencias: {
      total: safe.licencias?.total ?? 0,
      totalUsuariosConLicencia: safe.licencias?.totalUsuariosConLicencia ?? 0,
      porTipo: safe.licencias?.porTipo ?? [],
      usuarios: (safe.licencias?.usuarios ?? []).slice(0, 30),
    },
    tickets: {
      total: safe.tickets?.total ?? 0,
      porCategoria: safe.tickets?.porCategoria ?? [],
      topUsuarios: safe.tickets?.topUsuarios ?? [],
      detalle: (safe.tickets?.detalle ?? []).slice(0, 12),
    },
    mantenciones: {
      total: safe.mantenciones?.total ?? 0,
      porStatus: safe.mantenciones?.porStatus ?? [],
      porTecnico: safe.mantenciones?.porTecnico ?? [],
      detalle: (safe.mantenciones?.detalle ?? []).slice(0, 12),
    },
    inventario: {
      totalEquipos:
        safe.inventario?.total ??
        inventarioFuente.length ??
        0,
      porMarca: safe.inventario?.porMarca ?? [],
      columnas: [
        "codigo",
        "usuario",
        "correo",
        "estadoEquipo",
        "serial",
        "marca",
        "modelo",
        "cpu",
        "ram",
        "disco",
        "sistemaOperativo",
      ],
      detalle: inventarioFuente.map((equipo: any, index: number) => ({
        codigo: equipo.codigo ?? index + 1,
        usuario: equipo.usuario ?? equipo.solicitante?.nombre ?? "",
        correo: equipo.correo ?? equipo.solicitante?.email ?? "",
        estadoEquipo: equipo.estadoEquipo ?? equipo.estado ?? "",
        serial: equipo.serial ?? "",
        marca: equipo.marca ?? "",
        modelo: equipo.modelo ?? "",
        cpu: equipo.cpu ?? equipo.procesador ?? "",
        ram: equipo.ram ?? "",
        disco: equipo.disco ?? "",
        sistemaOperativo: equipo.sistemaOperativo ?? equipo.detalle?.so ?? equipo.so ?? "",
      })),
      muestra: inventarioFuente.slice(0, 15).map((equipo: any, index: number) => ({
        codigo: equipo.codigo ?? index + 1,
        usuario: equipo.usuario ?? equipo.solicitante?.nombre ?? "",
        correo: equipo.correo ?? equipo.solicitante?.email ?? "",
        estadoEquipo: equipo.estadoEquipo ?? equipo.estado ?? "",
        serial: equipo.serial ?? "",
        marca: equipo.marca ?? "",
        modelo: equipo.modelo ?? "",
        cpu: equipo.cpu ?? equipo.procesador ?? "",
        ram: equipo.ram ?? "",
        disco: equipo.disco ?? "",
        sistemaOperativo: equipo.sistemaOperativo ?? equipo.detalle?.so ?? equipo.so ?? "",
      })),
    },
    extras: safe.extras?.totales ?? [],
    observaciones: {
      topUsuariosGeneral: safe.tickets?.topUsuarios ?? [],

      // Valor validado contra tabla "Visita".
      duracionTotalVisitas: kpiAtencionSolicitantes.totalTiempoTexto,

      // Nuevo KPI general solicitado.
      tiempoPromedioAtencionSolicitantes:
        kpiAtencionSolicitantes.promedioTexto,

      totalSolicitantesAtendidos:
        kpiAtencionSolicitantes.totalSolicitantesAtendidos,

      totalAtencionesRealizadas:
        kpiAtencionSolicitantes.atencionesConSolicitante,
    },
  };
}

function normalizarTextoInformeIA(texto: string) {
  /*
    Normaliza frases que la IA puede seguir generando aunque el prompt
    indique otra redacción.
  */
  return String(texto ?? "")
    .replace(/visitas técnicas/gi, "atenciones a solicitantes")
    .replace(/visita técnica/gi, "atención a solicitante");
}

export async function generarEstructuraWordIABeta(reporteEmpresa: any) {
  const contextoIA = prepararContextoWordBeta(reporteEmpresa);

  const prompt = `
Eres un consultor senior de operaciones TI, continuidad operacional, soporte corporativo y redacción ejecutiva orientada a clientes.

Tu tarea es construir la estructura editorial de un informe Word premium dirigido al cliente final, a partir de datos reales del sistema.

CONTEXTO DEL INFORME:
Este documento representa el servicio prestado por nuestra empresa al cliente durante el periodo evaluado.
El objetivo del informe no es auditar ni criticar a nuestra empresa, sino presentar de forma ejecutiva, profesional y ordenada:
- la gestión realizada
- el acompañamiento entregado
- la continuidad operacional sostenida
- los principales resultados del periodo
- las oportunidades de fortalecimiento y mejora futura

OBJETIVO DEL TEXTO:
- transmitir profesionalismo, orden y valor del servicio entregado
- reflejar el acompañamiento y soporte prestado por nuestra empresa
- mantener un tono ejecutivo, corporativo, sobrio y comercialmente adecuado
- mostrar oportunidades de mejora desde una perspectiva proactiva, nunca castigadora
- resaltar la gestión realizada y los resultados obtenidos durante el periodo

REGLAS ESTRICTAS DE TONO:
- Usa SOLO los datos entregados
- NO inventes métricas ni tendencias que no estén soportadas
- Si un dato no existe o no es concluyente, dilo de forma sobria y neutral
- Evita exageraciones
- Para licencias Microsoft, interpreta "total" como cantidad de usuarios únicos con licencia asignada.
- No sumes múltiples licencias del mismo usuario como usuarios adicionales.
- En licencias.porTipo, "cantidad" representa usuarios únicos asociados a ese tipo de licencia.
- Cuando menciones tiempos de atención, usa siempre totalTiempoTexto, duracionTexto o tiempoPromedioAtencionSolicitantes.
- No uses ni menciones "Duración promedio por visita"; reemplázalo siempre por "Tiempo promedio de atención de solicitantes".
- No uses la expresión "visitas técnicas"; usa "atenciones a solicitantes".
- No muestres milisegundos ni valores crudos como 5400000, 7200000 o similares.
- No inventes licencias ni nombres de productos. Usa solo los datos entregados en licencias.porTipo.
- No uses markdown
- No uses HTML
- Devuelve SOLO JSON válido
- No agregues campos fuera del esquema
- Los textos deben sonar a informe ejecutivo real, no a chatbot
- El informe debe hablar bien del servicio prestado por nuestra empresa
- No redactes el informe como una auditoría crítica hacia nuestra empresa
- No uses lenguaje que desacredite, cuestione o debilite la percepción del servicio entregado
- No utilices expresiones como:
  "falencias graves",
  "deficiencias severas",
  "mal desempeño",
  "servicio insuficiente",
  "debilidades críticas",
  "vulnerabilidades por mala gestión"
- Cuando existan incidencias o situaciones a mejorar, preséntalas como:
  "oportunidades de mejora",
  "focos de optimización",
  "áreas de fortalecimiento",
  "aspectos a monitorear",
  "líneas de mejora continua"
- Destaca siempre la gestión realizada, el acompañamiento técnico entregado, la capacidad de respuesta y la contribución a la continuidad operacional
- El texto debe dejar una percepción positiva, profesional y confiable del servicio prestado

INVENTARIO DE EQUIPOS:
- El contexto inventario.detalle contiene el inventario operativo de la empresa.
- Las columnas disponibles son: código, usuario, correo, estado del equipo, serial, marca, modelo, CPU, RAM, disco y sistema operativo.
- No inventes equipos, usuarios, correos, seriales ni especificaciones.
- Si mencionas el inventario, usa únicamente los datos disponibles.
- El detalle completo del inventario debe conservarse como datos estructurados, no como texto inventado.

PERFIL DEL CLIENTE EN ESTE PERÍODO: ${contextoIA.perfil}
${contextoIA.perfil === "REMOTO"
      ? `- Este cliente NO tuvo atenciones presenciales en el período: su servicio fue remoto y de mesa de ayuda.
- NO menciones visitas, terreno, atenciones presenciales ni su ausencia. No digas "no se registraron atenciones".
- Enfoca el texto en: mantenciones remotas, tickets atendidos, horas de soporte e inventario.
- Si no hubo licencias Microsoft asignadas, no lo menciones.`
      : `- Este cliente tuvo atención en terreno: destaca las atenciones a solicitantes, el tiempo en terreno y la cobertura técnica, además del soporte remoto y la mesa de ayuda.`}

VALORES FIJOS OBLIGATORIOS — NO MODIFICAR:
${contextoIA.perfil === "CON_TERRENO"
      ? `- "Tiempo total en terreno" = "${contextoIA.observaciones.duracionTotalVisitas}"
- "Tiempo promedio de atención de solicitantes" = "${contextoIA.observaciones.tiempoPromedioAtencionSolicitantes}"
- "Solicitantes únicos atendidos" = ${contextoIA.observaciones.totalSolicitantesAtendidos}
- "Atenciones a solicitantes" = ${contextoIA.observaciones.totalAtencionesRealizadas}`
      : `- "Tiempo en mantenciones remotas" = "${contextoIA.minutosRemotasTexto}"`}
- "Total de tickets" = ${contextoIA.tickets.total}
- "Total de mantenciones remotas" = ${contextoIA.mantenciones.total}
- "Equipos registrados" = ${contextoIA.equiposTotal} (${contextoIA.equiposActivos} activos y ${contextoIA.equiposInactivos} inactivos, dados de baja)
- "Licencias Microsoft utilizadas" = ${contextoIA.licencias.total}
- "Usuarios con licencia Microsoft" = ${contextoIA.licencias.totalUsuariosConLicencia}

Estos valores son de referencia obligatoria para la redacción.
No los recalcules. No los modifiques. Cópialos literalmente cuando los menciones.

El backend insertará automáticamente las métricas operativas principales en metricas_destacadas y kpis_interpretados.
La IA no debe duplicarlas si ya aparecen en el contexto.

INSTRUCCIONES DE ENFOQUE:
- En el resumen ejecutivo, prioriza el valor del servicio prestado y la gestión del periodo
- En el resumen ejecutivo, no uses la expresión "visitas técnicas".
- Cuando hables del total de visitas del período, usa la expresión "atenciones a solicitantes".
- Ejemplo correcto: "se realizaron 39 atenciones a solicitantes".
- En los KPIs interpretados, da una lectura favorable y profesional de los indicadores
- En hallazgos, describe aspectos relevantes del periodo sin sonar crítico
- En riesgos, usa un enfoque suave y corporativo, más cercano a "aspectos a monitorear" que a advertencias duras
- En recomendaciones, plantea acciones proactivas para fortalecer el servicio y seguir mejorando
- En la conclusión, refuerza el profesionalismo, la continuidad operacional y la proyección de mejora
- Además del texto, debes proponer métricas y gráficos que ayuden visualmente al cliente a comprender el servicio prestado

REGLAS PARA MÉTRICAS Y GRÁFICOS:
- Solo usa datos presentes en el contexto
- Puedes destacar métricas existentes o derivables directamente del contexto
- No inventes porcentajes si no se pueden calcular claramente
- Los gráficos los decide el sistema según el perfil. Tú solo escribes su lectura en "lecturas_graficos":
  una frase breve (máximo 25 palabras), positiva y basada en los datos, para cada una de estas claves:
  ${contextoIA.perfil === "CON_TERRENO"
      ? `"mantenciones_por_fecha", "visitas_por_tecnico", "actividades_mantenimiento", "solicitudes_programadas_vs_adicionales", "distribucion_servicios", `
      : ""}"mantenciones_por_tecnico", "mantenciones_por_status", "tickets_top_solicitantes", "tickets_por_categoria", "inventario_por_marca"
- Si una clave no tiene datos suficientes, déjala como cadena vacía.
- Propón entre 3 y 5 métricas destacadas
- Propón entre 2 y 4 gráficos sugeridos
- Cada gráfico debe incluir una lectura ejecutiva breve y positiva
- Los gráficos deben ayudar a entender el servicio, no a criticarlo
- La métrica "Tiempo total en terreno" DEBE tener valor exacto: "${contextoIA.observaciones.duracionTotalVisitas}". No uses otro valor.
- La métrica "Tiempo promedio de atención de solicitantes" DEBE tener valor exacto: "${contextoIA.observaciones.tiempoPromedioAtencionSolicitantes}". No uses otro valor.
- La métrica "Solicitantes únicos atendidos" DEBE tener valor exacto: "${contextoIA.observaciones.totalSolicitantesAtendidos}". No uses otro valor.
- La métrica "Atenciones a solicitantes" DEBE tener valor exacto: "${contextoIA.observaciones.totalAtencionesRealizadas}". No uses otro valor.
- Cuando menciones duración de visitas, usa siempre totalTiempoTexto, duracionTexto o tiempoPromedioAtencionSolicitantes.
- No uses ni menciones "Duración promedio por visita"; reemplázalo siempre por "Tiempo promedio de atención de solicitantes".

ESQUEMA JSON OBLIGATORIO:
{
  "layout": {
    "tipo_portada": "ejecutiva_corporativa",
    "orden_secciones": [
      "resumen_ejecutivo",
      "metricas_destacadas",
      "graficos_sugeridos",
      "kpis_interpretados",
      "hallazgos",
      "riesgos",
      "recomendaciones",
      "plan_30_60_90",
      "conclusion"
    ],
    "estilo_general": "corporativo_consultivo"
  },
  "titulo": "",
  "subtitulo": "",
  "resumen_ejecutivo": "",
  "metricas_destacadas": [
    {
      "nombre": "",
      "valor": "",
      "lectura": ""
       }
  ],
  "graficos_sugeridos": [],
  "lecturas_graficos": {
    "clave": "lectura breve"
  },
  "kpis_interpretados": [
    { "nombre": "", "valor": "", "lectura": "" }
  ],
  "hallazgos": [
    { "titulo": "", "detalle": "", "impacto": "Alto|Medio|Bajo" }
  ],
  "riesgos": [
    { "titulo": "", "detalle": "", "nivel": "Alto|Medio|Bajo" }
  ],
  "recomendaciones": [
    { "prioridad": "Alta|Media|Baja", "titulo": "", "detalle": "", "beneficio": "" }
  ],
  "plan_30_60_90": {
    "d30": [""],
    "d60": [""],
    "d90": [""]
  },
  "conclusion": ""
}

LÍMITES DE REDACCIÓN:
- resumen_ejecutivo: 90 a 130 palabras (es una versión ejecutiva y resumida)
- metricas_destacadas: devuelve un arreglo vacío (las calcula el sistema)
- graficos_sugeridos: devuelve un arreglo vacío
- kpis_interpretados: 4 a 6 elementos
- hallazgos: 3 a 5 elementos
- riesgos: 3 a 4 elementos
- recomendaciones: 3 a 4 elementos, cada "detalle" de máximo 30 palabras
- plan_30_60_90: 3 acciones por tramo
- conclusion: 60 a 100 palabras

GUÍA ADICIONAL DE ESTILO:
- Usa un lenguaje ejecutivo y positivo
- Habla del periodo como una gestión acompañada y atendida por nuestra empresa
- Refuerza que las acciones realizadas aportan orden, soporte, continuidad y visibilidad
- Si mencionas concentración de tickets, técnicos o usuarios, exprésalo como una oportunidad de optimización o focalización de esfuerzos, no como una debilidad
- Si faltan métricas, indícalo como una oportunidad para fortalecer trazabilidad y mejora continua
- No uses frases alarmistas

DATOS DEL SISTEMA:
${JSON.stringify(contextoIA, null, 2)}
`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Eres un consultor experto en operaciones TI, continuidad operacional, soporte corporativo y redacción ejecutiva para informes gerenciales orientados a clientes. Tu estilo debe reforzar el valor del servicio prestado, mantener un tono profesional y presentar las mejoras desde una lógica proactiva y positiva. Debes proponer métricas y gráficos útiles solo cuando puedan sustentarse en datos reales.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseJsonSafe(raw);

  // Normalizamos textos generados por IA para mantener el lenguaje solicitado.
  if (typeof parsed.resumen_ejecutivo === "string") {
    parsed.resumen_ejecutivo = normalizarTextoInformeIA(parsed.resumen_ejecutivo);
  }

  if (typeof parsed.conclusion === "string") {
    parsed.conclusion = normalizarTextoInformeIA(parsed.conclusion);
  }

  if (Array.isArray(parsed.hallazgos)) {
    parsed.hallazgos = parsed.hallazgos.map((item: any) => ({
      ...item,
      titulo: normalizarTextoInformeIA(item?.titulo ?? ""),
      detalle: normalizarTextoInformeIA(item?.detalle ?? ""),
    }));
  }

  if (Array.isArray(parsed.riesgos)) {
    parsed.riesgos = parsed.riesgos.map((item: any) => ({
      ...item,
      titulo: normalizarTextoInformeIA(item?.titulo ?? ""),
      detalle: normalizarTextoInformeIA(item?.detalle ?? ""),
    }));
  }

  if (Array.isArray(parsed.recomendaciones)) {
    parsed.recomendaciones = parsed.recomendaciones.map((item: any) => ({
      ...item,
      titulo: normalizarTextoInformeIA(item?.titulo ?? ""),
      detalle: normalizarTextoInformeIA(item?.detalle ?? ""),
      beneficio: normalizarTextoInformeIA(item?.beneficio ?? ""),
    }));
  }

  // Métricas calculadas por backend.
  // Estas NO dependen de la IA, por lo tanto no pueden quedar alteradas.
  const solicitantesUnicos = Number(contextoIA.observaciones.totalSolicitantesAtendidos) || 0;
  const atencionesTerreno = Number(contextoIA.observaciones.totalAtencionesRealizadas) || 0;
  const atencionesRepetidas = Math.max(0, atencionesTerreno - solicitantesUnicos);

  // Explica en lenguaje simple qué significa el número de atenciones.
  const textoAtenciones =
    `Cantidad de veces que un técnico atendió presencialmente a una persona. ` +
    (atencionesRepetidas > 0
      ? `Las ${atencionesTerreno} atenciones corresponden a ${solicitantesUnicos} personas: algunas fueron atendidas más de una vez, lo que suma ${atencionesRepetidas} ${atencionesRepetidas === 1 ? "atención adicional" : "atenciones adicionales"}.`
      : `Cada una de las ${solicitantesUnicos} personas fue atendida una sola vez.`);

  const metricasTerreno = [
    {
      nombre: "Tiempo total en terreno",
      valor: contextoIA.observaciones.duracionTotalVisitas,
      lectura:
        "Refleja el tiempo total dedicado a atenciones presenciales durante el período evaluado.",
    },
    {
      nombre: "Tiempo promedio de atención de solicitantes",
      valor: contextoIA.observaciones.tiempoPromedioAtencionSolicitantes,
      lectura: `Tiempo que, en promedio, dedicó el equipo técnico a cada persona atendida: el tiempo total en terreno (${contextoIA.observaciones.duracionTotalVisitas}) dividido entre las ${solicitantesUnicos} personas atendidas.`,
    },
    {
      nombre: "Solicitantes únicos atendidos",
      valor: String(solicitantesUnicos),
      lectura: `Número de personas distintas que recibieron atención en terreno. Cada persona se cuenta una sola vez, aunque haya sido atendida en varias ocasiones.`,
    },
    {
      nombre: "Atenciones a solicitantes",
      valor: String(atencionesTerreno),
      lectura: textoAtenciones,
    },
  ];

  /*
   * Word IA adaptativo: las métricas destacadas las define el sistema según
   * el perfil. A un cliente remoto no se le muestran métricas de terreno en 0.
   */
  const metricasComunes = [
    {
      nombre: "Mantenciones remotas",
      valor: String(contextoIA.mantenciones.total),
      lectura: `Sesiones de soporte remoto realizadas, con un tiempo total de ${contextoIA.minutosRemotasTexto}.`,
    },
    {
      nombre: "Tickets gestionados",
      valor: String(contextoIA.tickets.total),
      lectura: "Requerimientos atendidos por la mesa de ayuda durante el período.",
    },
    {
      nombre: "Equipos registrados",
      valor: String(contextoIA.equiposTotal),
      lectura: `${contextoIA.equiposActivos} ${contextoIA.equiposActivos === 1 ? "equipo activo" : "equipos activos"} y ${contextoIA.equiposInactivos} ${contextoIA.equiposInactivos === 1 ? "inactivo" : "inactivos"} (dados de baja) en el inventario del cliente.`,
    },
    ...(Number(contextoIA.licencias.totalUsuariosConLicencia) > 0
      ? [{
        nombre: "Usuarios con licencia Microsoft",
        valor: String(contextoIA.licencias.totalUsuariosConLicencia),
        lectura: "Usuarios con licencias Microsoft 365 asignadas y gestionadas.",
      }]
      : []),
  ].filter((m) => m.valor !== "0" || m.nombre === "Tickets gestionados");

  const metricasForzadas =
    contextoIA.perfil === "CON_TERRENO"
      ? [...metricasTerreno, ...metricasComunes]
      : metricasComunes;

  const limpiarMetricasRepetidas = (items: any[]) =>
    items.filter((m: any) => {
      const nombre = String(m?.nombre ?? "").toLowerCase();

      return (
        !nombre.includes("tiempo total en terreno") &&
        !nombre.includes("duración promedio por visita") &&
        !nombre.includes("tiempo promedio de atención") &&
        !nombre.includes("solicitantes únicos atendidos") &&
        !nombre.includes("total de visitas") &&
        !nombre.includes("visitas técnicas") &&
        !nombre.includes("atenciones a solicitantes")
      );
    });

  // Solo las métricas calculadas por el sistema (la IA ya no agrega otras).
  parsed.metricas_destacadas = [];

  parsed.kpis_interpretados = Array.isArray(parsed.kpis_interpretados)
    ? limpiarMetricasRepetidas(parsed.kpis_interpretados)
    : [];

  // Insertamos primero los valores validados por backend.
  parsed.metricas_destacadas.unshift(...metricasForzadas);
  parsed.kpis_interpretados.unshift(...metricasForzadas);

  // Perfil y lecturas de gráficos (las reglas del frontend eligen los gráficos)
  parsed.perfil = contextoIA.perfil;
  parsed.graficos_sugeridos = [];
  parsed.lecturas_graficos =
    parsed.lecturas_graficos && typeof parsed.lecturas_graficos === "object"
      ? Object.fromEntries(
        Object.entries(parsed.lecturas_graficos)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .map(([k, v]) => [k, normalizarTextoInformeIA(String(v))])
      )
      : {};

  return parsed;
}