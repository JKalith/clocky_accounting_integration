# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = "pos.order"

    def _create_invoice(self, move_vals):
        """
        Extiende la creación de factura del POS para enviar la factura
        al servicio de facturación electrónica (GAS) usando el módulo Clocky.
        """
        # Llamamos al método original de Odoo,
        # que devuelve el account.move creado
        move = super()._create_invoice(move_vals)

        # Por seguridad, self.ensure_one() ya se hace en el método original,
        # así que aquí self es solo un pedido.
        if move and move.move_type == "out_invoice" and move.state == "posted":
            # Llamamos a nuestro método en account.move
            move.clocky_send_fe_from_pos()

        # Devolvemos la factura como hace el método original
        return move
