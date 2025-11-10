# -*- coding: utf-8 -*-

from odoo import models

class PosSession(models.Model):
    _inherit = "pos.session"

    def _loader_params_res_partner(self):
        """
        Añadimos 'codigo_actividad_receptor' a los campos que
        el POS carga del modelo res.partner.
        """
        params = super()._loader_params_res_partner()
        fields = params["search_params"]["fields"]
        if "codigo_actividad_receptor" not in fields:
            fields.append("codigo_actividad_receptor")
        return params
