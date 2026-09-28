# Android TypeScript diagnostics

O pipeline Android prepara toda a cadeia histórica antes de compilar. Este diagnóstico registra o resultado completo do `tsc`, o primeiro erro relevante e cópias dos arquivos preparados necessários para reproduzir a falha sem depender do recorte visual do GitHub Actions.

O artefato gerado é `CrewCheck-android-typescript-diagnostics`.
