# Fix `responderErrorFicha` + despliegue del worker (16-11-2026)

## 1. Bug: errores de la ficha Ley PD terminan en 500

### Causa
En `responderErrorFicha`, todo el `switch` está dentro de `if (error instanceof FichaLeypdValidacionError)`. Pero:

- El service lanza `new Error("EMPRESA_NO_ENCONTRADA")`, `TOKEN_INVALIDO`, `TOKEN_REVOCADO`, `TOKEN_EXPIRADO`, `FICHA_NO_ENCONTRADA` y `FICHA_YA_ENVIADA` como `Error` común. Nunca entran al `switch`, así que **todos** terminan en 500, no solo `EMPRESA_NO_ENCONTRADA`.
- `FichaLeypdValidacionError` sí entra, pero su `message` es `"FICHA_VALIDACION"`, que no está en el `switch`. También termina en 500 y los `errores` por campo nunca llegan al front.

Impacto real: en el enlace público, un enlace revocado o expirado, o una ficha ya enviada, muestran «No se pudo completar la operación» en vez del mensaje correcto.

### Cambio
Archivo: `src/controllers/controllers-leypd/leypd-ficha.controller.ts` (CRLF). Un solo bloque.

**Buscar** (función completa, líneas ~40–116):

```ts
function responderErrorFicha(
    error: unknown,
    res: Response
) {
    if (
        error instanceof
        FichaLeypdValidacionError
    ) {
        switch (
        error.message
        ) {
            case "EMPRESA_NO_ENCONTRADA":
                return res
                    .status(404)
                    .json({
                        message:
                            "Empresa no encontrada.",
                    });

            case "FICHA_NO_ENCONTRADA":
                return res
                    .status(404)
                    .json({
                        message:
                            "Ficha no encontrada.",
                    });

            case "TOKEN_INVALIDO":
                return res
                    .status(404)
                    .json({
                        message:
                            "Enlace inválido.",
                    });

            case "TOKEN_REVOCADO":
                return res
                    .status(410)
                    .json({
                        message:
                            "El enlace fue revocado.",
                    });

            case "TOKEN_EXPIRADO":
                return res
                    .status(410)
                    .json({
                        message:
                            "El enlace expiró.",
                    });

            case "FICHA_YA_ENVIADA":
                return res
                    .status(409)
                    .json({
                        code:
                            "FICHA_YA_ENVIADA",
                        message:
                            "Esta ficha ya fue enviada. Si necesitas modificarla, solicita a RIDS un nuevo enlace.",
                    });

            case "FRONTEND_URL_NO_CONFIGURADO":
        }
    }

    console.error(
        "[LEYPD FICHA]",
        error
    );

    return res
        .status(500)
        .json({
            message:
                "No se pudo completar la operación.",
        });
}
```

**Reemplazar por:**

```ts
/**
 * Códigos que el service lanza como `new Error("CODIGO")`.
 * Se responden con su status; el resto termina en 500.
 */
const ERRORES_FICHA: Record<
    string,
    { status: number; message: string }
> = {
    EMPRESA_NO_ENCONTRADA: {
        status: 404,
        message: "Empresa no encontrada.",
    },
    FICHA_NO_ENCONTRADA: {
        status: 404,
        message: "Ficha no encontrada.",
    },
    TOKEN_INVALIDO: {
        status: 404,
        message: "Enlace inválido.",
    },
    TOKEN_REVOCADO: {
        status: 410,
        message: "El enlace fue revocado.",
    },
    TOKEN_EXPIRADO: {
        status: 410,
        message: "El enlace expiró.",
    },
    FICHA_YA_ENVIADA: {
        status: 409,
        message:
            "Esta ficha ya fue enviada. Si necesitas modificarla, solicita a RIDS un nuevo enlace.",
    },
};

function responderErrorFicha(
    error: unknown,
    res: Response
) {
    if (
        error instanceof
        FichaLeypdValidacionError
    ) {
        return res
            .status(400)
            .json({
                code:
                    "FICHA_VALIDACION",
                message:
                    "Hay respuestas con errores. Revisa los campos marcados.",
                errores:
                    error.errores,
            });
    }

    if (error instanceof Error) {
        const conocido =
            ERRORES_FICHA[
                error.message
            ];

        if (conocido) {
            return res
                .status(
                    conocido.status
                )
                .json({
                    code:
                        error.message,
                    message:
                        conocido.message,
                });
        }
    }

    console.error(
        "[LEYPD FICHA]",
        error
    );

    return res
        .status(500)
        .json({
            message:
                error instanceof Error &&
                error.message ===
                "FRONTEND_URL_NO_CONFIGURADO"
                    ? "Falta configurar FRONTEND_URL en el servidor."
                    : "No se pudo completar la operación.",
        });
}
```

