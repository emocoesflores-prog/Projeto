# PDV com rascunhos e ajustes da Oficina — versão 3.9

## Continuar uma venda depois

O PDV salva automaticamente a venda em digitação no servidor, inclusive quando só existe um cliente selecionado e ainda não há produtos. O aviso **Salvando rascunho… / Rascunho salvo às…** indica o estado da gravação. Ao usar Voltar, mudar de módulo pelo histórico do navegador ou sair da sessão, a aplicação aguarda a gravação antes de fechar a venda. Não aparece mais a confirmação de descarte ao sair normalmente.

Ao abrir o PDV, o último rascunho daquele operador é retomado. Use **Rascunhos**, no PDV ou na Gestão de Pedidos, para escolher outra venda, retomar ou excluir. **Nova venda** guarda a venda atual e abre outra em branco. Até 20 rascunhos ativos são permitidos por operador e floricultura.

São preservados produtos, quantidades, observações por item, cliente selecionado ou busca incompleta, modalidade, referência do endereço, local de retirada, data/período, mensagem, orientações, cupom e forma de pagamento pretendida. Ao retomar, o sistema consulta o cliente/endereço e o catálogo atual. Se o endereço mudou ou o agendamento passou, é preciso conferir novamente. Produtos que ficaram indisponíveis não são apagados silenciosamente; o registro final exige corrigir o carrinho. Preços, estoque, frete, cupom e capacidade são novamente validados no servidor.

Rascunhos **não são pedidos registrados**: não reservam estoque ou horário, não entram na ODF e não movimentam o Caixa. Depois de Registrar pedido, o rascunho é encerrado e a confirmação do recebimento abre normalmente. Se a resposta do registro se perder, retomar a mesma venda recupera o pedido existente, evitando duplicação.

![Rascunhos privados do operador, em demonstração](docs/rascunhos-pdv-3.9.png)

### Falha de rede e duas abas

Se não for possível salvar, o PDV mostra o erro e mantém a venda aberta ao tentar sair. Confira o aviso antes de fechar o navegador. Fechar/recarregar enquanto há alterações sem confirmação pode gerar o aviso de saída do navegador. Uma interrupção abrupta do computador ou perda de conexão não permite garantir o salvamento das últimas teclas ainda não recebidas pelo servidor.

Cada gravação confere uma versão. Se duas abas editarem o mesmo rascunho, a segunda não sobrescreve a primeira: o conteúdo local continua na tela, com a opção **Salvar uma cópia**. A lista de rascunhos recebe as notificações ao vivo sem substituir o formulário em edição. Os salvamentos são agrupados durante a digitação, sem recarregar os pedidos ou acionar a consulta de impressoras a cada tecla.

Rascunhos são privados para o operador autenticado, separados por floricultura, e ficam em `dbo.PdvDrafts`. Não são gravados em localStorage. Ao excluir ou converter em pedido, o conteúdo do rascunho é removido; ficam identificadores, versão, datas, estado e eventual referência do pedido, para impedir reativação por uma gravação antiga. O histórico do pedido registrado permanece separado e preservado.

Em **DATA_MODE=demo**, os rascunhos ficam na memória do servidor: sobrevivem à troca de tela, recarga e novo login enquanto esse processo continua ativo; desaparecem ao reiniciar o servidor. Use SQL Server para persistência entre reinicializações.

## Configuração e liberação automática da ODF

O bloqueio da gravação pela consulta das impressoras foi removido. Agora **Iniciar preparação dos pedidos agendados automaticamente** e os minutos de antecedência ficam salvos independentemente do estado das impressoras.

- **Sem impressoras cadastradas:** a liberação automática funciona sem impressão e sem aguardar consulta ao Windows.
- **Com impressoras cadastradas:** todas precisam estar disponíveis para liberar automaticamente. Indisponibilidade pausa a liberação, sem apagar ou desativar a preferência salva. A operação retoma quando a verificação volta a permitir.
- **Pedido agendado e pago:** entra em **Aguardando preparação** na antecedência definida, considerando o início do período no horário de São Paulo. Exemplo: período começando às 10h, antecedência de 120 minutos → liberação às 8h.
- Pedidos pagos já dentro dessa antecedência são recuperados na próxima verificação. Pedidos sem recebimento integral, Venda Loja e pedidos antigos sem horário definido não são liberados por essa regra. Pedidos para agora pagos continuam seguindo a liberação imediata já existente.

