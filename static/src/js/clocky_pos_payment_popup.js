/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

/** CABYS helper */
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

/** Enviar a GAS vía servidor Odoo */
async function sendPosOrderToGas(payload, paymentScreen) {
    const orm =
        paymentScreen.orm ||
        (paymentScreen.env && paymentScreen.env.services.orm);

    if (!orm) {
        console.error("[Clocky POS] No se encontró ORM");
        return { ok: false, error: "No ORM" };
    }

    try {
        return await orm.call(
            "clocky.pos.integration",
            "clocky_pos_post_to_gas",
            [payload]
        );
    } catch (e) {
        console.error("[Clocky POS] Error RPC:", e);
        return { ok: false, error: e };
    }
}

/** MOSTRAR POPUP + CONSTRUIR PAYLOAD */
function showClockyOrderPopup(paymentScreen) {
    const order = paymentScreen.currentOrder;
    const pos = paymentScreen.env.pos;

    if (!order) return;

    /* ===============================
     *       MONEDA CORREGIDA
     * =============================== */
    const posCurrency = (pos.currency && pos.currency.id)
        ? pos.currency
        : {
              id:
                  (pos.config.currency_id && pos.config.currency_id[0]) ||
                  (pos.company.currency_id && pos.company.currency_id[0]) ||
                  0,
              name:
                  (pos.config.currency_id && pos.config.currency_id[1]) ||
                  (pos.company.currency_id && pos.company.currency_id[1]) ||
                  null,
              symbol:
                  (pos.currency && pos.currency.symbol) ||
                  (
                      (pos.config.currency_id &&
                          pos.config.currency_id[1] === "CRC")
                          ? "₡"
                          : (pos.config.currency_id &&
                                pos.config.currency_id[1]) || ""
                  ),
              position: "before",
          };

    const currencySymbol = posCurrency.symbol || "";
    const currencyName = posCurrency.name || "";

    /* ===============================
     *        CONDICIÓN DE PAGO
     * =============================== */
    // POS es contado → Hacienda código "01"
    const paymentConditionCode = "01";

    const paymentLines = order.get_paymentlines();
    const paymentMethods = paymentLines.map((l) => l.payment_method.name);

    const paymentInfo = {
        condition: paymentConditionCode,
        term_days: 0,
        methods: paymentMethods,
    };

    /* ===============================
     *       TOTALES Y CLIENTE
     * =============================== */
    const client = order.get_partner() || null;
    const clientName = client ? client.name : "Cliente mostrador";

    const base = order.get_total_without_tax();
    const total = order.get_total_with_tax();
    const taxes = total - base;

    const orderLines = order.get_orderlines();

    let linesHtml = "";
    const linesPayload = [];

    orderLines.forEach((line, index) => {
        const product = line.get_product();
        const productName = product.display_name || product.name;
        const qty = line.get_quantity();
        const unitPrice = line.get_unit_price();
        const priceWithoutTax = line.get_price_without_tax();
        const priceWithTax = line.get_price_with_tax();
        const discount = line.get_discount();
        const taxesAmount = priceWithTax - priceWithoutTax;

        const cabys = getCabysFromProduct(product);

        const linePayload = {
            id: line.id || index,
            product: {
                id: product.id,
                name: productName,
                default_code: product.default_code || null,
            },
            description: productName,
            quantity: qty,
            uom_name: line.get_unit().name,
            uom_code: line.get_unit().id,
            price_unit: unitPrice,
            discount: discount,
            cabys: cabys || null,
            taxes_display: taxesAmount
                ? [`${currencySymbol} ${taxesAmount.toFixed(2)}`]
                : [],
            subtotal: priceWithoutTax,
            total: priceWithTax,
        };

        linesPayload.push(linePayload);

        linesHtml += `
            <tr>
                <td>${productName}</td>
                <td style="text-align:right">${qty}</td>
                <td style="text-align:right">${currencySymbol} ${unitPrice.toFixed(2)}</td>
                <td style="text-align:right">${discount ? discount + "%" : "0%"}</td>
                <td>${currencySymbol} ${taxesAmount.toFixed(2)}</td>
                <td>${cabys || ""}</td>
                <td style="text-align:right">${currencySymbol} ${priceWithoutTax.toFixed(2)}</td>
                <td style="text-align:right">${currencySymbol} ${priceWithTax.toFixed(2)}</td>
            </tr>
        `;
    });

    /* ===============================
     *            PAYLOAD
     * =============================== */
    const payload = {
        invoice: {
            id: order.uid,
            move_type: "out_invoice",
            name: order.name,
            state: "posted",
            journal: {
                id: pos.config.journal_id[0],
                name: pos.config.journal_id[1],
                code: pos.config.journal_id[1],
            },
            currency: {
                id: posCurrency.id,
                name: currencyName,
                symbol: currencySymbol,
                position: posCurrency.position,
            },
            dates: {
                invoice_date: new Date().toISOString().slice(0, 10),
                invoice_date_due: null,
            },
            company: {
                id: pos.company.id,
                name: pos.company.name,
                vat: pos.company.vat,
                email: pos.company.email,
                phone: pos.company.phone,
            },
            customer: {
                id: client ? client.id : 0,
                name: clientName,
                vat: client ? client.vat : "",
                email: client ? client.email : "",
                phone: client ? client.phone : "",
            },
            amounts: {
                untaxed: base,
                tax: taxes,
                total: total,
            },
            payment: paymentInfo,
            lines: linesPayload,
            meta: {
                source: "odoo_pos",
                version: "1.0",
            },
        },
    };

    // Enviar sin bloquear
    void sendPosOrderToGas(payload, paymentScreen);

    /* ===============================
     *           POPUP
     * =============================== */

    const overlay = document.createElement("div");
    overlay.style = `
        position:fixed; inset:0; background:rgba(0,0,0,.4);
        display:flex; justify-content:center; align-items:center;
        z-index:9999
    `;

    const box = document.createElement("div");
    box.style = `
        background:white; padding:18px 22px; border-radius:6px;
        min-width:780px; max-width:1080px; max-height:80vh; overflow:auto;
    `;

    box.innerHTML = `
        <h2>Resumen de venta</h2>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;">
            <div><strong>Consecutivo:</strong> ${order.name}</div>
            <div><strong>Base imponible:</strong> ${currencySymbol} ${base.toFixed(2)}</div>

            <div><strong>Cliente:</strong> ${clientName}</div>
            <div><strong>Impuestos:</strong> ${currencySymbol} ${taxes.toFixed(2)}</div>

            <div><strong>Moneda:</strong> ${currencyName}</div>
            <div><strong>Condición pago:</strong> ${paymentConditionCode}</div>

            <div><strong>Total:</strong> ${currencySymbol} ${total.toFixed(2)}</div>
        </div>

        <table style="width:100%; margin-top:15px; border-collapse:collapse">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Cant</th>
                    <th>Precio</th>
                    <th>Desc</th>
                    <th>Imp</th>
                    <th>CABYS</th>
                    <th>Sub</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>${linesHtml}</tbody>
        </table>

        <div style="text-align:right; margin-top:15px;">
            <button id="clocky-close-popup"
                style="background:#875A7B;color:white;padding:6px 16px;border:none;border-radius:4px;cursor:pointer;">
                Cerrar
            </button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector("#clocky-close-popup").onclick = () => overlay.remove();
}

/** PATCH PAYMENT SCREEN */
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        await super.validateOrder(isForceValidate);
        showClockyOrderPopup(this);
    },
});
