/** @odoo-module **/

// clocky_pos_payload.js (versión con diagnóstico detallado)

let CLOCKY_DEBUG = true; // pon en false para silenciar logs

// Import robusto del helper CABYS (evita que una import rota tumbe todo)
let getCabysFromProduct = null;
try {
    // Import estándar
    // eslint-disable-next-line import/no-unresolved
    const _h = await import("@clocky_accounting_integration/js/clocky_pos_helpers");
    getCabysFromProduct = _h?.getCabysFromProduct || null;
} catch (e) {
    // fallback legacy require (si el bundler no soporta import dinámico)
    try {
        // eslint-disable-next-line no-undef
        const _legacy = require("@clocky_accounting_integration/js/clocky_pos_helpers");
        getCabysFromProduct = _legacy?.getCabysFromProduct || null;
    } catch (e2) {
        getCabysFromProduct = null;
    }
}
if (CLOCKY_DEBUG) {
    console.log("[Clocky POS] CABYS helper cargado?", !!getCabysFromProduct);
}

/**
 * Log helper
 */
function dlog(...args) {
    if (CLOCKY_DEBUG) console.log(...args);
}
function dwarn(...args) {
    if (CLOCKY_DEBUG) console.warn(...args);
}
function derror(...args) {
    console.error(...args);
}

/**
 * Resuelve la moneda del POS de forma robusta.
 * Busca: pos.currency → company.currency_id[1] → pricelist.currency_id[1] → config.currency_id[1]
 */
function resolvePosCurrency(pos) {
    const p = pos || {};
    const c = p.currency || {};

    const resolvedName =
        (c.name && String(c.name)) ||
        (c.display_name && String(c.display_name)) ||
        (p.company && p.company.currency_id && p.company.currency_id[1]) ||
        (p.pricelist && p.pricelist.currency_id && p.pricelist.currency_id[1]) ||
        (p.config && p.config.currency_id && p.config.currency_id[1]) ||
        null;

    const resolved = {
        id: c.id || 0,
        name: resolvedName,
        symbol: c.symbol || null,
        position: c.position || "before",
        // fuentes para diagnóstico
        _sources: {
            posCurrency: c,
            companyCurrency: p.company?.currency_id || null,
            pricelistCurrency: p.pricelist?.currency_id || null,
            configCurrency: p.config?.currency_id || null,
        },
    };

    dlog("[Clocky POS] resolvePosCurrency() →", resolved);

    if (!resolved.name) {
        dwarn("[Clocky POS] Moneda sin `name`/`display_name`. Ninguna fuente alternativa devolvió nombre.");
    }
    if (!resolved.symbol) {
        dwarn("[Clocky POS] Moneda sin `symbol` en pos.currency. (No es crítico, solo afecta formato visual)");
    }
    return resolved;
}

/**
 * Obtiene partner del pedido con fallback
 */
function resolveClient(order) {
    const client =
        (order.get_partner && order.get_partner()) ||
        (order.get_client && order.get_client()) ||
        null;
    const clientName = client ? client.name : "Cliente mostrador";
    dlog("[Clocky POS] Cliente:", { clientExists: !!client, clientName, client });
    return { client, clientName };
}

/**
 * Diagnóstico de líneas: imprime datos clave de cada línea
 */
