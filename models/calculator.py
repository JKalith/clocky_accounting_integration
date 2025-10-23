# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import UserError

class AccountingCalculatorWizard(models.TransientModel):
    """
    Wizard simple: ingresa dos números y realiza suma, resta o multiplicación.
    """
    _name = "accounting.calculator.wizard"
    _description = "Accounting - Calculadora básica"

    number_a = fields.Float(string="Número A", required=True, default=0.0)
    number_b = fields.Float(string="Número B", required=True, default=0.0)
    operation = fields.Selection(
        [("add", "Sumar"), ("sub", "Restar"), ("mul", "Multiplicar")],
        string="Operación",
        required=True,
        default="add",
    )
    result = fields.Float(string="Resultado", readonly=True)

    @api.onchange("number_a", "number_b", "operation")
    def _onchange_preview(self):
        for rec in self:
            rec.result = rec._compute(rec.number_a, rec.number_b, rec.operation)

    def action_compute(self):
        for rec in self:
            rec.result = rec._compute(rec.number_a, rec.number_b, rec.operation)
        return {
            "type": "ir.actions.act_window",
            "res_model": self._name,
            "view_mode": "form",
            "res_id": self.id,
            "target": "new",
        }

    @staticmethod
    def _compute(a, b, op):
        if op == "add":
            return a + b
        if op == "sub":
            return a - b
        if op == "mul":
            return a * b
        raise UserError("Operación no soportada.")


class AccountMove(models.Model):
    """
    Método llamado por el botón del header.
    Devuelve la acción para abrir el wizard en modal.
    """
    _inherit = "account.move"

    def action_open_accounting_calculator(self):
        return {
            "type": "ir.actions.act_window",
            "res_model": "accounting.calculator.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {},
        }
