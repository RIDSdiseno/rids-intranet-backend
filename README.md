# RIDS-CRM — Backend

API REST del sistema de helpdesk, gestión de equipos, cotizaciones y reportes de Asesorías RIDS Ltda.

## Stack
- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL (Railway)
- Microsoft Graph API (email + calendario)
- Cloudinary (adjuntos e imágenes)
- Freshdesk API (sincronización de tickets)
- TeamViewer API (mantenciones remotas)
- Socket.IO (notificaciones en tiempo real)

## Requisitos
- Node.js >= 18
- PostgreSQL (Railway o local)

## Instalación

npm install

## Instalar las definiciones de tipos de Node.js

npm install -D @types/node

## Variables de entorno

Crea un archivo `.env` en la raíz del backend con las siguientes variables:

# Base de datos
DATABASE_URL=postgresql://user:pass@host:port/db?client_encoding=UTF8

# Microsoft Graph API (email)
EMAIL_USER=soporte@rids.cl
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Freshdesk
FRESHDESK_API_KEY=
FRESHDESK_DOMAIN=

# TeamViewer
TEAMVIEWER_API_TOKEN=

# JWT
JWT_SECRET=

# App
PORT=4000
NODE_ENV=development

## Levantar de forma local
npm run dev

## Migraciones Prisma

# Recuperar un modelo ya subido a producción
npx prisma db pull

# Subir el modelo
npx prisma db push

# Aplicar migraciones en producción
npx prisma migrate deploy

# Abrir Prisma Studio
npx prisma studio

## Estructura

src/
├── controllers/        # Lógica de negocio por módulo
│   ├── helpdesk/       # Tickets, SLA, firmas
│   ├── teamviewer/     # Mantenciones remotas
│   └── ...
├── routes/             # Definición de rutas Express
├── service/            # Servicios externos
│   └── email/          # Graph API (reader + sender)
├── lib/                # Prisma client, eventos, socket
├── middlewares/        # Auth, validación
└── routes.ts           # Montaje central de routers

## Módulos principales

| Módulo | Ruta base | Descripción |
|---|---|---|
| Helpdesk | /api/helpdesk/tickets | Tickets, mensajes, adjuntos, SLA |
| Empresas | /api/empresas | Gestión de empresas |
| Equipos | /api/equipos | Inventario de equipos |
| Cotizaciones | /api/cotizaciones | Cotizaciones Gestioo |
| Reportes | /api/reportes | Exportación DOCX/XLSX |
| TeamViewer | /api/teamviewer | Mantenciones remotas |
| IA | /api/ia-reportes | Informes operativos con IA |

## Notas importantes

### Encoding UTF-8 en Railway
Railway conecta con WIN1252 por defecto. El DATABASE_URL
debe incluir ?client_encoding=UTF8 para evitar corrupción
de caracteres especiales (tildes, ñ).

Al actualizar datos con psql directamente, usar:
SET client_encoding = 'UTF8';
UPDATE "Tecnico" SET cargo = U&'Jefe \00C1rea de Soporte' WHERE id_tecnico = 1;

### Email via Graph API
Office 365 deshabilitó Basic Auth (SMTP). Todo el envío
de email usa Microsoft Graph API con ClientSecretCredential.
No usar nodemailer para envíos salientes.

### Deduplicación de tickets
La creación de tickets desde email usa prisma.$transaction()
con constraint único en sourceMessageId para evitar duplicados
en procesamiento concurrente.