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

## Requisições e saídas

- Busca por código, descrição, obra, prateleira e unidade, sem diferenciar acentos ou ordem das palavras.
- Requisições com múltiplos materiais da mesma obra, solicitante, destino e observações.
- Solicitar cria uma requisição pendente e não reserva nem baixa saldo. A retirada exige conferência e confirmação separadas.
- O atendimento valida o saldo de todos os itens e grava a baixa integral com controle de concorrência. Requisições atendidas ou canceladas não podem ser processadas novamente.
- O histórico registra o número da requisição, solicitante, destino e responsável pela entrega.

## Perfis de acesso

- Administrador: todas as operações, cadastro/aprovação/bloqueio de usuários e histórico de alterações de acesso. O proprietário atual é o administrador inicial; não existe promoção automática do primeiro visitante.
- Requisitante: consulta de materiais e saldos, criação de requisições, acompanhamento e cancelamento das próprias requisições pendentes. Não recebe custos, notas fiscais, lista de usuários nem requisições de terceiros nas respostas da API.
- Almoxarife: consulta de estoque/custos, recebimento de notas, cadastros, requisições, confirmação de retirada e cancelamento. Não gerencia usuários.
- E-mail de login pré-cadastrado vincula o usuário à identidade estável do site na primeira operação. Usuários sem cadastro podem solicitar aprovação; pendentes e bloqueados não consultam dados operacionais.
- O administrador não pode bloquear nem rebaixar seu próprio perfil. As permissões são consultadas novamente a cada requisição ao servidor, incluindo a importação de notas.
- O controle de acesso do aplicativo complementa o compartilhamento do Sites, cuja audiência e autenticação permanecem inalteradas. Nenhum convite ou mensagem é enviado pelo aplicativo.

## Estoque mínimo e reposição

- A aba Reposição permite selecionar materiais existentes e definir o mínimo por material/obra. Mínimo zero desativa o monitoramento.
- Saldo estritamente menor que um mínimo positivo gera alerta e uma requisição RP com quantidade em branco (Definir quantidade), dentro da mesma gravação que altera saldo ou mínimo. Há somente uma requisição aberta por material.
- Administrador e almoxarife definem a quantidade e solicitam a reposição. Requisitante não altera mínimos nem gerencia reposições.
- Reposição não baixa nem aumenta estoque, não envia mensagem e não cria pedido externo. O recebimento real continua pela nota fiscal, vinculando ao material existente.
- Rascunhos são regularizados automaticamente quando o saldo atinge o mínimo ou o monitoramento é desativado. Requisições já solicitadas permanecem no histórico e são encerradas pelo responsável após a regularização.
- Nova queda após encerramento/regularização gera novo rascunho. O histórico é preservado.
- A aba exibe contador de alertas. A tela atualiza os saldos ao recuperar foco, manualmente ou a cada minuto enquanto estiver visível e sem operação em andamento.
