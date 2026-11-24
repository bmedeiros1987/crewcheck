import json
import os
import re
import sys
from contextlib import ExitStack

from playwright.sync_api import sync_playwright

def launch_chromium(playwright):
    executable = os.environ.get('CREWCHECK_QA_BROWSER')
    options = {'executable_path': executable} if executable else {'channel': 'chrome'}
    return playwright.chromium.launch(headless=True, chromium_sandbox=True, **options)

def check_sandbox(browser):
    with browser.new_context(service_workers='block') as context:
        page = context.new_page()
        page.goto('chrome://sandbox')
        proof = page.locator('body').inner_text()
        assert re.search(r'Seccomp-BPF sandbox\s+Yes', proof, re.IGNORECASE), 'Chromium renderer seccomp sandbox unavailable'
        assert re.search(r'(?:PID namespaces|SUID sandbox|Namespace sandbox)\s+Yes', proof, re.IGNORECASE), 'Chromium renderer isolation unavailable'

if sys.argv[1:] == ['--preflight']:
    with sync_playwright() as playwright, launch_chromium(playwright) as browser:
        check_sandbox(browser)
        print(json.dumps({'sandbox': True, 'version': browser.version, 'appRun': False}))
    sys.exit(0)

config = json.load(sys.stdin)
origin = config['origin']
assert re.fullmatch(r'http://127\.0\.0\.1:\d+', origin), 'loopback fixture only'
assert all(email.endswith('@example.invalid') for email in config['owners'].values())
assert config['entry'] in ('settings', 'public')

def login(page, owner):
    page.goto(origin + '/login')
    page.get_by_placeholder('seu.email@exemplo.com').fill(config['owners'][owner])
    page.locator('input[autocomplete="current-password"]').fill(config['password'])
    with page.expect_response(lambda resp: resp.url == origin + '/api/auth/login' and resp.request.method == 'POST') as pending:
        page.get_by_role('button', name=re.compile(r'^Entrar no CrewCheck(?:\s*→)?$')).click()
    response = pending.value
    assert response.status == 200
    assert response.json()['user']['id'] == config['publicIds'][owner]
    page.wait_for_url(re.compile(re.escape(origin) + r'/(?!login(?:$|\?)).*'))
    assert page.evaluate('window.__CREWCHECK_BUILD__?.commit') == config['commit']

def open_browser_page(browser, stack):
    context = stack.enter_context(browser.new_context(service_workers='block'))
    context.route('**/*', lambda route: route.continue_()
                  if route.request.url.startswith(origin + '/') else route.abort())
    page = context.new_page()
    page.set_default_timeout(15000)
    return page

def visit_protected_settings(page):
    with page.expect_response(lambda resp: resp.url == origin + '/api/auth/me' and resp.request.method == 'GET') as pending:
        page.goto(origin + '/app?view=settings')
    return pending.value

def assert_active_settings(page, response, owner):
    assert response.status == 200 and response.json().get('authenticated') is True
    assert response.json()['user']['id'] == config['publicIds'][owner]
    page.get_by_role('button', name='Excluir minha conta', exact=True).wait_for()

with sync_playwright() as playwright, launch_chromium(playwright) as browser:
    check_sandbox(browser)
    with ExitStack() as contexts:
        page = open_browser_page(browser, contexts)
        confirmed_dialogs = []
        def answer_dialog(dialog):
            if dialog.type == 'prompt' and 'EXCLUIR' in dialog.message:
                confirmed_dialogs.append('excluir')
                dialog.accept('EXCLUIR')
            elif dialog.type == 'confirm' and 'exclu' in dialog.message.lower() and 'Play Store' not in dialog.message:
                confirmed_dialogs.append('confirmar')
                dialog.accept()
            elif dialog.type == 'alert':
                dialog.accept()
            else:
                dialog.dismiss()
        page.on('dialog', answer_dialog)

        def access_drafts(action, owner):
            return page.evaluate(
                """async ([action, owner]) => {
                  const fixture = await import('/qa-drafts.mjs');
                  return fixture[action](owner);
                }""", [action, config['publicIds'][owner]])

        # Use both accounts in the same browser origin so B's bytes are present
        # at the moment the normal app action deletes A.
        login(page, 'B')
        before_b = access_drafts('seed', 'B')
        assert before_b['valid'] and len(before_b['bytes']) == 2
        assert_active_settings(page, visit_protected_settings(page), 'B')
        page.get_by_role('button', name='Sair', exact=True).click()
        page.wait_for_url(origin + '/login')

        # These contexts keep their existing browser-managed sessions throughout
        # deletion. Their credentials are never copied between contexts.
        existing_b = open_browser_page(browser, contexts)
        login(existing_b, 'B')
        assert_active_settings(existing_b, visit_protected_settings(existing_b), 'B')
        existing_a = open_browser_page(browser, contexts)
        login(existing_a, 'A')
        assert_active_settings(existing_a, visit_protected_settings(existing_a), 'A')

        login(page, 'A')
        before_a = access_drafts('seed', 'A')
        assert before_a['valid'] and len(before_a['bytes']) == 2
        assert access_drafts('snapshot', 'B') == before_b['bytes']
        path = '/app?view=settings' if config['entry'] == 'settings' else '/delete-account'
        label = 'Excluir minha conta' if config['entry'] == 'settings' else 'Excluir agora no app'
        page.goto(origin + path)
        assert_active_settings(existing_a, visit_protected_settings(existing_a), 'A')
        assert_active_settings(existing_b, visit_protected_settings(existing_b), 'B')
        with page.expect_response(lambda resp: resp.url == origin + '/api/platform/account/delete' and resp.request.method == 'POST') as pending:
            page.get_by_role('button', name=label, exact=True).click()
        response = pending.value
        assert response.status == 200 and response.json().get('deleted') is True
        assert confirmed_dialogs == ['confirmar', 'excluir']
        page.wait_for_url(origin + '/login')
        assert access_drafts('snapshot', 'A') == {}
        assert access_drafts('snapshot', 'B') == before_b['bytes']

        revoked = visit_protected_settings(existing_a)
        assert revoked.status == 401 and revoked.json().get('authenticated') is False
        existing_a.wait_for_url(origin + '/login')
        assert_active_settings(existing_b, visit_protected_settings(existing_b), 'B')

        login(page, 'B')
        reopened = access_drafts('read', 'B')
        assert reopened['valid'] and reopened['bytes'] == before_b['bytes']
        print(json.dumps({
            'browser': True, 'sandbox': True, 'browserVersion': browser.version, 'entry': config['entry'],
            'checks': {'native_deletion_action_confirmed': True,
                       'A_existing_browser_session_revoked': True,
                       'B_existing_browser_session_preserved': True, 'A_drafts_removed': True,
                       'B_draft_bytes_preserved': True, 'B_reopens_both_drafts': True}
        }))
