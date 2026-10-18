# Histórico de versões

## 0.1.4 — atualização pela edição instalada

- Atualizador oficial do Tauri na edição instalada, com confirmação, progresso, verificação de assinatura digital e instalação seguida de reabertura.
- Edição portátil continua apenas avisando sobre novas versões e abrindo o download manual.
- Bloqueio da instalação automática no backend quando a cópia é portátil ou não foi instalada pelo setup.
- Pacotes de atualização assinados com chave própria; manifesto e assinatura publicados junto dos downloads.
- Verificação da versão assinada e testes de rejeição de pacotes alterados.
- Teste de atualização sobre a 0.1.3 e preservação do catálogo em runner descartável.

## 0.1.3 — controles e idiomas do player

- Removida a faixa permanente de dicas de atalhos do player.
- Setas para esquerda/direita buscam 10 segundos; cima/baixo alteram o volume em 5%.
- Esc e S saem da tela cheia; F11 continua alternando o modo.
- Clique no vídeo pausa/continua; duplo clique alterna a tela cheia sem alterar a pausa.
- Idiomas de áudio e legenda traduzidos, com distinção de Brasil/Portugal quando indicada nos metadados.
- Seletores ampliados e adaptáveis para acomodar os nomes dos idiomas.

## 0.1.2 — tela cheia e controles discretos

- F11 alterna a tela cheia em todo o aplicativo.
- Esc sai da tela cheia sem encerrar a reprodução.
- Durante a reprodução em tela cheia, os controles desaparecem com fade após 3 segundos de inatividade e reaparecem ao mover o mouse.
- Controles permanecem visíveis ao pausar, no fim do vídeo e durante a interação com a interface.
- Detecção de movimento sobre a superfície nativa do vídeo no Windows.
- Atalhos de tela cheia exibidos no player.

## 0.1.1 — manutenção pelo aplicativo

- Busca manual de atualizações em Configurações, com opção de incluir pré-releases.
- Abertura da página da nova release para baixar o instalador ou portátil.
- Atalho para o desinstalador, com confirmação e fechamento do Lume.
- Orientação específica de remoção para a edição portátil.
- Versão completa exibida na interface.

## 0.1.0 — primeira pré-release pública

- Biblioteca local para filmes, séries e animes.
- Reconhecimento de temporadas e episódios, incluindo numeração contínua.
- Player mpv incorporado por JSON IPC, seleção de áudio e legendas.
- Histórico e retomada por arquivo.
- Assistente de primeiro uso com preparação opcional do player.
- Instalador NSIS por usuário e ZIP com modo portátil real.
- Downloads do player fixados por versão, tamanho e SHA-256.
- Release com testes, avisos de terceiros e hashes dos pacotes.
