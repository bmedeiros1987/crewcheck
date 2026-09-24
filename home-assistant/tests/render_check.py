#!/usr/bin/env python3
"""Offline check for the Home Concierge package.

Simulates `script.home_concierge` step by step (variables, if/choose, stop)
against a mocked Home Assistant, for every screen and action and several
house states. It records the services each action calls, then validates the
panel text and the Telegram keyboards (label:data format, 64-byte callback
limit, reply keyboard layout).

Run: python3 home-assistant/tests/render_check.py
"""
import ast
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jinja2
import yaml

PKG = Path(__file__).resolve().parents[1] / "packages" / "home_concierge.yaml"
TZ = timezone(timedelta(hours=-3))
NOW = datetime(2026, 9, 24, 21, 5, tzinfo=TZ)


class Stop(Exception):
    pass


class Obj(dict):
    __getattr__ = dict.get


def make_env(house):
    states, areas = house["states"], house.get("areas", {})
    env = jinja2.Environment(extensions=["jinja2.ext.loopcontrols"])

    def st(e):
        return states.get(e, {}).get("state", "unknown")

    class States:
        def __call__(self, e):
            return st(e)

        def __getattr__(self, domain):
            return [Obj(entity_id=e, state=v.get("state"), name=v.get("attrs", {}).get("friendly_name", e))
                    for e, v in states.items() if e.startswith(domain + ".")]

    def is_state(e, v):
        return st(e) in (v if isinstance(v, list) else [v])

    def state_attr(e, a):
        return states.get(e, {}).get("attrs", {}).get(a)

    def as_datetime(v):
        return datetime.fromisoformat(v) if isinstance(v, str) else v

    def is_number(v):
        try:
            float(v)
            return True
        except (TypeError, ValueError):
            return False

    env.globals.update(
        states=States(), is_state=is_state, state_attr=state_attr, now=lambda: NOW, as_datetime=as_datetime,
        areas=lambda: list(areas), area_name=lambda a: areas.get(a, {}).get("name"),
        area_entities=lambda a: list(areas.get(a, {}).get("ents", [])))
    env.filters.update(as_local=lambda d: d.astimezone(TZ), is_state=is_state, is_number=is_number)
    env.tests.update(is_state=is_state, match=lambda v, rx: bool(re.match(rx, str(v))))
    return env


def render(env, tpl, ctx):
    if isinstance(tpl, dict):
        return {k: render(env, v, ctx) for k, v in tpl.items()}
    if isinstance(tpl, list):
        return [render(env, v, ctx) for v in tpl]
    if not isinstance(tpl, str) or ("{{" not in tpl and "{%" not in tpl):
        return tpl
    out = env.from_string(tpl).render(**ctx)
    try:  # HA native types
        return ast.literal_eval(out)
    except (ValueError, SyntaxError):
        return out.strip() if out.strip() in ("True", "False") else out


def truthy(v):
    return v is True or (isinstance(v, str) and v.strip().lower() == "true")


def run(env, steps, ctx, calls):
    for step in steps:
        if "variables" in step:
            for k, v in step["variables"].items():
                ctx[k] = render(env, v, ctx)
        elif "stop" in step:
            raise Stop(step["stop"])
        elif "if" in step:
            branch = "then" if truthy(render(env, step["if"], ctx)) else "else"
            run(env, step.get(branch, []), ctx, calls)
        elif "choose" in step:
            for opt in step["choose"]:
                if truthy(render(env, opt["conditions"], ctx)):
                    run(env, opt["sequence"], ctx, calls)
                    break
            else:
                run(env, step.get("default", []), ctx, calls)
        elif "service" in step:
            calls.append((render(env, step["service"], ctx),
                          render(env, step.get("target", {}), ctx), render(env, step.get("data", {}), ctx)))
        elif "delay" in step:
            pass
        else:
            raise AssertionError(f"passo desconhecido: {step}")


def check_keyboard(rows, where):
    assert isinstance(rows, list) and rows, f"{where}: keyboard not a list: {rows!r}"
    for row in rows:
        for btn in row.split(","):
            parts = btn.strip().split(":")
            assert len(parts) == 2, f"{where}: bad button {btn!r}"
            label, data = parts
            assert label.strip() and data.startswith("/hc "), f"{where}: bad button {btn!r}"
            assert len(data.encode()) <= 64, f"{where}: callback too long {data!r}"


