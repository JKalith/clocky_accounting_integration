# models/pos_session.py

from odoo import models

class PosSession(models.Model):
    _inherit = "pos.session"

    def _loader_params_res_partner(self):
        params = super()._loader_params_res_partner()
        fields = params["search_params"]["fields"]
        if "codigo_actividad_receptor" not in fields:
            fields.append("codigo_actividad_receptor")
        return params
