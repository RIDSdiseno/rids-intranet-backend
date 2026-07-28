-- Agrega el valor 'OTRO' al enum TipoServicioOportunidad y un campo de texto
-- libre (tipoServicioOtro) para describirlo cuando se elige esa opción.
-- Postgres SÍ permite agregar valores a un enum existente sin recrearlo
-- (a diferencia de eliminarlos), por lo que este cambio es puramente aditivo.

-- AlterEnum
ALTER TYPE "TipoServicioOportunidad" ADD VALUE 'OTRO';

-- AlterTable
ALTER TABLE "OportunidadVenta" ADD COLUMN "tipoServicioOtro" TEXT;