def houses():
    fim = (NOW + timedelta(hours=2, minutes=14)).isoformat()
    areas = {
        "sala": {"name": "Sala", "ents": ["light.sala", "light.sala_abajur", "switch.tv_tomada", "climate.ar_sala",
                                          "sensor.temp_sala", "binary_sensor.porta"]},
        "quarto": {"name": "Quarto", "ents": ["light.quarto", "fan.ventilador", "cover.cortina_quarto"]},
        "garagem": {"name": "Garagem", "ents": ["sensor.x"]},
    }
    base = {
        "light.cozinha": {"state": "on", "attrs": {"brightness": 200, "friendly_name": "Cozinha"}},
        "light.sala": {"state": "off", "attrs": {"friendly_name": "Sala Luz Principal"}},
        "light.sala_abajur": {"state": "on", "attrs": {"brightness": 60, "friendly_name": "Sala Abajur, canto"}},
        "switch.tv_tomada": {"state": "on", "attrs": {"friendly_name": "Tomada: TV"}},
        "climate.ar_sala": {"state": "cool", "attrs": {"friendly_name": "Ar da Sala", "current_temperature": 26,
                                                       "temperature": 22}},
        "sensor.temp_sala": {"state": "25.64", "attrs": {"device_class": "temperature"}},
        "light.quarto": {"state": "off", "attrs": {"friendly_name": "Quarto Teto"}},
        "fan.ventilador": {"state": "on", "attrs": {"friendly_name": "Ventilador", "percentage": 66}},
        "cover.cortina_quarto": {"state": "open", "attrs": {"friendly_name": "Cortina", "current_position": 40}},
        "alarm_control_panel.casa": {"state": "disarmed", "attrs": {"friendly_name": "Alarme Casa"}},
        "media_player.laurinha": {"state": "playing", "attrs": {"media_title": "Brilha <Brilha> & Estrelinha",
                                                                "volume_level": 0.35}},
        "weather.forecast_home": {"state": "partlycloudy", "attrs": {"temperature": 24}},
        "sun.sun": {"state": "below_horizon", "attrs": {"next_setting": (NOW + timedelta(hours=20)).isoformat(),
                                                          "next_rising": (NOW + timedelta(hours=9)).isoformat()}},
        "input_boolean.modo_faxina": {"state": "on"},
        "timer.modo_faxina": {"state": "active", "attrs": {"finishes_at": fim}},
        "input_boolean.concierge_nao_perturbe": {"state": "off"},
        "input_boolean.concierge_despertador": {"state": "on"},
        "input_boolean.concierge_despertador_uteis": {"state": "on"},
        "input_datetime.concierge_despertador": {"state": "06:45:00"},
    }
    yield "casa completa", {"states": base, "areas": areas}, {"alarme": "alarm_control_panel.casa"}
    armado = {k: dict(v) for k, v in base.items()}
    armado.update({"alarm_control_panel.casa": {"state": "triggered"}, "input_boolean.modo_faxina": {"state": "off"},
                   "timer.modo_faxina": {"state": "idle"}, "input_boolean.concierge_nao_perturbe": {"state": "on"},
                   "timer.concierge_soneca": {"state": "active",
                                              "attrs": {"finishes_at": (NOW + timedelta(minutes=10)).isoformat()}},
                   "input_datetime.concierge_despertador": {"state": "unknown"}})
    yield "alarme disparado + soneca", {"states": armado, "areas": areas}, {"alarme": "alarm_control_panel.casa",
                                                                           "alarme_codigo": "1234"}
    yield "HA vazio", {"states": {}, "areas": {}}, {"luzes": {}}


ACOES = ["nav menu", "nav comodos", "nav luzes", "nav alarme", "nav despertador", "nav faxina", "nav cenas",
         "nav musica", "nav status", "nav xpto", "comodo sala", "comodo quarto", "comodo fav", "comodo nada",
         "ctog sala 0", "ctog sala 3", "ctog sala 99", "ctog quarto x", "con sala", "coff quarto", "cbri sala 50",
         "cbri quarto 25", "luzes_on", "luzes_off", "alarme away", "alarme home", "alarme night", "alarme disarm",
         "alarme hack", "alarme_conf disarm", "desp_toggle", "desp_uteis", "desp_adj -60", "desp_adj 15",
         "desp_adj 1440", "desp_set 0530", "desp_set 9999", "despertar", "soneca", "acordei", "faxina_on",
         "faxina_1h", "faxina_mais", "faxina_off", "cena cheguei", "cena saindo", "cena cinema", "cena boanoite",
         "musica vol_up", "dnd", "", "teclado", "teclado_off", "txt oi tudo bem?"]
MOSTRAR = {"nav menu", "comodo sala", "comodo quarto", "nav comodos", "nav alarme", "alarme_conf disarm",
           "nav despertador", "despertar", "nav status", "txt 🌙 Boa noite"}


