# CrewCheck v13.5.2 - PDF Import Fallback

Hotfix focado em restaurar a importacao de escala em PDF quando o leitor local do navegador falha com erro minificado de PDF.js/worker.

## Objetivo

- Preservar a leitura local como primeira tentativa.
- Usar `/api/parse-pdf` como fallback seguro quando o navegador falhar.
- Manter o Import Guardian antes de ativar a escala.
- Manter parser AIMS/CrewRoster, motor canonico e continuidade fisica sem alteracao de regra.

## Fluxo

1. Usuario escolhe o PDF.
2. CrewCheck tenta `parsePDF(file)` localmente.
3. Se o leitor local falhar, o PDF e enviado ao endpoint interno `/api/parse-pdf`.
4. O retorno do servidor entra no mesmo fluxo de confirmacao do Import Guardian.
5. A escala so e ativada apos confirmacao do usuario.

## Preservado

- Parser AIMS/CrewRoster.
- Motor canonico.
- Continuidade fisica/anti-teletransporte.
- Import Guardian.
- Roster inline.
- Gerenciador de Apresentacao.
- Lounge Systems.
- Monthly Map.
- Politica de nao salvar credenciais, senha, MFA, cookies ou sessao.

## Diagnostico

O app registra localmente:

- `crewcheck_last_pdf_local_error`
- `crewcheck_last_pdf_import_source`

Esses campos ajudam suporte sem expor credenciais ou dados sensiveis.