function logLinesForDebug(orderLines, currencySymbol) {
    console.groupCollapsed?.("[Clocky POS] Diagnóstico de líneas de pedido");
    orderLines.forEach((line, index) => {
        let product = null;
        try { product = line.get_product ? line.get_product() : null; } catch (e) {}
        const productName = product ? (product.display_name || product.name) : "";

        let qty = 0, unitPrice = 0, disc = 0, pwt = 0, pwtax = 0, taxesAmount = 0, uomName = "", uomId = "";
        try { qty = line.get_quantity ? line.get_quantity() : line.quantity || 0; } catch (e) {}
        try { unitPrice = line.get_unit_price ? line.get_unit_price() : line.price || 0; } catch (e) {}
        try { disc = line.get_discount ? line.get_discount() : line.discount || 0; } catch (e) {}
        try { pwt = line.get_price_without_tax ? line.get_price_without_tax() : (qty * unitPrice); } catch (e) { pwt = (qty * unitPrice); }
        try { pwtax = line.get_price_with_tax ? line.get_price_with_tax() : pwt; } catch (e) { pwtax = pwt; }
        taxesAmount = pwtax - pwt;

        let taxesDisplay = "";
        try {
            if (line.get_taxes) {
                const taxesList = line.get_taxes();
                if (Array.isArray(taxesList) && taxesList.length) {
                    taxesDisplay = taxesList.map((t) => t.name || "").filter(Boolean).join(", ");
                }
            }
        } catch (e) {}
        if (!taxesDisplay) {
            taxesDisplay = taxesAmount ? `${currencySymbol || ""} ${Number(taxesAmount).toFixed(2)}` : "-";
        }

        try {
            const u = line.get_unit && line.get_unit();
            uomName = u?.name || "";
            uomId = u?.id || "";
        } catch (e) {}

        const cabysCode = getCabysFromProduct ? getCabysFromProduct(product) : null;

        console.log(
            `  #${index + 1}`,
            {
                productId: product?.id || 0,
                productName,
                qty,
                unitPrice,
                discount: disc,
                subtotal: pwt,
                total: pwtax,
                taxesAmount,
                taxesDisplay,
                uomName,
                uomId,
                cabysCode,
            }
        );
    });
    console.groupEnd?.();
}

/**
 * Construye el payload de la venta POS para enviar a GAS y data de UI
 */
