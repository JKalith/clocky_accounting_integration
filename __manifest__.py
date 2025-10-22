# -*- coding: utf-8 -*-
{
    "name": "Clocky Sales Integration (Backend Only)",
    "summary": "Base limpio para integrar Ventas sin Website ni assets",
    "version": "17.0.1.0.0",
    "author": "Clocky",
    "license": "LGPL-3",
    "category": "Sales",
    "depends": ["sale"],  # sin website, sin portal, sin web.assets
    "data": [
        "security/ir.model.access.csv",
        "views/sale_views.xml",
    ],
    "application": False,
    "installable": True,
}
