# -*- coding: utf-8 -*-
from odoo import api, fields, models

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    cabys = fields.Char(string="CABYS", compute="_compute_cabys", store=False)

    @api.depends('product_id', 'product_id.product_tmpl_id')
    def _compute_cabys(self):
        """
        Intenta leer el CABYS desde el producto o su plantilla.
        Ajusta la lista de campos candidatos a los que use tu base.
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
