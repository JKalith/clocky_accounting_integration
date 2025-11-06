/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

/**
 * Obtiene un posible código CABYS desde el producto,
 * probando varios nombres de campo comunes en localizaciones CR.
 */
function getCabysFromProduct(product) {
    if (!product) {
        console.log("[Clocky POS] getCabysFromProduct(): producto vacío, devuelve cadena vacía");
        return "";
    }
    const cabysValue =
        product.cabys ||
        product.l10n_cr_cabys ||
        product.cabys_code ||
        product.x_cabys ||
        "";
    console.log(
        "[Clocky POS] getCabysFromProduct():",
        product.display_name || product.name,
        "=>",
        cabysValue
    );
    return cabysValue;
}

/**
 * Envía el payload de la venta de POS al Web App de Google Apps Script (GAS).
 * Incluye muchos console.log para poder seguir cada paso en la consola del navegador.
 */
async function sendPosOrderToGas(payload) {
    // ⚠️ IMPORTANTE:
    // Reemplaza esta URL por la URL de despliegue de tu Web App de GAS (la misma que ya usas en contabilidad, si quieres).
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyRTh2kRiq1jH5yfbcytXrtLXApWbjFziFAt6kLxMP0aoeig1NPxnSu1O5VhPS2wPu2dw/exec";

    console.log("[Clocky POS] ===============================================");
    console.log("[Clocky POS] Iniciando envío de venta a GAS (POS)...");
    console.log("[Clocky POS] URL de destino:", GAS_URL);
    console.log("[Clocky POS] Payload (objeto JS):", payload);

    let body = "";
    try {
        body = JSON.stringify(payload);
        console.log("[Clocky POS] Payload serializado a JSON:", body);
    } catch (jsonErr) {
        console.error("[Clocky POS] Error al serializar el payload a JSON:", jsonErr);
        return;
    }

    try {
        console.log("[Clocky POS] Lanzando fetch() hacia GAS...");
        const response = await fetch(GAS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body,
        });

        console.log(
            "[Clocky POS] Respuesta HTTP de GAS:",
            response.status,
            response.statusText
        );

        const text = await response.text();
        console.log("[Clocky POS] Texto crudo de respuesta de GAS:", text);

        try {
            const json = JSON.parse(text);
            console.log("[Clocky POS] Respuesta parseada como JSON:", json);
        } catch (parseErr) {
            console.warn(
                "[Clocky POS] No se pudo parsear la respuesta como JSON (esto es normal si tu GAS no devuelve JSON):",
                parseErr
            );
        }
    } catch (netErr) {
        console.error("[Clocky POS] Error de red al llamar a GAS:", netErr);
    }

    console.log("[Clocky POS] Envío a GAS finalizado (revisa los logs anteriores para ver el detalle).");
}

/**
 * Construye y muestra una ventana emergente con información
 * detallada de la venta, similar al wizard de “Facturar” en contabilidad.
 * Aprovechamos esta función para construir también el payload que se enviará a GAS.
 */
