/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

/**
 * Obtiene un posible código CABYS desde el producto,
 * probando varios nombres de campo comunes en localizaciones CR.
 */
function getCabysFromProduct(product) {
    if (!product) return "";
    return (
        product.cabys ||
        product.l10n_cr_cabys ||
        product.cabys_code ||
        product.x_cabys ||
        ""
    );
}

/**
 * Construye y muestra una ventana emergente con información
 * detallada de la venta, similar al wizard de "Facturar" en contabilidad.
 *
 * NO modifica la lógica del POS:
 * - Solo se llama después de que la orden se validó correctamente.
 */
function showClockyOrderPopup(paymentScreen) {
    const order = paymentScreen.currentOrder;
    if (!order) return;

    const pos = paymentScreen.env.pos || {};

    // --- Datos generales / encabezado ---
    const currency = pos.currency || {};
    const currencySymbol = currency.symbol || "";
    const currencyName = currency.name || "";

    const client =
        (order.get_partner && order.get_partner()) ||
        (order.get_client && order.get_client()) ||
        null;
    const clientName = client ? client.name : "Cliente mostrador";

    const orderName = order.name || "";
    const journalName =
        (pos.config && pos.config.journal_id && pos.config.journal_id[1]) ||
        (pos.config && pos.config.name) ||
        "POS";

    // Fechas: usamos la fecha de validación si existe, si no, la actual
    let invoiceDate = null;
    if (order.validation_date) {
        try {
            invoiceDate = new Date(order.validation_date);
        } catch (e) {
            invoiceDate = new Date();
        }
    } else {
        invoiceDate = new Date();
    }
    const invoiceDateStr = invoiceDate.toLocaleDateString();

    // En POS normalmente no hay vencimiento; lo dejamos en blanco o "-"
    const invoiceDateDueStr = "-";

    // Estado “simulado” para mostrar algo similar al wizard
    const stateLabel = "posted";

    // Totales
    const base = order.get_total_without_tax
        ? order.get_total_without_tax()
        : 0;
    const total = order.get_total_with_tax ? order.get_total_with_tax() : base;
    const taxes = total - base;

    // --- Líneas de la orden ---
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

        const discount = line.get_discount ? line.get_discount() : line.discount || 0;

        const priceWithoutTax = line.get_price_without_tax
            ? line.get_price_without_tax()
            : qty * unitPrice;

        const priceWithTax = line.get_price_with_tax
            ? line.get_price_with_tax()
            : priceWithoutTax;

        const taxesAmount = priceWithTax - priceWithoutTax;

        // Impuestos (nombres) si la API de POS los expone
        let taxesDisplay = "";
        if (line.get_taxes) {
            try {
                const taxesList = line.get_taxes();
                if (Array.isArray(taxesList) && taxesList.length) {
                    taxesDisplay = taxesList
                        .map((t) => t.name || "")
                        .filter(Boolean)
                        .join(", ");
                }
            } catch (e) {
                // silencioso
            }
        }
        if (!taxesDisplay) {
            // Si no logramos obtener los nombres, al menos mostramos el monto
            taxesDisplay = taxesAmount
                ? `${currencySymbol} ${taxesAmount.toFixed(2)}`
                : "-";
        }

        const cabysCode = getCabysFromProduct(product);

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
                <td style="padding: 4px 2px;">${cabysCode || ""}</td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${priceWithoutTax.toFixed(2)}
                </td>
                <td style="padding: 4px 2px; text-align: right;">
                    ${currencySymbol} ${priceWithTax.toFixed(2)}
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

    // --- Caja principal (similar a un wizard de Odoo) ---
    const box = document.createElement("div");
    box.style.background = "#ffffff";
    box.style.borderRadius = "6px";
    box.style.padding = "18px 22px";
    box.style.minWidth = "780px";
    box.style.maxWidth = "1080px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";
    box.style.boxShadow = "0 0 12px rgba(0, 0, 0, 0.25)";
    box.style.fontFamily = "sans-serif";
    box.style.fontSize = "13px";

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

    // --- Cerrar popup ---
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
 * Parche de PaymentScreen:
 * - Deja que Odoo valide la orden normalmente
 * - Luego muestra el popup con la info detallada
 */
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        // 1) Flujo normal de Odoo (incluye tu FE, creación de factura, etc.)
        await super.validateOrder(isForceValidate);

        // 2) Mostramos el resumen detallado tipo "Facturar"
        showClockyOrderPopup(this);
    },
});
