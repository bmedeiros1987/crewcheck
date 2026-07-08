# CrewCheck v13.2.4 — Hardening cronológico

Correção para o caso real em que a próxima programação permanecia em `FOR → GRU`.

## Causa

O CrewRosterReport podia gerar evento com apresentação incoerente, como `Apres. 09:30` e `Decol. 04:34`.
A lógica antiga calculava o fim com base na apresentação, empurrando artificialmente o voo para o dia seguinte.

## Correções

- Para voos, o fim agora é calculado por decolagem/chegada, não por apresentação.
- Apresentação impossível passa a ser tratada como referência insegura.
- Próxima programação ignora voo já encerrado.
- Lista de eventos remove duplicidades básicas.
- CrewRosterReport passa a ser text-first quando o texto sequencial já encontra a escala.
- Layout Premium/EFB preservado.
- Parser canônico AIMS preservado.
