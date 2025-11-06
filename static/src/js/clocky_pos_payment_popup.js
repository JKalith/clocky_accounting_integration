/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

/**
 * Pequeño parche sobre la pantalla de pago del POS.
 *
 * IMPORTANTE:
 * - No cambia la lógica de Odoo.
 * - Solo llama al método original y, si todo sale bien,
 *   muestra una ventana emergente con el texto "Completado".
 */
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        // 1) Llamamos primero al método original de Odoo
        await super.validateOrder(isForceValidate);

        // 2) Si la validación terminó sin errores, mostramos el alert
        window.alert("Completado");
    },
});
