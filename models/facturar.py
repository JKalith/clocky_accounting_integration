# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError

class AccountInvoicePreviewWizard(models.TransientModel):
    """
    Wizard que muestra los datos clave de la factura y permite contabilizarla.
    """
    _name = "account.invoice.preview.wizard"
    _description = "Vista previa de factura (Facturar)"

    move_id = fields.Many2one("account.move", string="Factura", required=True, readonly=True)
    name = fields.Char(string="Consecutivo", readonly=True)
    partner_name = fields.Char(string="Cliente", readonly=True)
    journal_name = fields.Char(string="Diario", readonly=True)
    currency = fields.Char(string="Moneda", readonly=True)
    invoice_date = fields.Date(string="Fecha de factura", readonly=True)
    invoice_date_due = fields.Date(string="Fecha de vencimiento", readonly=True)
    state = fields.Char(string="Estado", readonly=True)
    amount_untaxed = fields.Monetary(string="Base imponible", readonly=True, currency_field="currency_id")
    amount_tax = fields.Monetary(string="Impuestos", readonly=True, currency_field="currency_id")
    amount_total = fields.Monetary(string="Total", readonly=True, currency_field="currency_id")
    currency_id = fields.Many2one("res.currency", string="Divisa interna", readonly=True)
    lines_html = fields.Html(string="Líneas", readonly=True, sanitize=False)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        move = self.env["account.move"].browse(self.env.context.get("active_id"))
        if not move or move._name != "account.move":
            raise UserError(_("Abra una factura para usar 'Facturar'."))

        # Cabecera
        res.update({
            "move_id": move.id,
            "name": move.name or move.payment_reference or _("Borrador"),
            "partner_name": move.partner_id.display_name or "",
            "journal_name": move.journal_id.display_name or "",
            "currency": move.currency_id.name,
            "currency_id": move.currency_id.id,
            "invoice_date": move.invoice_date,
            "invoice_date_due": move.invoice_date_due,
            "state": move.state,
            "amount_untaxed": move.amount_untaxed,
            "amount_tax": move.amount_tax,
            "amount_total": move.amount_total,
        })

        # Utilidad: formateo monetario
        def fmt(amount):
            amount = amount or 0.0
            cur = move.currency_id
            if cur:
                if cur.position == 'before':
                    return f"{cur.symbol} {amount:,.2f}"
                return f"{amount:,.2f} {cur.symbol}"
            return f"{amount:,.2f}"

        # Líneas en HTML simple (con CABYS)
        rows = []
        for l in move.invoice_line_ids:
            pname = l.product_id.display_name or (l.name or "")
            taxes = ", ".join(t.name for t in l.tax_ids) or "-"
            cabys = l.cabys or ""
            qty = l.quantity or 0.0
            price_unit = l.price_unit or 0.0
            discount = l.discount or 0.0
            subtotal = l.price_subtotal or 0.0
            total = l.price_total or 0.0

            rows.append(
                f"<tr>"
                f"<td>{pname}</td>"
                f"<td style='text-align:right'>{qty:g}</td>"
                f"<td style='text-align:right'>{fmt(price_unit)}</td>"
                f"<td style='text-align:right'>{discount:g}%</td>"
                f"<td>{taxes}</td>"
                f"<td>{cabys}</td>"
                f"<td style='text-align:right'>{fmt(subtotal)}</td>"
                f"<td style='text-align:right'>{fmt(total)}</td>"
                f"</tr>"
            )

        table = (
            "<table class='table table-sm o_list_view' style='width:100%; border-collapse:collapse;'>"
            "<thead><tr>"
            "<th>Producto/Descripción</th>"
            "<th style='text-align:right'>Cantidad</th>"
            "<th style='text-align:right'>Precio</th>"
            "<th style='text-align:right'>Desc.</th>"
            "<th>Impuestos</th>"
            "<th>CABYS</th>"
            "<th style='text-align:right'>Subtotal</th>"
            "<th style='text-align:right'>Total</th>"
            "</tr></thead>"
            f"<tbody>{''.join(rows) if rows else '<tr><td colspan=\"8\">Sin líneas</td></tr>'}</tbody>"
            "</table>"
        )
        res["lines_html"] = table
        return res

    def action_post_invoice(self):
        """Contabiliza la factura y vuelve a abrir el formulario ya contabilizado."""
        self.ensure_one()
        move = self.move_id
        if move.state != "draft":
            raise UserError(_("La factura no está en borrador."))
        move.action_post()
        action = self.env["ir.actions.actions"]._for_xml_id("account.action_move_out_invoice_type")
        action.update({
            "view_mode": "form",
            "res_id": move.id,
            "target": "current",
        })
        return action


class AccountMove(models.Model):
    _inherit = "account.move"

    def action_open_invoice_preview(self):
        """Abre el wizard con los datos de la factura actual."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "res_model": "account.invoice.preview.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"active_id": self.id},
        }
