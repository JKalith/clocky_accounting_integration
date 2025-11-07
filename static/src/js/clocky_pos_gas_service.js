/** @odoo-module **/

/**
 * Envía el payload de la venta de POS al Web App de GAS a través del servidor Odoo.
 * Llama al modelo Python clocky.pos.integration y su método clocky_pos_post_to_gas.
 */
export async function sendPosOrderToGas(payload, paymentScreen) {
    console.log("[Clocky POS] ===============================================");
    console.log("[Clocky POS] Iniciando envío de venta a GAS (vía Odoo / clocky_pos_post_to_gas)...");
    console.log("[Clocky POS] Payload (objeto JS):", payload);

    // Obtenemos el servicio ORM desde la pantalla de pago
    const orm =
        (paymentScreen && paymentScreen.orm) ||
        (paymentScreen &&
            paymentScreen.env &&
            paymentScreen.env.services &&
            paymentScreen.env.services.orm) ||
        null;

    if (!orm) {
        console.error("[Clocky POS] No se encontró 'orm' en PaymentScreen. No se puede llamar al método de servidor.");
        return {
            ok: false,
            error: "No se encontró orm en PaymentScreen",
        };
    }

    try {
        console.log("[Clocky POS] Llamando a modelo 'clocky.pos.integration' :: método 'clocky_pos_post_to_gas' vía RPC...");

        const result = await orm.call(
            "clocky.pos.integration",
            "clocky_pos_post_to_gas",
            [payload]
        );

        console.log("[Clocky POS] Respuesta desde Odoo (clocky_pos_post_to_gas):", result);

        if (!result || result.ok === false) {
            console.error(
                "[Clocky POS] Servidor reporta error al enviar a GAS:",
                result && result.error ? result.error : result
            );
        } else {
            console.log(
                "[Clocky POS] Envío a GAS OK. Status:",
                result.status,
                "Respuesta GAS:",
                result.response
            );
        }

        return result;
    } catch (err) {
        console.error("[Clocky POS] Error de red/RPC al llamar clocky_pos_post_to_gas:", err);
        return {
            ok: false,
            error: "Error RPC al llamar clocky_pos_post_to_gas: " + err,
        };
    } finally {
        console.log("[Clocky POS] Envío a GAS (vía Odoo) finalizado.");
    }
}
