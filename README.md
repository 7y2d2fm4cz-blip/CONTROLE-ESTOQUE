# ALMOX - Almoxarifado da obra

Aplicação privada para cadastro de materiais, recebimento de notas e saídas.

- XML NF-e: leitura local por namespace e conferência antes do lançamento.
- PDF/JPEG/PNG/WEBP: extração por OpenAI no servidor, sem expor chave ao navegador.
- BMP/GIF: conversão para PNG no navegador (primeiro quadro de GIF).
- HEIC/TIFF: exportar como JPEG ou PDF nesta versão.
- Limite: um documento por importação, 15 MB e 300 itens por recebimento.
- Dados persistidos em D1. O arquivo original não é arquivado nesta versão; são preservados os campos confirmados da nota e os movimentos.
- Saldo e custo médio calculados no servidor. Notas duplicadas bloqueadas por chave ou fornecedor/série/número.
- Controle otimista de concorrência evita sobreposição de lançamentos.
- Os documentos enviados à IA são dados não confiáveis e nunca definem instruções da aplicação.

## Configuração

OPENAI_API_KEY deve ser configurada como segredo no Sites. Nunca adicionar chaves ao código ou ao repositório.
Modelo da extração: gpt-4.1-mini, Responses API com saída estruturada.

## Verificação

`node test-stock.mjs` verifica entradas, duplicidade, saldo insuficiente, saída, concorrência, custo médio e atomicidade.
`npm run db:generate` gera migrações. `npm run build` compila a aplicação.

## Limites da primeira versão

O estado é persistido em um documento transacional com limite de 4 MB. Operações maiores exigirão normalização em tabelas antes de ampliar o volume. O site inicia com acesso privado do proprietário. Não há estoque fictício pré-carregado.
