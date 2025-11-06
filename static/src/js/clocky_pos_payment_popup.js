/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

/**
 * Crea una ventana emergente (overlay) con la información
 * de la venta recién pagada en el POS.
 *
 * NO modifica la lógica de Odoo:
 * - Primero deja que Odoo valide la orden (super.validateOrder)
 * - Luego solo lee los datos de la orden actual y pinta el popup.
 */
function showClockyOrderPopup(paymentScreen) {
    const order = paymentScreen.currentOrder;
    if (!order) {
        return;
    }

    const pos = paymentScreen.env.pos || {};
    const currencySymbol = pos.currency ? pos.currency.symbol : "";

    // Cliente
    const client =
        (order.get_partner && order.get_partner()) ||
        (order.get_client && order.get_client()) ||
        null;
    const clientName = client ? client.name : "Cliente mostrador";

    // Totales
    const base = order.get_total_without_tax
        ? order.get_total_without_tax()
        : 0;
    const total = order.get_total_with_tax
        ? order.get_total_with_tax()
        : base;
    const taxes = total - base;

    // Líneas de la orden
    const orderLines = order.get_orderlines ? order.get_orderlines() : [];
    let linesHtml = "";

    orderLines.forEach((line) => {
        const product = line.get_product ? line.get_product() : null;
        const productName = product
            ? product.display_name || product.name
            : "";
        const qty = line.get_quantity
            ? line.get_quantity()
            : line.quantity || 0;
        const unitPrice = line.get_unit_price
            ? line.get_unit_price()
            : line.price || 0;
        const lineTotal = line.get_price_with_tax
            ? line.get_price_with_tax()
            : qty * unitPrice;

        linesHtml += `
            <tr>
                <td style="padding: 4px 2px;">${productName}</td>
                <td style="padding: 4px 2px; text-align: right;">${qty}</td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${unitPrice.toFixed(2)}
                </td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${lineTotal.toFixed(2)}
                </td>
            </tr>
        `;
    });

    // Overlay oscuro
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.4)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    // Caja principal (similar a un wizard de Odoo)
    const box = document.createElement("div");
    box.style.background = "#ffffff";
    box.style.borderRadius = "6px";
    box.style.padding = "18px 22px";
    box.style.minWidth = "640px";
    box.style.maxWidth = "960px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";
    box.style.boxShadow = "0 0 12px rgba(0, 0, 0, 0.25)";
    box.style.fontFamily = "sans-serif";
    box.style.fontSize = "13px";

    box.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px;">
            <h2 style="margin:0; font-size:18px;">Resumen de la venta</h2>
            <span style="font-size:12px; color:#777;">
                POS · ${order.name || ""}
            </span>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom: 12px; font-size:13px;">
            <div><strong>Cliente:</strong> ${clientName}</div>
            <div><strong>Base imponible:</strong> ${currencySymbol} ${base.toFixed(2)}</div>
            <div><strong>Impuestos:</strong> ${currencySymbol} ${taxes.toFixed(2)}</div>
            <div><strong>Total:</strong> ${currencySymbol} ${total.toFixed(2)}</div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
                <tr>
                    <th style="text-align:left; padding:4px 2px; border-bottom:1px solid #ddd;">Producto / Descripción</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Cantidad</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Precio</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                ${linesHtml}
            </tbody>
        </table>

        <div style="text-align: right; margin-top: 10px;">
            <button id="clocky-pos-popup-close"
                style="
                    padding: 6px 16px;
                    border: none;
                    border-radius: 4px;
                    background: #875A7B;
                    color: #ffffff;
                    cursor: pointer;
                    font-size: 13px;
                ">
                Cerrar
            </button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Cerrar popup al hacer clic en el botón
    const btnClose = box.querySelector("#clocky-pos-popup-close");
    if (btnClose) {
        btnClose.addEventListener("click", () => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });
    }
}

/**
 * Parche de la PaymentScreen:
 * - NO cambia el flujo de negocio.
 * - Solo, después de que la orden se valida correctamente,
 *   muestra el popup con el resumen de la venta.
 */
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        // 1) Dejar que Odoo haga TODO su proceso normal
        await super.validateOrder(isForceValidate);

        // 2) Cuando termina sin errores, mostramos nuestra ventana
        showClockyOrderPopup(this);
    },
});
