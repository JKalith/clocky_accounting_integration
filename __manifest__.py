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
        "views/calculator_views.xml",      # vista del wizard
        "views/account_move_inherit.xml",  # botón en el header de facturas
    ],
    "installable": True,
    "application": False,
}
