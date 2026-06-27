# CrewCheck v11.0.87 — Telegram salva PDF original no Storage de backup

Esta versão mantém o **banco atual do CrewCheck como fonte principal**. O Supabase não substitui o banco de dados: ele é usado apenas como **Cloud Storage opcional** para guardar o PDF original da escala em modo backup/redundância.

## Hotfix v11.0.87

- Corrige importação de escala pelo Telegram para também enviar o PDF original ao Supabase Storage quando `CREWCHECK_STORAGE_PROVIDER=supabase` e `CREWCHECK_STORAGE_MODE=backup`.
- Banco atual continua sendo a fonte principal; Supabase permanece apenas como backup/redundância do arquivo original.
- Mensagem de confirmação do Telegram agora informa se o backup seguro foi salvo, ficou pendente ou não está configurado.
- Deduplicação continua funcionando: se a escala já existir, o backup pode ser associado à mesma escala.

## O que mudou

- Menu principal reorganizado para deixar **Gerenciador de Escalas** e **Regulamentação** visíveis no grupo Operacional.
- Menu flutuante agora também mostra **Gerenciador de Escalas** e **Regulamentação** como atalhos diretos.
- Tela **Mais funções** ganhou o card **Regulamentação e Jornada**.
- Em Results, **Conformidade** passa a aparecer como **Regulamentação**, focando jornada, acionamento e limites.
- Em Results, **Histórico** passa a aparecer como **Gerenciador de Escalas** quando fizer sentido para o usuário.

- Áudio do Telegram mais informal, direto e pessoal para programação.
- Cumprimento automático por período: bom dia, boa tarde ou boa noite.
- O greeting aparece apenas na primeira resposta de texto e na primeira resposta de áudio por período, evitando repetição.
- Siglas de escala são faladas traduzidas: DO vira folga, HSB vira sobreaviso, PS/VEX vira extra, RES vira reserva.
- Horários agora são falados como “começa às XX horas” e “termina às XX e YY horas”.
- Resumo de voo ficou menos literal: fala quantidade de pernas, origem, horário de início, destino final e horário de término.
- Mantida produção Android premium com R8/ProGuard, shrinkResources e mapping.txt.
- Mantido Supabase apenas como storage de backup/redundância; banco principal segue sendo DATABASE_URL.
- Banco atual continua responsável por login, escala ativa, histórico, dados processados, conformidade, diárias e Telegram.
- Supabase Storage entra somente como cofre privado do arquivo original enviado pelo usuário.
- Se o Supabase falhar, a escala processada continua salva no banco atual e aparece no Gerenciador como backup pendente.
- Removido fallback automático para `SUPABASE_DATABASE_URL`, evitando troca acidental do banco de dados.
- Tela **Gerenciador de Escalas** deixa claro que o storage é apenas backup/redundância.
- Status de importação atualizado para `stored_backup` ou `processed_backup_pending`.
- Mantidas as correções anteriores de Telegram, áudio ElevenLabs, Azure/OpenAI fallback, menu mobile e regulamentação de jornada.

## Variáveis recomendadas no Render

```env
# Banco atual do CrewCheck — fonte principal
DATABASE_URL=sua_database_url_atual

# Supabase somente para storage/backup do PDF original
CREWCHECK_STORAGE_PROVIDER=supabase
CREWCHECK_STORAGE_MODE=backup
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sua_secret_key_rotacionada
CREWCHECK_SUPABASE_BUCKET_ROSTERS=crewcheck-rosters
```

Crie no Supabase um bucket privado chamado `crewcheck-rosters`. Não coloque a `SUPABASE_SECRET_KEY` no frontend, no ZIP ou no bash. Use apenas Environment Variables no Render.



## Produção Android Premium

- Release Android com `minifyEnabled true` e `shrinkResources true`.
- Geração automática de `mapping.txt` em `android-wrapper/app/build/outputs/mapping/release/mapping.txt`.
- Workflow do GitHub publica o AAB, APK e `crewcheck-mapping-v11.0.87.txt` como assets da release.
- Use o `app-release.aab` na Play Console e envie o arquivo `crewcheck-mapping-v11.0.87.txt` como arquivo de desofuscação da mesma versão.
- O Supabase continua apenas como storage de backup/redundância; o banco principal segue sendo `DATABASE_URL`.