FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV LIBREOFFICE_PATH=/usr/bin/libreoffice
ENV HOME=/tmp
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# LibreOffice, fuentes y certificados.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        libreoffice-calc \
        fonts-dejavu-core \
        fonts-liberation \
        fontconfig \
        ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Node.
COPY package.json package-lock.json ./

RUN npm ci

# Instalar Chromium y dependencias para Playwright.
RUN npx playwright install --with-deps chromium

# Copiar el proyecto.
COPY . .

# Prisma generate + compilación TypeScript.
RUN npm run build

# Eliminar dependencias exclusivas de desarrollo.
RUN npm prune --omit=dev

# Verificaciones durante el build.
RUN /usr/bin/libreoffice --version
RUN npx playwright install --list

EXPOSE 4000

CMD ["npm", "start"]