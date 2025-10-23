# -*- coding: utf-8 -*-
from odoo import models, fields

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    # Solo mostramos el CABYS existente (no lo creamos)
    cabys = fields.Char(
        string="CABYS",
        compute="_compute_cabys",
        store=True,
        readonly=True,
        help="Se lee del producto asociado (product o template) si existe."
    )

    def _compute_cabys(self):
        # Nombres probables del campo CABYS ya existente
        # (ajústalos si tu campo tiene otro nombre)
        candidate_names = ["cabys_code", "x_cabys_code", "x_studio_cabys", "cabys"]

        for line in self:
            value = False
            prod = line.product_id

            # 1) Intentar en product.product
            if prod:
                for name in candidate_names:
                    if name in prod._fields:
                        v = prod[name]
                        if v:
                            value = v
                            break

            # 2) Si no está en product.product, intentar en product.template
            if not value and prod and prod.product_tmpl_id:
                tmpl = prod.product_tmpl_id
                for name in candidate_names:
                    if name in tmpl._fields:
                        v = tmpl[name]
                        if v:
                            value = v
                            break

            line.cabys = value or False
