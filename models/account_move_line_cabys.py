# -*- coding: utf-8 -*-
from odoo import models, fields

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    # Solo mostramos el CABYS existente (no lo creamos)
    cabys = fields.Char(related="product_id.product_tmpl_id.x_studio_cabys", store=True, readonly=True)