def main():
    pkg = yaml.safe_load(PKG.read_text())
    script = pkg["script"]["home_concierge"]
    h, m, sec = map(int, pkg["timer"]["modo_faxina"]["duration"].split(":"))
    assert h * 3600 + m * 60 + sec == script["variables"]["faxina_horas"] * 3600, \
        "timer.modo_faxina duration must match faxina_horas"
    menu_fixo = script["variables"]["menu_fixo"]
    for rotulo in menu_fixo:
        assert "," not in rotulo and ":" not in rotulo, f"menu_fixo: rótulo inválido {rotulo!r}"
    acoes = ACOES + [f"txt {r}" for r in menu_fixo]
    alarme_script = pkg["script"]["concierge_alarme"]
    count = 0
    for nome_casa, house, config in houses():
        env = make_env(house)
        mostrados = set()
        for acao in acoes:
            via_texto = acao.startswith("txt ") or acao.startswith("teclado") or acao == "despertar"
            ctx = {"acao": acao, "chat_id": "" if acao == "despertar" else 123, "nome": "Bruno",
                   "message_id": "" if via_texto else 9, "callback_id": "" if via_texto else "abc"}
            for k, v in script["variables"].items():
                ctx[k] = render(env, config[k], ctx) if k in config else render(env, v, ctx)
            calls = []
            where = f"[{nome_casa}] {acao!r}"
            try:
                run(env, script["sequence"], ctx, calls)
            except Stop as motivo:
                if acao.startswith("txt "):
                    assert acao[4:] not in menu_fixo, f"{where}: botão do menu fixo ignorado"
                elif ctx["cmd"] != "teclado_off":
                    raise AssertionError(f"{where}: parou ({motivo})")
                continue
            except Exception as exc:
                raise AssertionError(f"{where}: {exc}") from exc
            servicos = [c[0] for c in calls]
            # the alarm helper script must accept what the concierge sends
            for svc, _, data in calls:
                if svc == "script.concierge_alarme":
                    actx = dict(data)
                    acalls = []
                    try:
                        run(env, alarme_script["sequence"], actx, acalls)
                    except Stop:
                        pass
                    assert acalls and acalls[0][0].startswith("alarm_control_panel.alarm_"), (where, acalls)
                    assert ("code" in acalls[0][2]) == bool(config.get("alarme_codigo")), (where, acalls)
            if ctx["cmd"] == "teclado":
                kb = next(c for c in calls if "keyboard" in c[2])[2]["keyboard"]
                assert [b.strip() for r in kb for b in r.split(",")] == list(menu_fixo), kb
                assert all(len(r.split(",")) <= 2 for r in kb), kb
                if nome_casa == "casa completa":
                    print(f"\n==== menu fixo\n{kb}")
            painel = [c for c in calls if c[0] in ("telegram_bot.edit_message", "telegram_bot.send_message")
                      and "inline_keyboard" in c[2]]
            assert len(painel) == 1, f"{where}: painel enviado {len(painel)}x"
            check_keyboard(painel[0][2]["inline_keyboard"], where)
            texto = painel[0][2]["message"]
            assert len(texto) < 4096 and texto.strip(), where
            assert "None" not in texto and "Undefined" not in texto, f"{where}: {texto}"
            if via_texto and ctx["cmd"] not in ("nav", "teclado"):
                assert painel[0][0] == "telegram_bot.send_message", where
            # behaviour spot checks
            if nome_casa == "casa completa":
                if acao == "ctog sala 0":
                    assert ("homeassistant.toggle", {"entity_id": "climate.ar_sala"}, {}) in calls, calls
                if acao in ("ctog sala 99", "ctog quarto x", "alarme hack"):
                    assert not any(s.startswith(("homeassistant", "script.")) for s in servicos), (where, servicos)
                if acao == "cbri sala 50":
                    assert calls[1][1] == {"entity_id": ["light.sala", "light.sala_abajur"]}, calls
                if acao == "cena saindo":
                    assert "script.concierge_alarme" in servicos, servicos
                    off = next(c for c in calls if c[0] == "homeassistant.turn_off")[1]["entity_id"]
                    assert "switch.tv_tomada" not in off and "light.quarto" in off, off
                if acao == "desp_adj -60":
                    assert ("input_datetime.set_datetime", {"entity_id": "input_datetime.concierge_despertador"},
                            {"time": "05:45:00"}) in calls, calls
                if acao == "desp_set 9999":
                    assert any(c[2].get("time") == "03:39:00" for c in calls), calls
                if acao == "despertar":
                    assert "light.turn_on" in servicos and painel[0][0] == "telegram_bot.send_message", servicos
            count += 1
            chave = acao if acao in MOSTRAR else None
            if chave and chave not in mostrados and nome_casa != "HA vazio" or acao == "nav comodos":
                mostrados.add(chave)
                print(f"\n==== {where} -> {ctx['tela']}\n{texto}\n{painel[0][2]['inline_keyboard']}")
    for auto in pkg["automation"]:
        for trig in auto["trigger"]:
            if "value_template" in trig:
                render(make_env(next(houses())[1]), trig["value_template"], {})
        for step in auto["action"]:
            data = step.get("data", {})
            for row in data.get("inline_keyboard", []) or []:
                check_keyboard([row], auto["id"])
            if "message" in data:
                render(make_env(next(houses())[1]), data["message"], {})
    print(f"\nOK: {count} execuções simuladas")


if __name__ == "__main__":
    sys.exit(main())