export function buildPosPayload(order, pos) {
    try {
        if (!order) {
            dwarn("[Clocky POS] buildPosPayload(): order vacío");
            return null;
        }

        // Log de entrada
        console.groupCollapsed?.("[Clocky POS] buildPosPayload() - Diagnóstico inicial");
        dlog("¿Order existe?", !!order);
        dlog("Order name/uid:", { name: order?.name, uid: order?.uid });

        const envPos = pos || {};
        dlog("¿POS recibido?", !!envPos);

        // Muestra fuentes crudas del POS
        dlog("POS.currency:", envPos?.currency);
        dlog("POS.company.currency_id:", envPos?.company?.currency_id);
        dlog("POS.pricelist.currency_id:", envPos?.pricelist?.currency_id);
        dlog("POS.config.currency_id:", envPos?.config?.currency_id);
        dlog("POS.journal_id:", envPos?.config?.journal_id);
        dlog("POS.company:", envPos?.company);

        // Moneda
        const { id: currencyId, name: currencyName, symbol: currencySymbol, position: currencyPosition } =
            resolvePosCurrency(envPos);

        // Cliente
        const { client, clientName } = resolveClient(order);

        // Journal/Order
        const orderName = order.name || "";
        const journalName =
            (envPos.config && envPos.config.journal_id && envPos.config.journal_id[1]) ||
            (envPos.config && envPos.config.name) ||
            "POS";
        dlog("Journal resuelto:", journalName);

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
        const invoiceDateDueStr = "-";
        dlog("Fechas:", { invoiceDateStr, invoiceDateIso, invoiceDateDueStr });

        // Estado simulado
        const stateLabel = "posted";

        // Totales del pedido
        const base = order.get_total_without_tax ? order.get_total_without_tax() : 0;
        const total = order.get_total_with_tax ? order.get_total_with_tax() : base;
        const taxes = total - base;
        dlog("Totales:", { untaxed: base, tax: taxes, total });

        // --- Líneas ---
        const orderLines = order.get_orderlines ? order.get_orderlines() : [];
        dlog("Cantidad de líneas:", orderLines?.length || 0);
        logLinesForDebug(orderLines, currencySymbol);

        const linesPayload = [];
        orderLines.forEach((line, index) => {
            const product = line.get_product ? line.get_product() : null;
            const productName = product ? (product.display_name || product.name) : "";

            const qty = line.get_quantity ? line.get_quantity() : (line.quantity || 0);
            const unitPrice = line.get_unit_price ? line.get_unit_price() : (line.price || 0);
            const discount = line.get_discount ? line.get_discount() : (line.discount || 0);

            const priceWithoutTax = line.get_price_without_tax
                ? line.get_price_without_tax()
                : (qty * unitPrice);

            const priceWithTax = line.get_price_with_tax
                ? line.get_price_with_tax()
                : priceWithoutTax;

            const taxesAmount = priceWithTax - priceWithoutTax;

            let taxesDisplay = "";
            try {
                if (line.get_taxes) {
                    const taxesList = line.get_taxes();
                    if (Array.isArray(taxesList) && taxesList.length) {
                        taxesDisplay = taxesList.map((t) => t.name || "").filter(Boolean).join(", ");
                    }
                }
            } catch (e) { /* silent */ }
            if (!taxesDisplay) {
                taxesDisplay = taxesAmount ? `${currencySymbol || ""} ${Number(taxesAmount).toFixed(2)}` : "-";
            }

            const cabysCode = getCabysFromProduct ? getCabysFromProduct(product) : null;

            const linePayload = {
                id: line.id || index,
                product: {
                    id: product ? (product.id || 0) : 0,
                    name: productName,
                    default_code: product ? (product.default_code || null) : null,
                },
                description: productName,
                quantity: qty,
                uom_name: (line.get_unit && line.get_unit()) ? (line.get_unit().name || "") : "",
                uom_code: (line.get_unit && line.get_unit()) ? (line.get_unit().id || "") : "",
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
                payLine.name || "";
            if (methodName) paymentMethods.push(methodName);
        });
        const paymentInfo = { condition: "POS", term_days: 0, methods: paymentMethods };
        dlog("Pagos:", paymentInfo);

        // Company & Customer
        const company = envPos.company || {};
        const customer = client || {};

        // Payload final
        const payload = {
            invoice: {
                id: order.uid || null,
                move_type: "out_invoice",
                name: orderName,
                state: stateLabel,
                journal: {
                    id: (envPos.config && envPos.config.journal_id && envPos.config.journal_id[0]) || 0,
                    name: journalName,
                    code: (envPos.config && envPos.config.journal_id && envPos.config.journal_id[1]) || null,
                },
                currency: {
                    id: currencyId || 0,
                    name: currencyName,                 // ← clave para tu GAS
                    symbol: currencySymbol || "",
                    position: currencyPosition || "before",
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
                    address: {
                        country: company.country_id && company.country_id[1] ? company.country_id[1] : null,
                        state:   company.state_id && company.state_id[1] ? company.state_id[1] : null,
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
                        country: customer.country_id && customer.country_id[1] ? customer.country_id[1] : null,
                        state:   customer.state_id && customer.state_id[1] ? customer.state_id[1] : null,
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

        const ui = {
            orderName,
            clientName,
            journalName,
            invoiceDateStr,
            invoiceDateDueStr,
            stateLabel,
            base,
            taxes,
            total,
            currencySymbol: currencySymbol || "",
            currencyName: currencyName || "",
        };

        // Resumen final de diagnóstico
        console.groupCollapsed?.("[Clocky POS] buildPosPayload() → Resumen");
        dlog("Currency resuelta:", payload.invoice.currency);
        dlog("Journal:", payload.invoice.journal);
        dlog("Company (mini):", { id: payload.invoice.company.id, name: payload.invoice.company.name, vat: payload.invoice.company.vat });
        dlog("Customer (mini):", { id: payload.invoice.customer.id, name: payload.invoice.customer.name, vat: payload.invoice.customer.vat });
        dlog("Amounts:", payload.invoice.amounts);
        dlog("Lines count:", payload.invoice.lines.length);
        console.groupEnd?.();

        console.groupEnd?.(); // cierre diagnóstico inicial

        return { payload, ui };
    } catch (e) {
        derror("[Clocky POS] EXCEPCIÓN en buildPosPayload:", e);
        return null;
    }
}
