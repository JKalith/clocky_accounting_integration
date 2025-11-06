/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

/**
 * Botón en la pantalla de productos del POS para probar el envío
 * de la factura a GAS reutilizando la lógica del backend.
 */
export class ClockyFePosTestButton extends Component {
    static template = "clocky_accounting_integration.ClockyFePosTestButton";

    setup() {
        this.pos = usePos();
        this.orm = useService("orm");
        this.notification = useService("notification");
    }

    async click() {
        const order = this.pos.get_order();

        if (!order) {
            this.notification.add(_t("No hay un pedido activo en el POS."), {
                type: "warning",
            });
            return;
        }

        // El botón tiene más sentido si el pedido está marcado para facturar
        if (!order.to_invoice) {
            this.notification.add(
                _t(
                    "Este pedido no está marcado para facturación. " +
                    "Active la opción de factura para que genere una factura contable."
                ),
                { type: "warning" }
            );
            return;
        }

        // En Odoo 17 el ID del pedido en backend suele ser server_id
        const posOrderId = order.server_id;
        if (!posOrderId) {
            this.notification.add(
                _t(
                    "El pedido aún no se ha sincronizado con el servidor. " +
                    "Primero debe ser pagado y enviado al backend."
                ),
                { type: "warning" }
            );
            return;
        }

        try {
            // Llamamos al método que agregamos en pos.order (Python)
            await this.orm.call(
                "pos.order",
                "clocky_pos_send_fe",
                [[posOrderId]],
                {}
            );

            this.notification.add(
                _t("Factura enviada a GAS correctamente desde el POS."),
                { type: "success" }
            );
        } catch (error) {
            console.error("Error enviando FE GAS desde POS:", error);
            this.notification.add(
                _t("Error al enviar la factura a GAS. Revise los logs de Odoo para más detalles."),
                { type: "danger" }
            );
        }
    }
}

// Agrega el botón a la ProductScreen del POS
ProductScreen.addControlButton({
    component: ClockyFePosTestButton,
    // Aquí podrías poner una condición para mostrarlo sólo en ciertos POS
    condition: () => true,
});
