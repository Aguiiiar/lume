# Componentes de terceiros

O código do Lume é licenciado sob MIT. Os componentes de terceiros mantêm suas próprias licenças.

## Motor de vídeo opcional

Os instaladores e ZIPs públicos do Lume **não incluem binários do mpv nem do FFmpeg**. No primeiro uso, o usuário pode escolher um mpv.exe existente ou pedir que o Lume baixe diretamente um pacote do projeto `shinchiro/mpv-winbuild-cmake`, indicado pelo site do mpv. O download ocorre do servidor upstream para o computador do usuário, após uma ação explícita, com tamanho e SHA-256 fixados em `src-tauri/mpv.lock.json`.

- mpv: https://mpv.io/
- Distribuições Windows indicadas pelo mpv: https://mpv.io/installation/
- Pacote usado: https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20261018
- Fontes e avisos do mpv: https://github.com/mpv-player/mpv/tree/01e2533f31
- Licenças do mpv: GPL-2.0-or-later por padrão; componentes e builds podem ter outras condições descritas no arquivo Copyright upstream.

A licença MIT do Lume não altera as licenças do mpv, FFmpeg ou componentes que integrem uma build externa. O Lume se comunica com o player por JSON IPC em processo separado. Builds modificadas que redistribuam esses binários precisam acompanhar os avisos e as fontes correspondentes exigidos pelas licenças aplicáveis.

## Interface e aplicação

- Tauri e plugins oficiais: MIT/Apache-2.0 — https://github.com/tauri-apps/tauri
- React: MIT — https://github.com/facebook/react
- Lucide: ISC — https://github.com/lucide-icons/lucide
- SQLite: domínio público — https://www.sqlite.org/copyright.html
- rusqlite: MIT — https://github.com/rusqlite/rusqlite
- reqwest: MIT/Apache-2.0 — https://github.com/seanmonstar/reqwest
- sevenz-rust: Apache-2.0 — https://github.com/dyz1990/sevenz-rust

As versões exatas e demais dependências estão nos arquivos `Cargo.lock` e `package-lock.json`. Seus avisos são disponibilizados junto dos artefatos da release em `THIRD-PARTY-NOTICES.txt`.

O instalador usa NSIS e pode preparar o Microsoft Edge WebView2 Runtime quando ausente. O WebView2 é fornecido pela Microsoft sob seus próprios termos; o runtime não é parte do código MIT do Lume.
