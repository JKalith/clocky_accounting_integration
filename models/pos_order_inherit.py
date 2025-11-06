# -*- coding: utf-8 -*-
from odoo import models, _
from odoo.exceptions import UserError


class PosOrder(models.Model):
    """
    Extensión del modelo pos.order para:
      - Enviar automáticamente la factura a GAS cuando se crea y contabiliza
        desde el POS (_create_invoice).
      - Exponer un método clocky_pos_send_fe() para ser llamado desde el POS
        (botón de prueba), que localiza la factura relacionada y reutiliza
        la lógica de clocky_send_fe_from_pos() definida en account.move.
    """
    _inherit = "pos.order"

    def _create_invoice(self, move_vals):
        """
        Extiende la creación de factura del POS para enviar la factura
        al servicio de facturación electrónica (GAS) usando la lógica
        existente en account.move.clocky_send_fe_from_pos().
        """
        move = super()._create_invoice(move_vals)

        # Si se generó una factura de cliente y está publicada, la enviamos a GAS
        if move and move.move_type == "out_invoice" and move.state == "posted":
            move.clocky_send_fe_from_pos()

        return move

    def clocky_pos_send_fe(self):
        """
        Método para ser llamado vía RPC desde el POS (botón de prueba):
          - Toma el/los pos.order sobre los que se llama.
          - Verifica que tengan una factura contable asociada (account_move).
          - Verifica que la factura esté en estado 'posted'.
          - Llama a account.move.clocky_send_fe_from_pos() para enviar a GAS.
        """
        for order in self:
            if not order.account_move:
                # No hay factura contable aún asociada a este pedido POS
                raise UserError(
                    _(
                        "Este pedido de POS no tiene factura contable asociada. "
                        "Asegúrese de que el pedido esté configurado para generar factura "
                        "y haya sido sincronizado con el servidor."
                    )
                )

            move = order.account_move
            if move.state != "posted":
                # La factura existe, pero no está contabilizada/publicada
                raise UserError(
                    _(
                        "La factura asociada al pedido POS aún no está contabilizada. "
                        "Estado actual: %s"
                    )
                    % move.state
                )

            # Reutiliza la lógica ya implementada en tu módulo de Accounting
            move.clocky_send_fe_from_pos()

        return True
