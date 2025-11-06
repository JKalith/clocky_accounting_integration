# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = "pos.order"

    def _create_invoice(self, move_vals):
        """
        Extiende la creación de factura del POS para enviar la factura
        al servicio de facturación electrónica usando el módulo Clocky.

        NO modifica la lógica del POS:
        - Primero deja que Odoo cree la factura normalmente.
        - Luego, si la factura existe y está 'posted',
          llama a clocky_send_fe_from_pos() para hacer el POST a GAS.
        """
        # 1) Flujo original de Odoo: crear la factura
        res = super()._create_invoice(move_vals)

        # 2) Por cada pedido de POS, tomar su factura y enviarla a GAS
        for order in self:
            move = order.account_move
            if move and move.move_type == "out_invoice" and move.state == "posted":
                move.clocky_send_fe_from_pos()

        return res
