# clocky_accounting_integration/models/res_partner.py
from odoo import models, fields

class ResPartner(models.Model):
    _inherit = "res.partner"

    codigo_actividad_receptor = fields.Char(
        string="Código actividad receptor",
        help="Código de actividad económica del receptor para Hacienda (FE CR).",
    )
