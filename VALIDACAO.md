# Validação da versão 0.1

Realizada no Windows em 18/10/2026.

## Preparação da release pública

- `npm test`: 5 testes passaram, incluindo a exclusão de vídeos, histórico e binários de terceiros do ZIP público.
- `cargo test`: 7 testes locais passaram, incluindo integridade do download e isolamento dos dados portáteis.
- Teste de integração adicional executado explicitamente: download real do pacote upstream, verificação SHA-256, extração, reutilização sem novo download e localização do player após mover a pasta de dados. Passou.
- Instalador NSIS e ZIP portátil gerados pelo script de release; os pacotes públicos não contêm o mpv.
- Assistente de primeiro uso conferido na aplicação Windows em um catálogo isolado.
- GitHub Actions testa a instalação em um runner descartável antes de publicar os artefatos de tags.

## Reprodução e catálogo da versão inicial

- `npm test`: 4 testes passaram (agrupamento por obra/tipo, ordem numérica, retomada, posição/progresso).
- `cargo test`: 4 testes passaram (SxxExx e NxNN, animes e especiais, arquivos ambíguos, releitura com correções e histórico preservados).
- `npm run build`: TypeScript e compilação da interface concluídos.
- `npm run tauri build -- --no-bundle`: executável otimizado Windows x64 gerado.
- Interface conferida na aplicação real em janela de 1360 × 900.
- Vídeo sintético MKV de 3 minutos, com H.264, duas trilhas AAC e legenda SRT externa: imagem exibida dentro da janela do Lume, legenda carregada automaticamente e troca de português para inglês confirmada no mpv.
- Pausa e avanço de 10 segundos conferidos com o vídeo pausado.
- Clique na barra de posição durante a pausa: imagem e posição mudaram para 1:15.
- Retorno à biblioteca: `75.0` segundos persistidos em SQLite e `1:15` exibido no catálogo. Reabertura retomou a reprodução desse ponto.
- As verificações de player foram concluídas com banco e vídeo sintéticos em uma instância separada da biblioteca do usuário.

Durante a validação foi corrigido um bloqueio de comunicação em pipes síncronos do Windows. Eventos e comandos agora usam conexões separadas; comandos recebem confirmação do mpv. A posição mais recente também é persistida antes de sair do player.

Os testes com vídeo sintético não cobrem todas as combinações de codecs, HDR, aceleração por hardware ou discos externos. Esses casos devem ser verificados conforme os arquivos utilizados.
