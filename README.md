# Lume

Sua biblioteca pessoal de filmes, séries e animes para Windows. Organize suas pastas, escolha áudio e legendas e continue de onde parou.

**Primeira versão pública em pré-release · Windows x64 · MIT**

## Instalar ou usar sem instalação

Baixe pela página de [Releases](https://github.com/Aguiiiar/lume/releases).

| Pacote                                   | Uso                                                               | Onde ficam os dados                 |
| ---------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `Lume-<versão>-windows-x64-setup.exe`    | Assistente de instalação por usuário, com atalhos e desinstalador | `%APPDATA%\local.lume.desktop`      |
| `Lume-<versão>-windows-x64-portable.zip` | Extraia todo o ZIP em uma pasta gravável e abra `Lume.exe`        | Pasta `data`, ao lado do executável |

O instalador oferece português e inglês e prepara o WebView2 quando ele não está presente. O portátil requer o [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) já instalado. Não é necessário Node.js, Rust, Cargo ou Visual Studio para usar os pacotes prontos.

Os pacotes ainda não têm assinatura de código do Windows; o editor pode aparecer como desconhecido. Os arquivos `SHA256SUMS.txt` de cada release permitem conferir a integridade dos downloads.

## Primeiro uso

1. Abra o Lume e siga o assistente de boas-vindas.
2. Prepare o player com o download opcional de cerca de 34 MB, ou escolha um `mpv.exe` existente.
3. Escolha suas pastas de filmes, séries ou animes.
4. Abra uma obra e dê o play. A posição é salva a cada 5 segundos, ao pausar e ao voltar à biblioteca.

A preparação automática baixa o mpv diretamente da origem e verifica o SHA-256 antes de extrair. Os pacotes públicos do Lume não incluem o binário do mpv. Não há download de vídeos. Depois de preparar o player, catálogo e reprodução funcionam offline.

Você pode pular etapas e reabrir o assistente em **Configurações → Abrir assistente**. Nenhuma pasta pessoal é lida antes de você escolhê-la.

## Biblioteca e reprodução

- Busca, filtros, grade e lista.
- Filmes, séries e animes separados por obra, temporada e episódio.
- Identificação por nomes como `S01E03`, `1x03` e pastas `Temporada 01` / `Season 01`.
- Numeração contínua em pastas `Anime` / `Animes`; temporada 0 para especiais.
- Correção de identificação em lote, preservada nas próximas leituras.
- Seleção de trilha de áudio e legendas internas ou externas.
- Legenda externa com nome correspondente ao vídeo carregada automaticamente, inclusive em `subs`, `subtitles` ou `legendas`.
- Histórico com retomada, marcação de assistido, tela cheia e próximo episódio.
- **F11** alterna a tela cheia em todo o app; **Esc** sai dela sem fechar o vídeo.
- Na reprodução em tela cheia, os controles desaparecem suavemente após 3 segundos sem movimento e voltam ao mover o mouse. Ao pausar ou interagir com os controles, eles permanecem visíveis.

O Lume não move, renomeia ou apaga os vídeos. Use **Atualizar biblioteca** depois de adicionar arquivos às pastas. Arquivos indisponíveis mantêm seu histórico no catálogo.

Exemplo de organização:

```text
Biblioteca/
  Filmes/
    Meu filme (2024).mkv
  Séries/
    Minha série/
      Temporada 01/
        Minha série - S01E01.mkv
        Minha série - S01E01.pt-BR.srt
  Animes/
    Meu anime/
      [Grupo] Meu anime - 127.mkv
```

**Explorar demonstração** exibe títulos fictícios em memória, sem alterar seu catálogo. As capas desta versão são ilustrações locais, sem busca de capas oficiais ou sinopses.

## Atualizações e dados

Em **Configurações → Buscar atualizações**, o Lume consulta as releases públicas do GitHub. A consulta é manual e permite incluir pré-releases. Quando há uma versão mais recente, **Abrir download** abre a página dessa release no navegador. Não há instalação automática nesta versão.

Na versão instalada, instale a nova versão sobre a anterior. No portátil, substitua os arquivos do programa e **preserve a pasta `data`**.

Para desinstalar a edição instalada, use **Configurações → Desinstalar** no Lume, confirme a abertura do assistente e siga suas etapas. O app será fechado. Também é possível remover pelo Windows em **Configurações → Aplicativos → Aplicativos instalados → Lume**. O assistente permite escolher a remoção dos dados do aplicativo; seus vídeos não são apagados.

A edição portátil não registra desinstalador. Feche o Lume e remova sua pasta. Faça backup de `data` para preservar catálogo, histórico e player preparado. Vídeos em pastas externas não são removidos.

O catálogo é um SQLite em `library.sqlite`. No modo portátil, o player preparado também fica em `data/players`, e acompanha a pasta quando ela é movida. Vídeos em outros discos mantêm os caminhos originais; movê-los não atualiza automaticamente suas referências.

Ao remover uma pasta do catálogo, a confirmação informa que o histórico correspondente também será removido. Os vídeos e legendas continuam no disco. Para fazer backup, feche o aplicativo e copie sua pasta de dados inteira.

## Desenvolvimento

Requisitos: Windows, Node.js 24 LTS, Rust estável, Visual Studio Build Tools com C++ para desktop e Windows SDK, além do WebView2 Runtime.

```powershell
npm ci
npm run tauri dev
```

Se o Cargo não estiver no PATH, abra um terminal novo após instalar Rust ou use `desenvolver.ps1`.

```powershell
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run build
npm run release:build
```

O último comando gera instalador, ZIP portátil, avisos de dependências e SHA-256 em `release/v<versão>`. Ele gera os avisos a partir dos locks antes de compilar. Não copia arquivos de mídia, dados locais ou binários do mpv para a release.

A integração com mpv usa um processo separado, JSON IPC e uma superfície HWND nativa no Windows. Eventos e comandos usam conexões distintas para permitir controles durante a pausa. A interface usa Tauri + React/TypeScript; a biblioteca usa Rust + SQLite.

## Publicar uma release

1. Alinhe a versão de `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json` e atualize os locks.
2. Escreva as notas em `releases/v<versão>.md`.
3. Faça commit e envie uma tag `v<versão>`.

O workflow **Release Windows** executa os testes, compila os pacotes, verifica o conteúdo do ZIP, testa o instalador em um runner descartável e publica uma pré-release com os artefatos. Uma execução manual gera artefatos sem publicar uma release. Apenas o job de publicação recebe permissão de escrita em conteúdos do repositório.

## Limites atuais

- Apenas Windows x64 tem player incorporado e pacotes publicados.
- A atualização das pastas é manual.
- Arquivos movidos ou renomeados não são reconciliados automaticamente com o histórico.
- As escolhas manuais de áudio/legenda ainda não são persistidas por episódio.
- Ainda não há controles de sincronização/aparência de legenda na interface.
- A compatibilidade depende dos codecs, do hardware e da build do mpv escolhida.

## Licenças

O código do Lume é [MIT](LICENSE). Os componentes de terceiros preservam suas licenças: veja [THIRD_PARTY.md](THIRD_PARTY.md) e os avisos disponibilizados nos artefatos. O manifesto do download opcional do player está em `src-tauri/mpv.lock.json`.

Contribuições e relatos de problemas são bem-vindos nas [Issues](https://github.com/Aguiiiar/lume/issues).
