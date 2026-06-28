# CrewCheck v11.0.95 — Regulamentação Calculator Premium

Atualização do módulo Regulamentação para funcionar como calculadora operacional, com foco em jornada, reserva, sobreaviso, acionamento e corte de motores.

## Principais ajustes

- Menu Regulamentação abre uma calculadora própria, não apenas a lista de alertas automáticos.
- Calculadora de Limite de Jornada: apresentação, tipo de tripulação, etapas, doméstico/internacional, extensão e margem de corte.
- Calculadora de Sobreaviso: início do SAV, apresentação/acionamento e teto combinado parametrizado, padrão 16h.
- Calculadora de Reserva: início da reserva, acionamento/apresentação e limite por jornada/teto combinado.
- Resultados com corte dos motores e encerramento da jornada.
- Alertas automáticos da escala continuam disponíveis, mas separados da consulta manual.
- Redução de falso positivo por flyingHours contaminado: quando há pernas legíveis, a métrica usa a soma das pernas, não o total bruto do PDF.
- Produção Android mantém R8/ProGuard, shrinkResources e mapping.txt.

## Android

- versionName: 11.0.95
- versionCode: 11095
