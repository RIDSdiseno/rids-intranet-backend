-- Simplifica el enum EtapaOportunidadVenta: elimina CONTACTADO y LEVANTAMIENTO
-- (no aportaban campos ni validaciones propias, y no tienen equivalente ni en
-- Beck ni en Firemat), y separa COTIZACION_PREPARACION_ENVIO en dos etapas
-- reales: COTIZACION_PREPARACION y COTIZACION_ENVIADA.
--
-- Postgres no permite eliminar valores de un enum con ALTER TYPE ... DROP VALUE,
-- por lo que se recrea el tipo y se remapean los datos existentes (no se pierde
-- ningún registro, solo se reclasifica su etapa):
--   CONTACTADO, LEVANTAMIENTO           -> NUEVA
--   COTIZACION_PREPARACION_ENVIO        -> COTIZACION_PREPARACION

-- 1) Nuevo tipo enum con los valores finales
CREATE TYPE "EtapaOportunidadVenta_new" AS ENUM ('NUEVA', 'COTIZACION_PREPARACION', 'COTIZACION_ENVIADA', 'NEGOCIACION', 'GANADA', 'PERDIDA');

-- 2) OportunidadVenta.etapa: pasar a TEXT, remapear valores, quitar default temporalmente
ALTER TABLE "OportunidadVenta" ALTER COLUMN "etapa" DROP DEFAULT;
ALTER TABLE "OportunidadVenta" ALTER COLUMN "etapa" TYPE TEXT USING "etapa"::TEXT;

UPDATE "OportunidadVenta" SET "etapa" = 'NUEVA' WHERE "etapa" IN ('CONTACTADO', 'LEVANTAMIENTO');
UPDATE "OportunidadVenta" SET "etapa" = 'COTIZACION_PREPARACION' WHERE "etapa" = 'COTIZACION_PREPARACION_ENVIO';

ALTER TABLE "OportunidadVenta" ALTER COLUMN "etapa" TYPE "EtapaOportunidadVenta_new" USING "etapa"::"EtapaOportunidadVenta_new";
ALTER TABLE "OportunidadVenta" ALTER COLUMN "etapa" SET DEFAULT 'NUEVA';

-- 3) HistorialEtapaOportunidadVenta.etapaAnterior (nullable) y etapaNueva: mismo remapeo
ALTER TABLE "HistorialEtapaOportunidadVenta" ALTER COLUMN "etapaAnterior" TYPE TEXT USING "etapaAnterior"::TEXT;
ALTER TABLE "HistorialEtapaOportunidadVenta" ALTER COLUMN "etapaNueva" TYPE TEXT USING "etapaNueva"::TEXT;

UPDATE "HistorialEtapaOportunidadVenta" SET "etapaAnterior" = 'NUEVA' WHERE "etapaAnterior" IN ('CONTACTADO', 'LEVANTAMIENTO');
UPDATE "HistorialEtapaOportunidadVenta" SET "etapaAnterior" = 'COTIZACION_PREPARACION' WHERE "etapaAnterior" = 'COTIZACION_PREPARACION_ENVIO';
UPDATE "HistorialEtapaOportunidadVenta" SET "etapaNueva" = 'NUEVA' WHERE "etapaNueva" IN ('CONTACTADO', 'LEVANTAMIENTO');
UPDATE "HistorialEtapaOportunidadVenta" SET "etapaNueva" = 'COTIZACION_PREPARACION' WHERE "etapaNueva" = 'COTIZACION_PREPARACION_ENVIO';

ALTER TABLE "HistorialEtapaOportunidadVenta" ALTER COLUMN "etapaAnterior" TYPE "EtapaOportunidadVenta_new" USING "etapaAnterior"::"EtapaOportunidadVenta_new";
ALTER TABLE "HistorialEtapaOportunidadVenta" ALTER COLUMN "etapaNueva" TYPE "EtapaOportunidadVenta_new" USING "etapaNueva"::"EtapaOportunidadVenta_new";

-- 4) Reemplazar el tipo antiguo por el nuevo
DROP TYPE "EtapaOportunidadVenta";
ALTER TYPE "EtapaOportunidadVenta_new" RENAME TO "EtapaOportunidadVenta";
