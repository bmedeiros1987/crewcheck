import json
import os
import re
import sys
from contextlib import ExitStack

from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

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

def wait_for_owner(page, owner):
    page.wait_for_function(
        """id => JSON.parse(localStorage.getItem('crewcheck_auth_user') || 'null')?.id === id""",
        arg=config['publicIds'][owner],
    )

def login(page, owner):
    page.goto(origin + '/login')
    page.get_by_placeholder('seu.email@exemplo.com').fill(config['owners'][owner])
    page.locator('input[autocomplete="current-password"]').fill(config['password'])
    with page.expect_response(lambda resp: resp.url == origin + '/api/auth/login' and resp.request.method == 'POST') as pending:
        page.get_by_role('button', name=re.compile(r'^Entrar no CrewCheck(?:\s*→)?$')).click()
    assert pending.value.status == 200
    page.wait_for_url(re.compile(re.escape(origin) + r'/(?!login(?:$|\?)).*'))
    wait_for_owner(page, owner)
    assert page.evaluate('window.__CREWCHECK_BUILD__?.commit') == config['commit']

def open_browser_page(browser, stack):
    # The real locale resolver translates the Settings logout label.
    context = stack.enter_context(browser.new_context(locale='pt-BR', service_workers='block'))
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
    assert response.status == 200
    page.get_by_role('button', name='Excluir minha conta', exact=True).wait_for()
    wait_for_owner(page, owner)

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
        deletion_status = pending.value.status
        def returned_to_login(target):
            try:
                target.wait_for_url(origin + '/login')
                return True
            except PlaywrightTimeout:
                return False

        checks = {
            'native_deletion_action_confirmed':
                deletion_status == 200 and confirmed_dialogs == ['confirmar', 'excluir'],
            'A_initiating_browser_returns_to_login': returned_to_login(page),
            'A_drafts_removed': access_drafts('snapshot', 'A') == {},
            'B_draft_bytes_preserved': access_drafts('snapshot', 'B') == before_b['bytes'],
        }
        status_a = visit_protected_settings(existing_a).status
        checks['A_existing_browser_session_revoked'] = status_a == 401 and returned_to_login(existing_a)
        response_b = visit_protected_settings(existing_b)
        try:
            assert_active_settings(existing_b, response_b, 'B')
            checks['B_existing_browser_session_preserved'] = True
        except (AssertionError, PlaywrightTimeout):
            checks['B_existing_browser_session_preserved'] = False
        try:
            login(page, 'B')
            reopened = access_drafts('read', 'B')
            checks['B_reopens_both_drafts'] = reopened['valid'] and reopened['bytes'] == before_b['bytes']
        except (AssertionError, PlaywrightTimeout):
            checks['B_reopens_both_drafts'] = False
        print(json.dumps({
            'browser': True, 'sandbox': True, 'browserVersion': browser.version, 'entry': config['entry'],
            'http': {'deletion': deletion_status, 'existingA': status_a, 'existingB': response_b.status},
            'checks': checks,
        }))
