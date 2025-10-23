# -*- coding: utf-8 -*-
"""
Title: Invoice Preview Wizard (POST + Post)
Description:
    Extiende el wizard de vista previa para:
      1) Construir un payload JSON con datos de la factura (cabecera y líneas con CABYS)
      2) Enviarlo vía HTTP POST a una URL configurable en Parámetros del sistema
      3) (Opcional) Registrar el resultado en el chatter de la factura
      4) Contabilizar la factura

Params del sistema (recomendado):
    - clocky.facturar_post_url
    - clocky.facturar_post_token        (opcional, se envía como Bearer)
    - clocky.facturar_block_on_fail     (opcional: '1'/'true' para bloquear si falla)
"""

import json
import ssl
import traceback
from datetime import date, datetime
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
            cabys = getattr(l, "cabys", "") or ""
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

    # ---------- helpers para POST ----------

    def _get_any(self, rec, names):
        """Devuelve el primer atributo válido de 'rec' en 'names'.
        Si es many2one retorna .name; si es simple, retorna su valor."""
        for n in names:
            if hasattr(rec, n):
                val = getattr(rec, n)
                if not val:
                    continue
                try:
                    # Si es registro (many2one), devolver su nombre
                    if hasattr(val, "name"):
                        return val.name or ""
                except Exception:
                    pass
                return val
        return ""

    def _cr_address_dict(self, partner):
        """Arma el bloque de dirección CR (provincia, cantón, distrito, barrio)."""
        country = partner.country_id.code or partner.country_id.name or "CR"

        province = self._get_any(partner, [
            "l10n_cr_province_id", "x_province_id", "x_province", "province_id", "state_id", "l10n_cr_province"
        ])
        canton = self._get_any(partner, [
            "l10n_cr_canton_id", "x_canton_id", "x_canton", "l10n_cr_canton"
        ])
        district = self._get_any(partner, [
            "l10n_cr_district_id", "x_district_id", "x_district", "l10n_cr_district"
        ])
        neighborhood = self._get_any(partner, [
            "l10n_cr_neighborhood_id", "x_neighborhood_id", "x_neighborhood", "l10n_cr_neighborhood", "barrio"
        ])

        other = " ".join(filter(None, [
            partner.street or "", partner.street2 or "", partner.city or "", partner.zip or ""
        ])).strip()

        return {
            "country": country or "CR",
            "province": province or None,
            "canton": canton or None,
            "district": district or None,
            "neighborhood": neighborhood or None,
            "other": other,
        }

    def _payment_info(self, move):
        """Condición, días y métodos de pago (robusto a distintos nombres de campo)."""
        cond = move.invoice_payment_term_id.name if move.invoice_payment_term_id else None

        term_days = None

        # a) Intentar con diferencia de fechas (si existen y son date/datetime)
        inv_date = move.invoice_date
        due_date = move.invoice_date_due
        try:
            if isinstance(inv_date, datetime):
                inv_date = inv_date.date()
            if isinstance(due_date, datetime):
                due_date = due_date.date()
            if isinstance(inv_date, date) and isinstance(due_date, date):
                term_days = (due_date - inv_date).days
        except Exception:
            term_days = None

        # b) Si no hay fechas, usar líneas del término de pago (days/nb_days/delay)
        if term_days is None and move.invoice_payment_term_id and move.invoice_payment_term_id.line_ids:
            line_days = []
            for line in move.invoice_payment_term_id.line_ids:
                for fname in ("days", "nb_days", "delay"):
                    if hasattr(line, fname):
                        val = getattr(line, fname)
                        if isinstance(val, (int, float)):
                            line_days.append(int(val))
                            break
            term_days = max(line_days) if line_days else None

        # Métodos de pago (si el campo existe)
        methods = []
        if hasattr(move, "payment_method_line_id") and move.payment_method_line_id:
            methods = [move.payment_method_line_id.name]

        return {"condition": cond, "term_days": term_days, "methods": methods}

    def _uom_info(self, line):
        """Nombre y código UoM. Intenta campos habituales de localización CR si existen."""
        uom = line.product_uom_id
        name = uom.name if uom else None
        code = None
        for fname in ["l10n_cr_unit_code", "code", "uom_code", "x_uom_code"]:
            if uom and hasattr(uom, fname):
                val = getattr(uom, fname)
                if val:
                    code = val
                    break
        return {"uom_name": name, "uom_code": code}

    def _build_post_payload(self, move):
        """Payload JSON con cabecera, dirección CR, términos de pago, líneas con CABYS, taxes y UoM."""
        self.ensure_one()
        currency = move.currency_id
        company_partner = move.company_id.partner_id
        customer = move.partner_id

        payload = {
            "invoice": {
                "id": move.id,
                "move_type": move.move_type,  # p.ej. out_invoice
                "name": move.name or move.payment_reference or "/",
                "state": move.state,
                "journal": {
                    "id": move.journal_id.id,
                    "name": move.journal_id.display_name or "",
                    "code": move.journal_id.code or "",
                },
                "currency": {
                    "id": currency.id if currency else 0,
                    "name": currency.name if currency else "",
                    "symbol": currency.symbol if currency else "",
                    "position": currency.position if currency else "before",
                },
                "dates": {
                    "invoice_date": str(move.invoice_date) if move.invoice_date else None,
                    "invoice_date_due": str(move.invoice_date_due) if move.invoice_date_due else None,
                },
                "company": {
                    "id": move.company_id.id,
                    "name": move.company_id.name or (company_partner.display_name or ""),
                    "vat": company_partner.vat or "",
                    "email": company_partner.email or None,
                    "phone": company_partner.phone or company_partner.mobile or None,
                    "address": self._cr_address_dict(company_partner),
                },
                "partner": {
                    "id": customer.id,
                    "name": customer.display_name or "",
                    "vat": customer.vat or "",
                    "email": customer.email or None,
                    "phone": customer.phone or customer.mobile or None,
                    "address": self._cr_address_dict(customer),
                },
                "amounts": {
                    "untaxed": float(move.amount_untaxed or 0.0),
                    "tax": float(move.amount_tax or 0.0),
                    "total": float(move.amount_total or 0.0),
                },
                "payment": self._payment_info(move),
                "lines": [],
                "meta": {"source": "odoo", "version": "1.0"},
            }
        }

        for line in move.invoice_line_ids:
            uom = self._uom_info(line)
            taxes_display = [t.name for t in line.tax_ids] if line.tax_ids else []
            taxes_ids = [t.id for t in line.tax_ids] if line.tax_ids else []

            payload["invoice"]["lines"].append({
                "id": line.id,
                "product": {
                    "id": line.product_id.id or 0,
                    "name": line.product_id.display_name or (line.name or ""),
                    "default_code": line.product_id.default_code or None,
                },
                "description": line.name or "",
                "quantity": float(line.quantity or 0.0),
                "uom_name": uom["uom_name"],
                "uom_code": uom["uom_code"],
                "price_unit": float(line.price_unit or 0.0),
                "discount": float(line.discount or 0.0),
                "cabys": getattr(line, "cabys", None) or None,
                "taxes_display": taxes_display,
                "taxes_ids": taxes_ids,
                "subtotal": float(line.price_subtotal or 0.0),
                "total": float(line.price_total or 0.0),
            })

        return payload

    def _http_post(self, url, payload, headers=None, timeout=25):
        """Envía POST con urllib (sin dependencias externas)."""
        headers = headers or {}
        headers.setdefault("Content-Type", "application/json")
        data = json.dumps(payload).encode("utf-8")

        context = ssl.create_default_context()  # respeta certificados del sistema
        req = Request(url, data=data, headers=headers, method="POST")

        with urlopen(req, context=context, timeout=timeout) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8", errors="replace")
        return status, body

    def action_post_invoice(self):
        """
        Envía POST con los datos de la factura y luego contabiliza.
        Lee parámetros del sistema cuando existan y permite bloquear la contabilización si el POST falla.
        """
        self.ensure_one()
        move = self.move_id

        # 1) Parametrización
        icp = self.env["ir.config_parameter"].sudo()
        # Usa param del sistema con fallback a webhook de pruebas:
        url = (icp.get_param("clocky.facturar_post_url") or "").strip()
        if not url:
            url = "https://webhook.site/c7f3f0a4-f206-47b9-9595-b7cfc58828f4"  # TEST fallback

        token = (icp.get_param("clocky.facturar_post_token") or "").strip()
        block_on_fail = (icp.get_param("clocky.facturar_block_on_fail") or "").strip() in ("1", "true", "True", "TRUE")

        # 2) Construir y enviar POST (si hay URL)
        post_status = None
        post_body = None
        post_error = None
        if url:
            try:
                try:
                    payload = self._build_post_payload(move)
                except Exception:
                    tb = traceback.format_exc()
                    raise UserError(_("Fallo construyendo el payload de la factura:\n%s") % tb)

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
                    raise UserError(_("No fue posible notificar vía POST. Se ha bloqueado la contabilización.\n\nDetalle: %s") % post_error)

        # 3) Contabilizar factura
        if move.state != "draft":
            raise UserError(_("La factura no está en borrador."))
        move.action_post()

        # 4) Reabrir la factura ya contabilizada
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
