# -*- coding: utf-8 -*-
{
    "name": "POS Calculator Basic",
    "summary": "Calculadora básica para Punto de Venta (sumar, restar, multiplicar)",
    "version": "17.0.1.0.0",
    "category": "Point of Sale",
    "author": "Tu Nombre",
    "license": "LGPL-3",
    "depends": ["point_of_sale", "account"],
    "data": [
        "security/ir.model.access.csv",
        "views/calculator_views.xml",
        "views/account_move_inherit.xml",
    ],
    "installable": True,
    "application": False,
}
