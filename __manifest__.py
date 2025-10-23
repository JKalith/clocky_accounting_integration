# -*- coding: utf-8 -*-
{
    "name": "Accounting Calculator (Header Button)",
    "summary": "Calculadora básica (sumar, restar, multiplicar) desde Facturas",
    "version": "17.0.1.0.0",
    "category": "Accounting/Accounting",
    "author": "James / Clocky",
    "license": "LGPL-3",
    "depends": ["account"],   # solo contabilidad
"data": [
    "security/ir.model.access.csv",
    "views/facturar_views.xml",
    "views/account_move_inherit.xml",
],


    "installable": True,
    "application": False,
}