function showClockyOrderPopup(paymentScreen) {
    const order = paymentScreen.currentOrder;
    if (!order) return;

    const pos = paymentScreen.env.pos || {};

    console.log("[Clocky POS] showClockyOrderPopup() llamado");
    console.log("[Clocky POS] currentOrder:", order);
    console.log("[Clocky POS] env.pos:", pos);

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
    const linesPayload = [];

    console.log("[Clocky POS] Totales calculados para la orden:", {
        orderName,
        clientName,
        base,
        total,
        taxes,
        currencySymbol,
        currencyName,
        invoiceDate,
    });

    orderLines.forEach((line, index) => {
        console.log("[Clocky POS] Procesando línea #", index, " cruda:", line);

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

        const linePayload = {
            id: line.id || index,
            product: {
                id: product ? product.id || 0 : 0,
                name: productName,
                default_code: product ? product.default_code || null : null,
            },
            description: productName,
            quantity: qty,
            uom_name:
                line.get_unit && line.get_unit()
                    ? line.get_unit().name || ""
                    : "",
            uom_code:
                line.get_unit && line.get_unit()
                    ? line.get_unit().id || ""
                    : "",
            price_unit: unitPrice,
            discount: discount,
            cabys: cabysCode || null,
            taxes_display: taxesDisplay ? [taxesDisplay] : [],
            taxes_ids: [],
            subtotal: priceWithoutTax,
            total: priceWithTax,
        };
        linesPayload.push(linePayload);

        console.log("[Clocky POS] Línea preparada para payload:", linePayload);

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

    // --- Construimos payload para envío a GAS ---
    console.log("[Clocky POS] Preparando payload para envío a GAS...");

    const paymentLines = order.get_paymentlines ? order.get_paymentlines() : [];
    const paymentMethods = [];
    paymentLines.forEach((payLine, payIndex) => {
        const methodName =
            (payLine.payment_method && payLine.payment_method.name) ||
            payLine.name ||
            "";
        if (methodName) {
            paymentMethods.push(methodName);
        }
        console.log("[Clocky POS] Línea de pago #", payIndex, {
            methodName,
            amount: payLine.amount,
        });
    });

    const paymentInfo = {
        condition: "POS",
        term_days: 0,
        methods: paymentMethods,
    };

    const company = pos.company || {};
    const customer = client || {};

    const payload = {
        invoice: {
            id: order.uid || null,
            move_type: "out_invoice",
            name: orderName,
            state: stateLabel,
            journal: {
                id:
                    (pos.config &&
                        pos.config.journal_id &&
                        pos.config.journal_id[0]) ||
                    0,
                name: journalName,
                code:
                    (pos.config &&
                        pos.config.journal_id &&
                        pos.config.journal_id[1]) ||
                    null,
            },
            currency: {
                id: currency.id || 0,
                name: currencyName,
                symbol: currencySymbol,
                position: currency.position || "before",
            },
            dates: {
                invoice_date: invoiceDate.toISOString().slice(0, 10),
                invoice_date_due: null,
            },
            company: {
                id: company.id || 0,
                name: company.name || "",
                vat: company.vat || "",
                email: company.email || null,
                phone: company.phone || company.mobile || null,
                address: {
                    country:
                        company.country_id && company.country_id[1]
                            ? company.country_id[1]
                            : null,
                    state:
                        company.state_id && company.state_id[1]
                            ? company.state_id[1]
                            : null,
                    city: company.city || null,
                    street: company.street || null,
                    neighborhood: null,
                    other: null,
                },
            },
            customer: {
                id: customer.id || 0,
                name: clientName,
                vat: customer.vat || "",
                email: customer.email || null,
                phone: customer.phone || customer.mobile || null,
                address: {
                    country:
                        customer.country_id && customer.country_id[1]
                            ? customer.country_id[1]
                            : null,
                    state:
                        customer.state_id && customer.state_id[1]
                            ? customer.state_id[1]
                            : null,
                    city: customer.city || null,
                    street: customer.street || null,
                    neighborhood: null,
                    other: null,
                },
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

    console.log("[Clocky POS] Payload final para GAS:", payload);

    try {
        void sendPosOrderToGas(payload);
    } catch (e) {
        console.error(
            "[Clocky POS] Error inesperado al invocar sendPosOrderToGas:",
            e
        );
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
        console.log("[Clocky POS] validateOrder() (parche Clocky) :: inicio", {
            isForceValidate,
        });

        // 1) Flujo normal de Odoo (incluye tu FE, creación de factura, etc.)
        await super.validateOrder(isForceValidate);

        console.log(
            "[Clocky POS] validateOrder() :: después de super.validateOrder, currentOrder:",
            this.currentOrder
        );

        // 2) Mostramos el resumen detallado tipo "Facturar"
        showClockyOrderPopup(this);

        console.log(
            "[Clocky POS] validateOrder() :: showClockyOrderPopup() ejecutado"
        );
    },
});
