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

- Administrador: todas as operações (inclusive aprovação da própria compra para testes), cadastro/aprovação/bloqueio de usuários e histórico de alterações de acesso. O proprietário atual é o administrador inicial; não existe promoção automática do primeiro visitante.
- Requisitante: consulta de materiais e saldos, criação de requisições, acompanhamento e cancelamento das próprias requisições pendentes. Não recebe custos, notas fiscais, lista de usuários nem requisições de terceiros nas respostas da API.
- Suprimentos: consulta todas as RCs aprovadas e registra fornecedor, pedido, item, quantidade comprada e previsão de entrega. Não aprova compras, recebe notas, administra usuários ou consulta custos.
- Aprovador: analisa solicitações de outra pessoa; não compra nem recebe materiais.
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

## Requisições de compras (RC)

- Compras e retiradas têm abas e registros distintos. Uma RC pode reunir múltiplos materiais da mesma obra, incluindo materiais novos não cadastrados no estoque. A criação da RC não cadastra automaticamente um saldo/material.
- A aba Requisições de compras mostra sugestões após as baixas: quantidade sugerida = máximo entre zero e (mínimo - saldo atual), com ajuste antes da confirmação. Saldo igual ao mínimo não gera sugestão.
- Uma compra aberta para o material é exibida no alerta. A geração pela sugestão é bloqueada quando já existe RC aberta para o item; compras manuais adicionais são explícitas.
- Situações: Aguardando aprovação, Aprovada, Compra parcial, Aguardando entrega, Recebida parcialmente, Encerrada, Reprovada e Cancelada. Solicitada/Em compra continuam reconhecidas como legado. Não existe encerramento manual de RC.
- Requisitante cria/acompanha suas próprias RCs e cancela somente as próprias ainda aguardando aprovação. Administrador, aprovador, suprimentos e almoxarife consultam todas conforme suas atribuições. Cancelamento exige justificativa e é bloqueado após qualquer compra/recebimento.
- Compras não alteram saldo nem enviam pedidos a fornecedores. Entradas continuam pela nota fiscal, vinculada ao item da RC e ao item do pedido. A RC encerra automaticamente somente quando toda a quantidade requisitada entrar no estoque. Se o mínimo continuar insuficiente, a necessidade de recomposição permanece visível.
- A definição de mínimos fica em Estoque mínimo. Registros RP anteriores permanecem no histórico, vinculados a RC quando houver conversão.

## Aprovação de compras e PDF

- O administrador atribui o perfil Aprovador na aba Usuários. O aprovador consulta todas as RCs e decide aprovação/reprovação, sem administrar pessoas, visualizar custos/notas ou movimentar estoque. Administrador também pode aprovar as próprias solicitações, com autoria registrada.
- Fluxo: Requisitante -> Aprovador (outra pessoa) -> Suprimentos -> Almoxarife. A reprovação exige justificativa. Quantidades parciais permanecem pendentes até o recebimento integral.
- Nome, identidade, data/hora e observação da decisão ficam no histórico. A aprovação e a exportação não alteram estoque.
- O servidor bloqueia compras, recebimentos vinculados e PDF enquanto não existir aprovação registrada; bloqueia encerramento manual em qualquer etapa. RCs antigas em andamento sem registro de aprovação precisam ser analisadas antes de avançar; históricos encerrados não recebem aprovação retroativa automática.
- Após aprovação, o botão Baixar PDF da requisição aprovada gera A4 com obra, finalidade, solicitante, prioridade, itens/quantidades, aprovador, data de aprovação e paginação. A emissão consulta novamente a identidade, o perfil e o estado da RC. Requisitantes emitem somente suas próprias RCs aprovadas. Canceladas e reprovadas não têm emissão liberada.
- Esse registro é uma aprovação interna do sistema, sem assinatura digital certificada ou envio automático para terceiros.


## Filas e conciliação de compras/entregas

