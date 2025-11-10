/** @odoo-module **/

// clocky_pos_payload.js
import { getCabysFromProduct } from "@clocky_accounting_integration/js/clocky_pos_helpers";

/**
 * Construye el payload de la venta POS que se enviará a GAS,
 * y devuelve también datos útiles para el popup.
 */
export function buildPosPayload(order, pos) {
    if (!order) {
        console.warn("[Clocky POS] buildPosPayload(): order vacío");
        return null;
    }

    const envPos = pos || {};

    // --- Datos generales / encabezado ---
    const currency = envPos.currency || {};
    const currencySymbol = currency.symbol || "";
    const currencyName = currency.name || "";

    const client =
        (order.get_partner && order.get_partner()) ||
        (order.get_client && order.get_client()) ||
        null;
    const clientName = client ? client.name : "Cliente mostrador";

    const orderName = order.name || "";
    const journalName =
        (envPos.config && envPos.config.journal_id && envPos.config.journal_id[1]) ||
        (envPos.config && envPos.config.name) ||
        "POS";

    // Fechas
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
    const invoiceDateIso = invoiceDate.toISOString().slice(0, 10);

    // En POS normalmente no hay vencimiento
    const invoiceDateDueStr = "-";

    // Estado simulado
    const stateLabel = "posted";

    // Totales
    const base = order.get_total_without_tax
        ? order.get_total_without_tax()
        : 0;
    const total = order.get_total_with_tax ? order.get_total_with_tax() : base;
    const taxes = total - base;

    // --- Líneas ---
    const orderLines = order.get_orderlines ? order.get_orderlines() : [];
    const linesPayload = [];

    orderLines.forEach((line, index) => {
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

        // Impuestos (texto)
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
    });

    // Pagos
    const paymentLines = order.get_paymentlines ? order.get_paymentlines() : [];
    const paymentMethods = [];
    paymentLines.forEach((payLine) => {
        const methodName =
            (payLine.payment_method && payLine.payment_method.name) ||
            payLine.name ||
            "";
        if (methodName) {
            paymentMethods.push(methodName);
        }
    });

    const paymentInfo = {
        condition: "POS",
        term_days: 0,
        methods: paymentMethods,
    };

    const company = envPos.company || {};
    const customer = client || {};

    const payload = {
        invoice: {
            id: order.uid || null,
            move_type: "out_invoice",
            name: orderName,
            state: stateLabel,
            journal: {
                id:
                    (envPos.config &&
                        envPos.config.journal_id &&
                        envPos.config.journal_id[0]) ||
                    0,
                name: journalName,
                code:
                    (envPos.config &&
                        envPos.config.journal_id &&
                        envPos.config.journal_id[1]) ||
                    null,
            },
            currency: {
                id: currency.id || 0,
                name: currencyName,
                symbol: currencySymbol,
                position: currency.position || "before",
            },
            dates: {
                invoice_date: invoiceDateIso,
                invoice_date_due: null,
            },
            company: {
                id: company.id || 0,
                name: company.name || "",
                vat: company.vat || "",
                email: company.email || null,
                phone: company.phone || company.mobile || null,
                codigo_actividad_receptor: customer.codigo_actividad_receptor || null,
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

    return {
        payload,
        ui: {
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
        },
    };
}
