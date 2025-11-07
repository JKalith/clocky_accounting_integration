# -*- coding: utf-8 -*-

import json
import traceback
import urllib.request
import urllib.error

from odoo import api, models


class ClockyPosIntegration(models.Model):
    _name = "clocky.pos.integration"
    _description = "Integración POS -> GAS (Clocky)"

    @api.model
    def clocky_pos_post_to_gas(self, payload):
        """
        Recibe el payload de la venta de POS (desde JS) y
        lo envía por HTTP POST al Web App de Google Apps Script (GAS).

        Retorna un dict tipo:
        {
            "ok": True/False,
            "status": <código HTTP o None>,
            "response": <JSON parseado o texto crudo>,
            "error": <mensaje en caso de fallo>
        }
        """

        # 1) Leer parámetros del sistema para la URL y el token
        icp = self.env["ir.config_parameter"].sudo()

        # Puedes configurar clocky.pos_post_url específicamente para POS,
        # o reusar clocky.facturar_post_url si ya lo tienes configurado.
        url = (
            (icp.get_param("clocky.pos_post_url") or "")
            or (icp.get_param("clocky.facturar_post_url") or "")
        ).strip()

        token = (
            (icp.get_param("clocky.pos_post_token") or "")
            or (icp.get_param("clocky.facturar_post_token") or "")
        ).strip()

        if not url:
            return {
                "ok": False,
                "status": None,
                "response": None,
                "error": (
                    "No hay URL configurada en 'clocky.pos_post_url' "
                    "ni en 'clocky.facturar_post_url'."
                ),
            }

        # 2) Serializar el payload a JSON
        try:
            data = json.dumps(payload).encode("utf-8")
        except Exception as e:
            return {
                "ok": False,
                "status": None,
                "response": None,
                "error": "Error serializando payload a JSON en servidor: %s" % e,
            }

        # 3) Construir headers y request hacia GAS
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(
            url,
            data=data,
            headers=headers,
            method="POST",
        )

        # 4) Hacer la llamada HTTP
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.getcode()
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as he:
            return {
                "ok": False,
                "status": getattr(he, "code", None),
                "response": None,
                "error": "HTTPError hacia GAS: %s" % he,
            }
        except urllib.error.URLError as ue:
            return {
                "ok": False,
                "status": None,
                "response": None,
                "error": "URLError hacia GAS: %s" % ue,
            }
        except Exception as e:
            tb = traceback.format_exc()
            return {
                "ok": False,
                "status": None,
                "response": None,
                "error": "Error general hacia GAS: %s\n%s" % (e, tb),
            }

        # 5) Intentar parsear la respuesta como JSON
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}

        return {
            "ok": True,
            "status": status,
            "response": parsed,
            "error": None,
        }
