# -*- coding: utf-8 -*-
"""
Title: Invoice Preview Wizard (POST + Post)
Description:
    Extiende el wizard de vista previa para:
      1) Construir un payload JSON con datos de la factura (cabecera y líneas con CABYS)
      2) Enviarlo vía HTTP POST a una URL configurable en Parametros del sistema
      3) (Opcional) Registrar el resultado en el chatter de la factura
      4) Contabilizar la factura

Methods:
    - default_get(fields_list): arma la vista previa (como ya tienes)
    - _build_post_payload(): construye el JSON con cabecera y líneas
    - _http_post(url, payload, headers): envía POST con urllib (sin dependencias externas)
    - action_post_invoice(): envía el POST y luego contabiliza la factura
"""

import json
import ssl
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountInvoicePreviewWizard(models.TransientModel):
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

        # Líneas en HTML (incluye CABYS)
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

    # ---------- NUEVO: helpers para POST ----------
    def _build_post_payload(self, move):
        """Prepara el payload JSON con cabecera + líneas (incl. CABYS)."""
        self.ensure_one()
        currency = move.currency_id
        payload = {
            "invoice": {
                "id": move.id,
                "name": move.name or move.payment_reference or "Borrador",
                "partner": {
                    "id": move.partner_id.id,
                    "name": move.partner_id.display_name or "",
                    "vat": move.partner_id.vat or "",
                },
                "journal": {
                    "id": move.journal_id.id,
                    "name": move.journal_id.display_name or "",
                    "code": move.journal_id.code or "",
                },
                "currency": {
                    "id": currency.id if currency else False,
                    "name": currency.name if currency else "",
                    "symbol": currency.symbol if currency else "",
                    "position": currency.position if currency else "",
                },
                "dates": {
                    "invoice_date": str(move.invoice_date) if move.invoice_date else None,
                    "invoice_date_due": str(move.invoice_date_due) if move.invoice_date_due else None,
                },
                "state": move.state,
                "amounts": {
                    "untaxed": float(move.amount_untaxed or 0.0),
                    "tax": float(move.amount_tax or 0.0),
                    "total": float(move.amount_total or 0.0),
                },
                "lines": [],
            }
        }
        for line in move.invoice_line_ids:
            payload["invoice"]["lines"].append({
                "id": line.id,
                "product": {
                    "id": line.product_id.id or False,
                    "name": line.product_id.display_name or (line.name or ""),
                    "default_code": line.product_id.default_code or "",
                },
                "description": line.name or "",
                "quantity": float(line.quantity or 0.0),
                "price_unit": float(line.price_unit or 0.0),
                "discount": float(line.discount or 0.0),
                "taxes": [t.name for t in line.tax_ids] if line.tax_ids else [],
                "cabys": line.cabys or "",
                "subtotal": float(line.price_subtotal or 0.0),
                "total": float(line.price_total or 0.0),
            })
        return payload

    def _http_post(self, url, payload, headers=None, timeout=25):
        """Envía POST con urllib (sin dependencias externas)."""
        headers = headers or {}
        headers.setdefault("Content-Type", "application/json")
        data = json.dumps(payload).encode("utf-8")

        # Contexto SSL por defecto (respeta certificados del sistema)
        context = ssl.create_default_context()
        req = Request(url, data=data, headers=headers, method="POST")

        with urlopen(req, context=context, timeout=timeout) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8", errors="replace")
        return status, body
    # ---------- FIN helpers POST ----------

    def action_post_invoice(self):
        """
        Envía POST con los datos de la factura y luego contabiliza.
        - Usa parámetros del sistema para URL y token:
            clocky.facturar_post_url
            clocky.facturar_post_token   (opcional, se envía como Bearer)
            clocky.facturar_block_on_fail (opcional: '1' para bloquear si falla)
        """
        self.ensure_one()
        move = self.move_id

        # 1) Parametrización
        icp = self.env["ir.config_parameter"].sudo()
        url = icp.get_param("clocky.facturar_post_url") or ""
        token = icp.get_param("clocky.facturar_post_token") or ""
        block_on_fail = (icp.get_param("clocky.facturar_block_on_fail") or "").strip() in ("1", "true", "True", "TRUE")

        # 2) Si hay URL, construimos y enviamos POST
        post_status = None
        post_body = None
        post_error = None
        if url:
            try:
                payload = self._build_post_payload(move)
                headers = {}
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                post_status, post_body = self._http_post(url, payload, headers=headers)
                # Log al chatter de la factura
                move.message_post(
                    body=_("POST enviado a <b>%s</b> (status <code>%s</code>)<br/><pre style='white-space:pre-wrap;'>%s</pre>") %
                         (url, post_status, (post_body[:2000] if post_body else "")),
                    subtype_xmlid="mail.mt_note",
                )
            except (HTTPError, URLError, Exception) as e:
                post_error = str(e)
                move.message_post(
                    body=_("Error al enviar POST a <b>%s</b>:<br/><pre style='white-space:pre-wrap;'>%s</pre>") %
                         (url, post_error[:2000]),
                    subtype_xmlid="mail.mt_note",
                )
                if block_on_fail:
                    # Si está parametrizado, bloqueamos la contabilización
                    raise UserError(_("No fue posible notificar vía POST. Se ha bloqueado la contabilización.\n\nDetalle: %s") % post_error)

        # 3) Contabilizar factura
        if move.state != "draft":
            raise UserError(_("La factura no está en borrador."))
        move.action_post()

        # 4) Reabrir la factura
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
        """Abre el wizard de vista previa para la factura actual."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "res_model": "account.invoice.preview.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"active_id": self.id},
        }
