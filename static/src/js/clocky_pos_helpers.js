/** @odoo-module **/

/**
 * Obtiene un posible código CABYS desde el producto,
 * probando varios nombres de campo comunes en localizaciones CR.
 */
export function getCabysFromProduct(product) {
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
