/** @odoo-module **/

import { patch } from "@web/core/utils/patch";

import { Partner } from "@point_of_sale/app/store/models";

/**
 * Parcheamos el modelo Partner del POS para:
 *  - Incluir el campo 'codigo_actividad_receptor'
 *    en los datos que se cargan desde el backend
 */
patch(Partner, "clocky_accounting_integration.PartnerActivity", {
    /**
     * exportFields: lista de campos que el POS pide a res.partner
     * desde el backend.
     */
    exportFields(...args) {
        const fields = super.exportFields(...args);
        if (!fields.includes("codigo_actividad_receptor")) {
            fields.push("codigo_actividad_receptor");
        }
        return fields;
    },
});
