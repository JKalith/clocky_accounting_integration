/** @odoo-module **/

// clocky_pos_payment_patch.js
import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

import { buildPosPayload } from "@clocky_accounting_integration/js/clocky_pos_payload";
import { sendPosOrderToGas } from "@clocky_accounting_integration/js/clocky_pos_gas_service";

// 👆 Ajusta los imports según tu nombre de módulo / ruta

function showClockyOrderPopup(paymentScreen) {
    const order = paymentScreen.currentOrder;
    if (!order) return;

    const pos = paymentScreen.env.pos || {};

    console.log("[Clocky POS] showClockyOrderPopup() llamado");

    const built = buildPosPayload(order, pos);
    if (!built) {
        console.error("[Clocky POS] buildPosPayload() devolvió null");
        return;
    }

    const { payload, ui } = built;
    const {
        orderName,
        clientName,
        journalName,
        invoiceDateStr,
        invoiceDateDueStr,
        stateLabel,
        base,
        taxes,
        total,
        currencySymbol,
        currencyName,
    } = ui;

    console.log("[Clocky POS] Payload final para Odoo (proxy GAS):", payload);

    // Disparar el envío (no bloqueamos la UI)
    try {
        void sendPosOrderToGas(payload, paymentScreen);
    } catch (e) {
        console.error("[Clocky POS] Error inesperado al invocar sendPosOrderToGas:", e);
    }

    // Construimos el HTML de las líneas a partir del payload
    const lines = payload.invoice.lines || [];
    let linesHtml = "";

    lines.forEach((l) => {
        const productName = l.description || "";
        const qty = l.quantity || 0;
        const unitPrice = l.price_unit || 0;
        const discount = l.discount || 0;
        const taxesDisplay =
            (Array.isArray(l.taxes_display) && l.taxes_display[0]) || "-";
        const cabysCode = l.cabys || "";
        const subtotal = l.subtotal || 0;
        const totalLine = l.total || 0;

        linesHtml += `
            <tr>
                <td style="padding: 4px 2px;">${productName}</td>
                <td style="padding: 4px 2px; text-align: right;">${qty}</td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${unitPrice.toFixed(2)}
                </td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${discount ? discount.toFixed(2) + "%" : "0%"}
                </td>
                <td style="padding: 4px 2px;">${taxesDisplay}</td>
                <td style="padding: 4px 2px;">${cabysCode}</td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${subtotal.toFixed(2)}
                </td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${totalLine.toFixed(2)}
                </td>
            </tr>
        `;
    });

    if (!linesHtml) {
        linesHtml = `
            <tr>
                <td colspan="8" style="padding: 6px; text-align:center; color:#777;">
                    Sin líneas
                </td>
            </tr>
        `;
    }

    // --- Overlay oscuro ---
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.4)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    // --- Caja principal ---
    const box = document.createElement("div");
    box.style.background = "#ffffff";
    box.style.borderRadius = "6px";
    box.style.padding = "18px 22px";
    box.style.minWidth = "780px";
    box.style.maxWidth = "1080px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";
    box.style.boxShadow = "0 0 15px rgba(0, 0, 0, 0.25)";

    box.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px;">
            <h2 style="margin:0; font-size:18px;">Resumen de la venta (POS)</h2>
            <span style="font-size:12px; color:#777;">
                POS · Pedido ${orderName}
            </span>
        </div>

        <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:4px 24px; margin-bottom: 10px;">
            <div><strong>Consecutivo:</strong> ${orderName}</div>
            <div><strong>Base imponible:</strong> ${currencySymbol} ${base.toFixed(2)}</div>

            <div><strong>Cliente:</strong> ${clientName}</div>
            <div><strong>Impuestos:</strong> ${currencySymbol} ${taxes.toFixed(2)}</div>

            <div><strong>Diario:</strong> ${journalName}</div>
            <div><strong>Total:</strong> ${currencySymbol} ${total.toFixed(2)}</div>

            <div><strong>Moneda:</strong> ${currencyName}</div>
            <div><strong>Estado:</strong> ${stateLabel}</div>

            <div><strong>Fecha de factura:</strong> ${invoiceDateStr}</div>
            <div><strong>Fecha de vencimiento:</strong> ${invoiceDateDueStr}</div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
                <tr>
                    <th style="text-align:left; padding:4px 2px; border-bottom:1px solid #ddd;">Producto/Descripción</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Cantidad</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Precio</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Desc.</th>
                    <th style="text-align:left; padding:4px 2px; border-bottom:1px solid #ddd;">Impuestos</th>
                    <th style="text-align:left; padding:4px 2px; border-bottom:1px solid #ddd;">CABYS</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Subtotal</th>
                    <th style="text-align:right; padding:4px 2px; border-bottom:1px solid #ddd;">Total</th>
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

    const btnClose = box.querySelector("#clocky-pos-popup-close");
    if (btnClose) {
        btnClose.addEventListener("click", () => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });
    }
}

// ==================== PATCH PaymentScreen ====================

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        console.log("[Clocky POS] validateOrder() (parche Clocky) :: inicio", {
            isForceValidate,
        });

        // 1) Flujo normal de Odoo
        await this._super(isForceValidate);

        console.log(
            "[Clocky POS] validateOrder() :: después de _super, currentOrder:",
            this.currentOrder
        );

        // 2) Mostrar popup
        showClockyOrderPopup(this);

        console.log("[Clocky POS] validateOrder() :: showClockyOrderPopup() ejecutado");
    },
});
