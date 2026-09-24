#!/usr/bin/env python3
"""Offline check for the Home Concierge package.

Renders every Jinja template of `packages/home_concierge.yaml` against a
mocked Home Assistant state (every screen x several house states) and
validates the Telegram inline keyboards (label:data format, 64-byte
callback limit). Run: python3 home-assistant/tests/render_check.py
"""
import ast
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jinja2
import yaml

PKG = Path(__file__).resolve().parents[1] / "packages" / "home_concierge.yaml"
TZ = timezone(timedelta(hours=-3))
NOW = datetime(2026, 9, 24, 21, 5, tzinfo=TZ)


def make_env(states):
    env = jinja2.Environment(extensions=["jinja2.ext.loopcontrols"])

    def st(e):
        return states.get(e, {}).get("state", "unknown")

    def is_state(e, v):
        return st(e) in (v if isinstance(v, list) else [v])

    def state_attr(e, a):
        return states.get(e, {}).get("attrs", {}).get(a)

    def as_datetime(v):
        return datetime.fromisoformat(v) if isinstance(v, str) else v

    env.globals.update(states=st, is_state=is_state, state_attr=state_attr,
                       now=lambda: NOW, as_datetime=as_datetime)
    env.filters.update(as_local=lambda d: d.astimezone(TZ), is_state=is_state)
    env.tests.update(is_state=is_state)
    return env


def render(env, tpl, ctx):
    if not isinstance(tpl, str):
        return tpl
    out = env.from_string(tpl).render(**ctx)
    try:  # HA native types
        return ast.literal_eval(out)
    except (ValueError, SyntaxError):
        return out


def check_keyboard(rows, where):
    assert isinstance(rows, list) and rows, f"{where}: keyboard not a list: {rows!r}"
    for row in rows:
        for btn in row.split(","):
            parts = btn.strip().split(":")
            assert len(parts) == 2, f"{where}: bad button {btn!r}"
            label, data = parts
            assert label.strip() and data.startswith("/hc "), f"{where}: bad button {btn!r}"
            assert len(data.encode()) <= 64, f"{where}: callback too long {data!r}"


def scenarios():
    fim = (NOW + timedelta(hours=2, minutes=14)).isoformat()
    base = {
        "light.cozinha": {"state": "on", "attrs": {"brightness": 200}},
        "light.sala": {"state": "off", "attrs": {}},
        "media_player.laurinha": {"state": "playing", "attrs": {"media_title": "Brilha <Brilha> & Estrelinha", "volume_level": 0.35}},
        "weather.forecast_home": {"state": "partlycloudy", "attrs": {"temperature": 24}},
        "sun.sun": {"state": "below_horizon", "attrs": {"next_setting": (NOW + timedelta(hours=20)).isoformat(),
                                                          "next_rising": (NOW + timedelta(hours=9)).isoformat()}},
        "input_boolean.modo_faxina": {"state": "on"},
        "timer.modo_faxina": {"state": "active", "attrs": {"finishes_at": fim}},
        "input_boolean.concierge_nao_perturbe": {"state": "off"},
    }
    yield "faxina ativa", base
    off = {k: dict(v) for k, v in base.items()}
    off.update({"input_boolean.modo_faxina": {"state": "off"}, "timer.modo_faxina": {"state": "idle"},
                "light.cozinha": {"state": "off"}, "input_boolean.concierge_nao_perturbe": {"state": "on"}})
    yield "tudo desligado + dnd", off
    yield "entidades inexistentes", {}


def main():
    pkg = yaml.safe_load(PKG.read_text())
    script = pkg["script"]["home_concierge"]
    render_vars = next(s["variables"] for s in script["sequence"] if "variables" in s)
    acoes = ["nav menu", "nav faxina", "nav luzes", "nav cenas", "nav musica", "nav status", "nav xpto",
             "faxina_on", "faxina_1h", "faxina_mais", "faxina_off", "luz light.sala", "luzes_on",
             "luzes_off", "cena cheguei", "cena saindo", "cena cinema", "cena boanoite",
             "musica vol_up", "dnd", ""]
    count = 0
    for nome_cenario, states in scenarios():
        env = make_env(states)
        for acao in acoes:
            ctx = {"acao": acao, "chat_id": 123, "message_id": 9, "callback_id": "abc", "nome": "Bruno"}
            for k, v in script["variables"].items():
                ctx[k] = render(env, v, ctx)
            # every condition/template in the action choose must render
            for opt in script["sequence"][1]["choose"]:
                render(env, opt["conditions"], ctx)
                for step in opt["sequence"]:
                    for field in ("service", "target", "data"):
                        val = step.get(field)
                        if isinstance(val, dict):
                            for x in val.values():
                                render(env, x, ctx)
                        else:
                            render(env, val, ctx)
            for k, v in render_vars.items():
                ctx[k] = render(env, v, ctx)
            where = f"[{nome_cenario}] {acao!r} -> {ctx['tela']}"
            check_keyboard(ctx["teclado"], where)
            assert "Home Concierge" in ctx["texto"], where
            assert len(ctx["texto"]) < 4096, where
            count += 1
            if acao.startswith("nav") and acao != "nav xpto":
                print(f"\n==== {where}\n{ctx['texto']}\n{ctx['teclado']}")
    for auto in pkg["automation"]:
        for trig in auto["trigger"]:
            if "value_template" in trig:
                render(make_env(scenarios().__next__()[1]), trig["value_template"], {})
        for step in auto["action"]:
            for row in step.get("data", {}).get("inline_keyboard", []) or []:
                check_keyboard([row], auto["id"])
    print(f"\nOK: {count} renderizações validadas")


if __name__ == "__main__":
    sys.exit(main())
