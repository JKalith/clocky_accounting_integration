# -*- coding: utf-8 -*-
from odoo import models, fields

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    cabys = fields.Char(
        string="CABYS",
        related="product_id.x_studio_cabys",
        store=True,
        readonly=True,
    )
