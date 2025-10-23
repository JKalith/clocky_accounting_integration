# -*- coding: utf-8 -*-
"""
Title: Account Move Line - CABYS Field Extension
Description:
    This file extends the 'account.move.line' model to include a computed field
    for displaying the CABYS (Código de Actividades Económicas y Bienes y Servicios)
    code associated with each invoice line.

    The CABYS code is a classification system used in Costa Rica to standardize
    product and service descriptions for electronic invoicing (Facturación Electrónica).
    This field is dynamically computed from the product or its template.

Methods:
    - _compute_cabys():
        Computes the CABYS code for each invoice line by checking various potential
        CABYS-related fields in the associated product and its template.
        The first valid match found among the candidate field names is used.
"""

from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    # Campo calculado para mostrar el código CABYS del producto
    cabys = fields.Char(string="CABYS", compute="_compute_cabys", store=False)

    @api.depends('product_id', 'product_id.product_tmpl_id')
    def _compute_cabys(self):
        """
        Attempts to retrieve the CABYS code from the product or its template.

        The method loops through a list of possible field names that might
        store the CABYS code, depending on the module or customization used
        in the database. Once a valid code is found, it is assigned to the line.

        If no CABYS code is found, the field remains empty.

        Logic:
            1. Define a list of candidate field names.
            2. Iterate through invoice lines.
            3. Check if any of the candidate fields exist and contain a value.
            4. Assign the first valid CABYS code found.
        """
        candidates = [
            'cabys', 'cabys_code', 'l10n_cr_cabys', 'l10n_cr_cabys_code',
            'x_cabys', 'x_cabys_code'
        ]
        for line in self:
            code = ""
            prod = line.product_id
            tmpl = prod.product_tmpl_id
            for name in candidates:
                if hasattr(prod, name) and getattr(prod, name):
                    code = getattr(prod, name)
                    break
                if hasattr(tmpl, name) and getattr(tmpl, name):
                    code = getattr(tmpl, name)
                    break
            line.cabys = code or ""
