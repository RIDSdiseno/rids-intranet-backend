-- Agrega la fecha estimada en que se espera cerrar la oportunidad (distinta de
-- fechaCierre, que es la fecha real de cierre GANADA/PERDIDA). Aditivo: columna
-- nullable.

-- AlterTable
ALTER TABLE "OportunidadVenta" ADD COLUMN "fechaProbableCierre" DATE;
