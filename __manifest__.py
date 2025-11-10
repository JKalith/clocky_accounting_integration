# -*- coding: utf-8 -*-
{
    "name": "Factura electrónica para clientes de Costa Rica",
    "summary": "Módulo para Facturación Electrónica en Costa Rica con soporte CABYS",
    "version": "17.0.1.0.0",
    "category": "Accounting/Accounting",
    "author": "James / Clocky",
    "license": "LGPL-3",
    "depends": [
        "account",
        "product",
        "point_of_sale",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/facturar_views.xml",
        "views/account_move_inherit.xml",
        "views/account_invoice_cabys_view.xml",
         "views/res_partner_views.xml",
    ],
    "assets": {
        # Archivos JavaScript cargados en los assets del Punto de Venta (POS)
        "point_of_sale._assets_pos": [
            "clocky_accounting_integration/static/src/js/clocky_pos_helpers.js",
            "clocky_accounting_integration/static/src/js/clocky_pos_payload.js",
            "clocky_accounting_integration/static/src/js/clocky_pos_gas_service.js",
            "clocky_accounting_integration/static/src/js/clocky_pos_payment_patch.js",
       
        ],
    },
    "installable": True,
    "application": False,
}