- Abas Minhas requisições, Aprovações, Suprimentos e Recebimentos com contadores por obra e abertas conforme o perfil. Cada perfil operacional entra diretamente na sua fila ao carregar. O administrador mantém todas as abas.
- Aprovada com saldo a comprar entra em Suprimentos. O registro de compra aceita uma ou mais linhas, fornecedor, número/item de pedido e previsão; valida quantidade positiva até o saldo aprovado. Compras parciais podem ser complementadas com outros pedidos.
- Na RC, cada item mostra requisitado, comprado, recebido, falta comprar e falta entregar, incluindo o comprado ainda em trânsito. A tabela de pedidos compara comprado, entregue e pendente por pedido/item.
- A aba Recebimentos mostra somente pedidos com saldo em trânsito. O botão Registrar recebimento prepara a conferência sem lançar estoque. Também é possível importar uma NF e selecionar RC, item da RC e compra em cada linha.
- Quantidade recebida é a da linha efetiva da NF. Número/item do pedido continuam obrigatórios e devem coincidir com a compra selecionada; obra, unidade e material são validados. Não é permitido ultrapassar o saldo do pedido ou o requisitado. Para dividir o recebimento entre pedidos/RCs, use linhas separadas.
- Recebimentos parciais baixam somente o entregue. A pendência restante continua na fila; um mesmo item pode ter múltiplos pedidos e notas. Entrada sem RC continua disponível para legado/outros, mas não reduz nenhuma pendência de RC por inferência.
- Pedido, recebimento, estoque, movimento, NF e encerramento são persistidos com a mesma transação otimista. Nota duplicada, versão desatualizada ou qualquer linha inválida impedem o lançamento inteiro. O histórico mantém identidade, data, NF e quantidades.
- Histórico encerrado no fluxo anterior permanece preservado e identificado sem presumir entregas ou criar recebimentos retroativos.
- Atribua o perfil Suprimentos em Usuários usando a conta real da pessoa responsável. O cadastro interno não cria uma conta ChatGPT nem altera os convites do site privado.

## Cadastro por planilha e conciliação de nomenclaturas

- Cadastros / Materiais permite baixar o modelo XLSX e selecionar XLSX ou CSV UTF-8 (até 5 MB / 500 linhas). A aba Materiais do modelo fica vazia; exemplos e instruções ficam separados em Como preencher.
- Colunas: Código, Descrição, Unidade, Obra, Prateleira e Estoque mínimo. Descrição/unidade são obrigatórias; obra pode vir do filtro atual quando a célula estiver vazia. Obra e prateleira informadas devem existir.
- A prévia distingue novos, existentes e erros por linha. Qualquer erro bloqueia o lote inteiro. Código conflitante e repetição no arquivo são rejeitados; cadastros já existentes são ignorados sem alterar descrições, mínimos ou saldos. O servidor repete a validação com controle de versão antes da gravação.
- Administrador e almoxarife importam. Materiais novos recebem saldo e custo zero, autoria e data. Mínimo positivo pode gerar sugestão de reposição; nenhuma nota/movimentação é criada pela importação.
- Na conferência da NF, aparecem até três sugestões de materiais da mesma obra e unidade. A busca considera código, acentos, ordem das palavras e algumas abreviações. Especificações numéricas divergentes bloqueiam a sugestão. Similaridade de nome é apenas sugestão; o usuário confirma Usar este material e confere a especificação.
- O vínculo confirmado soma a entrada ao material existente e preserva a descrição original da NF. Linhas vinculadas à compra usam o material da própria RC. Nenhuma associação de material é feita automaticamente pela similaridade.

## Organização da interface

- Nova RC e detalhes/análise da compra abrem em janela modal, com o padrão visual das requisições de retirada. A janela mantém busca, materiais novos, quantidades e origem do mínimo, além do fluxo de aprovação/compra/recebimento. Erros aparecem dentro da janela; Escape/fechar ficam bloqueados durante gravação.
- Menu agrupado em Painel, Solicitações, Fluxo de compras, Almoxarifado e Administração. A ordem operacional é solicitar, aprovar, comprar e receber; as permissões e contadores de pendências permanecem por perfil.


## Manual e ajuda no aplicativo

- A aba Manual e ajuda fica no grupo Ajuda para todos os perfis ativos. Contém índice, pesquisa sem acentos, filtro por assunto e controles de expandir/recolher os tópicos.
- Conteúdo: primeiro acesso privado e usuários, perfis e filas, obras/prateleiras/materiais, planilhas, retirada, criação/aprovação/PDF da RC, pedidos parciais, notas e sugestões de vínculo, conciliação de entregas, mínimo, situações/cancelamentos, rastreabilidade, problemas frequentes e rotina por responsável.
- O manual descreve as permissões e limites da interface atual e inclui exemplo numérico de compra/entrega parcial. Não executa operações nem altera dados; filtros de obra não restringem o conteúdo da ajuda.

- Exceção do administrador: pode criar e aprovar a própria RC. A autorização é derivada do perfil ativo no servidor; campos enviados pelo cliente não concedem essa exceção. A fila Aprovações e os detalhes exibem a ação para o administrador; Aprovador permanece impedido de decidir as próprias. O histórico identifica a aprovação pelo mesmo administrador.
