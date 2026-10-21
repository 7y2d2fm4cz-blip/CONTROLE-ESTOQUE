# ALMOX - Almoxarifado da obra

Aplica��o privada para cadastro de materiais, recebimento de notas e sa�das.

- XML NF-e: leitura local por namespace e confer�ncia antes do lan�amento.
- PDF/JPEG/PNG/WEBP: extra��o por OpenAI no servidor, sem expor chave ao navegador.
- BMP/GIF: convers�o para PNG no navegador (primeiro quadro de GIF).
- HEIC/TIFF: exportar como JPEG ou PDF nesta vers�o.
- Limite: um documento por importa��o, 15 MB e 300 itens por recebimento.
- Dados persistidos em D1. O arquivo original n�o � arquivado nesta vers�o; s�o preservados os campos confirmados da nota e os movimentos.
- Saldo e custo m�dio calculados no servidor. Notas duplicadas bloqueadas por chave ou fornecedor/s�rie/n�mero.
- Controle otimista de concorr�ncia evita sobreposi��o de lan�amentos.
- Os documentos enviados � IA s�o dados n�o confi�veis e nunca definem instru��es da aplica��o.

## Configura��o

OPENAI_API_KEY deve ser configurada como segredo no Sites. Nunca adicionar chaves ao c�digo ou ao reposit�rio.
Modelo da extra��o: gpt-4.1-mini, Responses API com sa�da estruturada.

## Verifica��o

`node test-stock.mjs` verifica entradas, duplicidade, saldo insuficiente, sa�da, concorr�ncia, custo m�dio e atomicidade.
`npm run db:generate` gera migra��es. `npm run build` compila a aplica��o.

## Limites da primeira vers�o

O estado � persistido em um documento transacional com limite de 4 MB. Opera��es maiores exigir�o normaliza��o em tabelas antes de ampliar o volume. O site inicia com acesso privado do propriet�rio. N�o h� estoque fict�cio pr�-carregado.