### Notas
- Las respuestas mantienen `message` y ahora agregan `code`. `FICHA_YA_ENVIADA` ya traía `code`, así que el front no cambia.
- La validación responde **400** con `{ code: "FICHA_VALIDACION", message, errores }`. Si el front del formulario público lee los errores por campo con otro nombre, avísame y lo ajusto.
- `getFichaLeypdPdf` tiene su propio manejo, que ya funcionaba. No lo toqué.
- Verificado: `tsc --noEmit` con tu `tsconfig.json` (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Sin caracteres combinantes.

### Pruebas manuales
1. `npx tsc --noEmit` en el backend.
2. `GET /leypd/999999/ficha` (interno, empresa inexistente): ahora da **404** «Empresa no encontrada.» (antes 500).
3. Revoca el enlace de una empresa de prueba y abre el enlace público: **410** «El enlace fue revocado.»
4. Abre un enlace público con un token inventado del largo correcto: **404** «Enlace inválido.»
5. Envía una ficha pública y vuelve a enviarla: **409** con el mensaje de «ya fue enviada».
6. Envía una ficha pública con un RUT o correo inválido: **400** con `errores`. Revisa en la pestaña Network que el formulario lo muestre bien.
7. El flujo normal (guardar ficha interna y PDF) sigue igual.

---

## 2. Despliegue del worker (logo + huella)

El GRANT de `logoPublicId` ya está aplicado en producción, así que el orden es seguro.

1. **Revisa el repo local del worker** (`rids-leypd-worker`):
   - `git status`: `leypd/logos.py` y los cambios de `config.py`, `db.py`, `generadores/informes.py`, `generadores/base.py`, `pipeline.py` y `subida.py` deben estar incluidos en el commit.
   - Si `logos.py` importa alguna librería nueva, tiene que estar en `requirements.txt`. En Railway corre Python 3.12; en local, 3.14.
   - Que no vaya `.env` ni `clientes.json` (`git diff --cached --name-only`).
2. **Variable en Railway** (servicio `worker-leypd` → Variables):
   ```
   CLOUDINARY_CLOUD_NAME=${{rids-intranet-backend.CLOUDINARY_CLOUD_NAME}}
   ```
   Guardar la variable dispara un redeploy con el código anterior. No pasa nada, porque el código anterior no la usa.
3. **Antes del push, confirma que no hay un trabajo EJECUTANDO** en el panel Ley PD. El SIGTERM lo devuelve a PENDIENTE, pero así evitas un reintento.
4. `git push`. Espera a que Railway despliegue y revisa en los logs que el worker tomó el candado sin errores.

### Pruebas manuales
1. **Una empresa sin logo** (por ejemplo ALIANZ), desde el panel: debe dar **«sin cambios»** en todo, porque la huella es la misma de antes.
2. **NORMEN** desde el panel: debe dar **«sin cambios»**, porque ya se aplicó con logo desde tu PC. Si reescribe todo, el worker de producción no está viendo el logo: revisa la variable y el GRANT, y busca en los logs la caída a `None` en `logos.py`.
3. Logs: sin `permission denied` sobre `Empresa`.
4. Opcional: sube un logo de prueba a otra empresa, actualízala y abre un informe PDF y un Word en SharePoint.
