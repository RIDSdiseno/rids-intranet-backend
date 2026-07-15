FROM node:20-bookworm-slim

WORKDIR /app

ENV LIBREOFFICE_PATH=/usr/bin/libreoffice
ENV HOME=/tmp
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Instala LibreOffice, fuentes y certificados.
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

# Copia archivos de dependencias.
COPY package.json package-lock.json ./

# Instala dependencies y devDependencies.
RUN npm ci --include=dev

# Instala Chromium y dependencias de Playwright.
RUN npx playwright install --with-deps chromium

# Copia el proyecto completo.
COPY . .

# Prisma generate + TypeScript.
RUN npm run build

# Elimina dependencias de desarrollo después de compilar.
RUN npm prune --omit=dev

# Desde aquí la aplicación se ejecuta en producción.
ENV NODE_ENV=production

# Verificaciones.
RUN /usr/bin/libreoffice --version
RUN npx playwright install --list

EXPOSE 4000

CMD ["npm", "start"]