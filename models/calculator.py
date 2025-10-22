# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import UserError

class PosCalculatorWizard(models.TransientModel):
    """
    Un wizard simple que no persiste datos a largo plazo.
    Permite ingresar dos números y operar: suma, resta o multiplicación.
    """
    _name = "pos.calculator.wizard"
    _description = "POS - Calculadora básica"

    number_a = fields.Float(string="Número A", required=True, default=0.0)
    number_b = fields.Float(string="Número B", required=True, default=0.0)
    operation = fields.Selection(
        selection=[
            ("add", "Sumar"),
            ("sub", "Restar"),
            ("mul", "Multiplicar"),
        ],
        string="Operación",
        required=True,
        default="add",
    )
    result = fields.Float(string="Resultado", readonly=True)

    @api.onchange("number_a", "number_b", "operation")
    def _onchange_compute_preview(self):
        """Calcula en vivo para mostrar un preview del resultado."""
        for rec in self:
            rec.result = rec._compute_result(rec.number_a, rec.number_b, rec.operation)

    def action_compute(self):
        """
        Botón principal 'Calcular'.
        Valida división por cero si se agregara en futuro (no incluida) y
        asigna el resultado final en el campo 'result'.
        """
        for rec in self:
            rec.result = rec._compute_result(rec.number_a, rec.number_b, rec.operation)
        # Mantener el wizard abierto mostrando el resultado
        return {
            "type": "ir.actions.act_window",
            "res_model": self._name,
            "view_mode": "form",
            "res_id": self.id,
            "target": "new",
        }

    def action_add(self):
        self.operation = "add"
        return self.action_compute()

    def action_sub(self):
        self.operation = "sub"
        return self.action_compute()

    def action_mul(self):
        self.operation = "mul"
        return self.action_compute()

    # ------- Helpers internos (solo Python nativo) -------
    @staticmethod
    def _compute_result(a, b, op):
        """Computa el resultado con operaciones básicas."""
        if op == "add":
            return a + b
        if op == "sub":
            return a - b
        if op == "mul":
            return a * b
        # Seguridad defensiva; no debería ocurrir
        raise UserError("Operación no soportada.")