A automação roda no servidor, mesmo sem o painel aberto. O exemplo mostrado na configuração acompanha o número de minutos digitado. Para interromper a automação, desmarque a opção e salve. A ODF indica quando a liberação está pausada.

![Preferência de 120 minutos salva sem impressora cadastrada](docs/oficina-configuracao-3.9.png)

## Gestão de Pedidos

A lista à esquerda usa aproximadamente 38% da área no computador, deixando mais espaço para a ficha à direita. Nome, agendamento, valor e dados principais têm leitura ampliada. Computadores menores e celulares continuam com disposição responsiva.

As etiquetas usam combinações distintas nos dois temas: pagamento em amarelo, agendado em azul, aguardando preparação em castanho, preparação em violeta, pronto para entregador em verde oliva, pronto para retirada em magenta, saiu para entrega em laranja, entregue em verde azulado, concluído em cinza e cancelado em vermelho. Os nomes das etapas continuam visíveis. O botão duplicado de Gestão de Entregas nos filtros foi removido; o atalho superior GDE permanece.

![Lista com menor largura e ficha de pedido ampliada](docs/gestao-pedidos-3.9.png)

## Atualização do SQL e do código no Windows

**Esta versão adiciona a tabela `dbo.PdvDrafts`. Não recrie o banco nem apague pedidos. Não há nova variável obrigatória de `.env`.**

1. Pare o servidor com **Ctrl+C** e faça backup do banco, `.env` e pastas privadas, incluindo `.tenants`, `.product-media`, `.wwebjs_auth` e `.wwebjs_cache`.
2. Atualize os arquivos do código, preservando seus dados locais e `.env`.
3. No **SQL Server Management Studio (SSMS)**, selecione o banco definido em `SQL_DATABASE` e execute **`sql/pdv-drafts.sql`** com uma conta autorizada a criar a tabela. O script pode ser executado novamente e não altera as tabelas de pedidos, clientes ou pagamentos.
4. Garanta que o usuário SQL da aplicação tenha **SELECT, INSERT e UPDATE em `dbo.PdvDrafts`**. Não é necessário conceder privilégios de administrador à aplicação.
5. No terminal, dentro da pasta do projeto, execute:

```bat
npm ci
npm run media:setup
npm audit
npm start
```

6. Use **Ctrl+F5** em todas as telas abertas e confira a ODF em Configurações. Faça uma venda de teste: selecione um cliente, saia do PDV, abra outro módulo e retome o rascunho. Confira também após reiniciar o servidor usando SQL Server.

A inicialização tenta instalar a tabela se houver permissão; se faltar, informa o script necessário. Para instalações anteriores, `npm run migrate:platform` também passou a incluir essa tabela, mas uma instalação 3.8 já migrada precisa somente do novo script de rascunhos. Não substitua suas credenciais pelas de exemplo.

## Validação

**150 testes automatizados aprovados**, incluindo isolamento por loja/operador, rejeição de valores financeiros forjados no rascunho, limite de registros, controle de versão, encerramento, contrato de gravação SQL com bloqueio/reversão, resposta de rede perdida e proteção contra respostas de uma sessão anterior. A antecedência de 120 minutos foi testada antes e no instante de liberação, sem impressoras; a pausa por impressora cadastrada indisponível continua coberta.

No Chromium foram exercitados cliente sem itens, salvamento ao sair, recarga, novo login, recuperação de observações/agendamento, múltiplos rascunhos, conflito entre abas com cópia e falha de rede que mantém a venda aberta. A configuração de 120 minutos foi salva e reaberta. Foram conferidos os 21 módulos, recebimentos divididos, recuperação de registro, mídias, cores das etiquetas e resoluções de computador/tablet/celular nos dois temas. A auditoria desta entrega informou zero vulnerabilidades conhecidas.

As imagens usam dados fictícios. O SQL Server do computador da loja e impressoras físicas não foram acessados neste ambiente; os testes SQL são de contrato, sem conexão com o seu banco. Os controles de autenticação, sessão e isolamento existentes continuam aplicáveis aos rascunhos. Inclua a nova tabela nos backups e nas regras de acesso e retenção da operação.
