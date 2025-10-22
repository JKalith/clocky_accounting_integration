# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError

class ClockySaleLog(models.Model):
    _name = "clocky.sale.log"
    _description = "Clocky - Bitácora de integración de ventas"
    _order = "create_date desc"

    order_id = fields.Many2one("sale.order", string="Pedido", index=True, ondelete="cascade", required=True)
    message = fields.Char("Mensaje", required=True)
    payload = fields.Text("Payload")
    level = fields.Selection([
        ("info", "Info"),
        ("warning", "Warning"),
        ("error", "Error"),
    ], default="info", required=True)
    create_date = fields.Datetime("Fecha", readonly=True)

class SaleOrder(models.Model):
    _inherit = "sale.order"

    external_ref = fields.Char("Referencia externa")
    integration_state = fields.Selection([
        ("new", "Nuevo"),
        ("sent", "Enviado"),
        ("processed", "Procesado"),
        ("error", "Error"),
    ], default="new", string="Estado integración", tracking=True)
    integration_notes = fields.Text("Notas integración")
    clocky_log_count = fields.Integer(compute="_compute_clocky_log_count", string="Logs integración")

    def _compute_clocky_log_count(self):
        logs = self.env["clocky.sale.log"].read_group(
            [("order_id", "in", self.ids)], ["order_id"], ["order_id"]
        )
        mapped = {l["order_id"][0]: l["order_id_count"] for l in logs}
        for so in self:
            so.clocky_log_count = mapped.get(so.id, 0)

    def action_view_clocky_logs(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Logs de integración"),
            "res_model": "clocky.sale.log",
            "view_mode": "tree,form",
            "domain": [("order_id", "=", self.id)],
            "context": {"default_order_id": self.id},
        }

    def action_integration_simulate_send(self):
        """
        Acción de ejemplo SIN dependencias externas:
        - Valida datos mínimos
        - "Simula" envío/persistencia
        - Escribe log
        Puedes sustituir el contenido por tu lógica real.
        """
        for so in self:
            if not so.partner_id:
                raise UserError(_("El pedido no tiene un cliente asignado."))
            # Simulación de construcción de payload
            payload = {
                "order": so.name,
                "external_ref": so.external_ref,
                "partner_id": so.partner_id.id,
                "amount_total": so.amount_total,
                "lines": [
                    {
                        "product_id": l.product_id.id,
                        "name": l.name,
                        "qty": l.product_uom_qty,
                        "price_unit": l.price_unit,
                        "taxes": [t.id for t in l.tax_id],
                    }
                    for l in so.order_line
                ],
            }
            # "Proceso" de envío - aquí iría tu integración real
            # Ej: requests.post(...)  -> OJO: si algún día usas requests, sigue sin tocar website.
            # En este base, solo marcamos como enviado y registramos el payload.
            so.integration_state = "sent"
            self.env["clocky.sale.log"].create({
                "order_id": so.id,
                "level": "info",
                "message": "Payload generado y marcado como enviado (simulado).",
                "payload": str(payload),
            })
        return True
