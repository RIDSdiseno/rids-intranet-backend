import "dotenv/config";

import {
    transporterFinanzas,
} from "../service/baseapi/mailer-finanzas.js";

async function main() {
    console.log(
        "[TEST FINANZAS] Probando conexión SMTP..."
    );

    await transporterFinanzas.verify();

    console.log(
        "[TEST FINANZAS] ✅ SMTP autenticado correctamente"
    );

    const resultado =
        await transporterFinanzas.sendMail({
            from:
                process.env.SMTP_FINANZAS_USER,

            to:
                "dbravo@rids.cl",

            subject:
                "Prueba SMTP Finanzas",

            text:
                "Prueba de envío desde administracion@rids.cl",
        });

    console.log(
        "[TEST FINANZAS] ✅ Correo enviado",
        {
            messageId:
                resultado.messageId,
        }
    );
}

main()
    .catch(
        (
            error
        ) => {
            console.error(
                "[TEST FINANZAS] ❌ Error",
                error
            );

            process.exit(1);
        }
    );