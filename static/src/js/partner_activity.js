/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Partner } from "@point_of_sale/app/models/partner";

/**
 * Parcheamos el modelo Partner del POS para:
 *  - Incluir el campo 'codigo_actividad_receptor' en los datos que se cargan desde el backend
 */
patch(Partner, "l10n_cr_pos_partner_activity.Partner", {
    /**
     * exportFields: lista de campos que el POS pide a res.partner desde el backend.
     */
    exportFields() {
        const fields = super.exportFields(...arguments);
        if (!fields.includes("codigo_actividad_receptor")) {
            fields.push("codigo_actividad_receptor");
        }
        return fields;
    },
});
