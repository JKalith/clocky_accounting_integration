# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = "pos.order"

    def _create_invoice(self):
        """
        Extiende la creación de factura del POS para enviar la factura
        al servicio de facturación electrónica usando el módulo Clocky.
        """
        res = super()._create_invoice()

        for order in self:
            move = order.account_move
            # Solo si hay factura y está contabilizada
            if move and move.move_type == "out_invoice" and move.state == "posted":
                # Llamamos al nuevo método en account.move
                move.clocky_send_fe_from_pos()

        return res
