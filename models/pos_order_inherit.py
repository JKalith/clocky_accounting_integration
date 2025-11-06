from odoo import models

class PosOrder(models.Model):
    _inherit = "pos.order"

    def _create_invoice(self, move_vals):
        res = super()._create_invoice(move_vals)
        for order in self:
            move = order.account_move
            if move and move.move_type == "out_invoice" and move.state == "posted":
                move.clocky_send_fe_from_pos()
        return res
