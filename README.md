# Floricultura Emoções Flores

Loja e central de pedidos em português para **Mauá, Santo André e Ribeirão Pires (SP)**, com Node.js 24, Express e SQL Server. Retirada gratuita: **Rua Havana, 95, Parque das Américas, Mauá – SP**. Frete inicial de **R$ 20**, alterável pelo painel.

## Iniciar no Windows

Abra o terminal na pasta que contém `server.js` e `package.json`:

```bat
npm ci
copy .env.example .env
notepad .env
```

Defina uma chave longa e exclusiva em `ADMIN_TOKEN`, mantenha `DATA_MODE=demo` para experimentar sem banco, salve e execute:

```bat
npm start
```

Com o processo ativo, abra na própria máquina:

- Loja: `http://localhost:3000`
- Administração: `http://localhost:3000/admin.html`

O painel usa a chave `ADMIN_TOKEN`. O `.env` não deve ser enviado ao GitHub. Em demonstração, pedidos e mudanças de frete ficam em memória e desaparecem ao reiniciar. Não use dados pessoais reais nesse modo. Para atualizar uma instalação existente, siga **ATUALIZAR-WINDOWS.txt**; preserve seu `.env`.

## SQL Server local

Crie um banco exclusivo `Floricultura`. Configure TCP/IP e uma porta fixa para a instância. Use uma conta SQL dedicada, sem `sysadmin`. O driver atual usa autenticação SQL, não autenticação integrada do Windows. No `.env`:

```env
DATA_MODE=sqlserver
SQL_HOST=localhost
SQL_PORT=1433
SQL_DATABASE=Floricultura
SQL_USER=floricultura_app
SQL_PASSWORD="preencha_apenas_no_seu_computador"
SQL_TRUST_CERTIFICATE=false
```

A porta deve corresponder à sua instância. A conexão é criptografada. Somente em desenvolvimento local com certificado próprio, use `SQL_TRUST_CERTIFICATE=true`; em produção, use certificado confiável e `false`.

`sql/schema.sql` cria `dbo.Orders` e `dbo.StoreSettings` na primeira inicialização, sem redefinir uma taxa já existente. Execute essa criação com uma conta de migração ou conceda temporariamente a permissão necessária. Depois, a conta da aplicação necessita apenas de SELECT, INSERT e UPDATE nas tabelas. Não é necessário manter `db_ddladmin`.

Esta atualização da gestão de pedidos **não altera as tabelas e não exige recriar o banco**. Novos campos, preços registrados, histórico e versão do pedido usam a coluna JSON existente. Pedidos antigos continuam legíveis: histórico e preços individuais antigos não são inventados, e o total original é preservado. Alterações SQL usam transação com bloqueio da linha e conferência de versão para evitar sobrescrever uma operação feita em outra tela.

O proprietário confirmou a conexão da primeira versão com seu SQL Server local. Os novos fluxos desta atualização foram testados em demonstração neste ambiente; a persistência dessas novas operações ainda deve ser conferida na máquina do proprietário. O SQL Server local não é acessível automaticamente pela nuvem. Não exponha a porta do banco à internet.

## PDV · Novo pedido

O botão **Novo pedido** abre uma tela de PDV com catálogo à esquerda e resumo da venda à direita. Há busca por nome, categoria ou código do produto, categorias, adição rápida, quantidades, observação por item e totais calculados no servidor.

Os três primeiros campos do resumo são:

1. **Modalidade:** Venda na Loja (padrão), Retirada, Entrega.
2. **Cliente:** consumidor final opcional em venda na loja; nome, telefone e destinatário obrigatórios para retirada/entrega. A busca reutiliza contatos dos pedidos carregados, sem CRM independente.
3. **Atendimento:** Pedido para agora (padrão), Realizar agendamento.

**Pedido para agora** não reserva hora e recebe data/período do servidor no fuso de São Paulo. **Realizar agendamento** abre uma janela para escolher dia e faixa; Cancelar/fechar preserva a escolha anterior e a ação “É um pedido para agora?” remove o agendamento. O seletor oferece os próximos 90 dias. As faixas iniciais, seguindo as referências fornecidas, são 09:10–10:50, 10:50–12:30, 13:40–15:20, 15:20–17:00 e 17:00–18:40, compartilhadas em `public/order-options.js`. Não se presume fechamento aos domingos/feriados; configure regras reais de funcionamento numa evolução do calendário. Faixas já encerradas são bloqueadas em São Paulo. Uma faixa em andamento ainda pode ser selecionada: o sistema não verifica capacidade ou prazo de preparo.

Venda na loja e retirada não cobram frete. Entrega exige endereço e cidade atendida, cobrando a taxa configurada. Ocasião, mensagem, substituição e cuidados com o presente ficam nos campos expansíveis. O botão **Registrar pedido** cria um pedido aguardando pagamento, sem cobrar ou confirmar recebimento. O rascunho fica somente em memória; fechar pede confirmação quando há dados, e um novo PDV começa com os padrões iniciais. Não há controle financeiro de caixa, leitor de código de barras, suspensão de vendas, descontos nem produtos personalizados nesta versão.

## Ateliê de pedidos

Inspirado nas referências de operação enviadas pelo proprietário, adaptado à produção floral:

- Lista/cartões e pedido selecionado lado a lado no computador; disposição vertical no celular.
- Abas para andamento, pagamento, ateliê, prontos, entrega/retirada e histórico.
- Busca por nome, destinatário, telefone ou código; filtros por modalidade e data.
- Novo pedido manual com produtos do catálogo, quantidades e observações de cada item. Preço e frete são calculados no servidor; nomes e preços dos novos itens são preservados no pedido.
- Edição de cliente, destinatário, telefones, endereço, agendamento, ocasião, mensagem e orientações, preservando itens e valores. A modalidade não muda após a criação para não alterar silenciosamente o frete. Dados de entrega não podem mudar após expedição; pedidos encerrados ficam somente para consulta.
- Ocasião, cores/restrições do arranjo, autorização de substituição, cuidados com a surpresa, assinatura anônima e cartão.
- Conferência de arranjo, cartão e embalagem; florista e entregador responsáveis; observações internas.
- Histórico persistido, com data, etapa, identificação genérica de administrador e mudanças antes/depois nos dados e na produção. Login individual e identificação por funcionário ainda não existem.
- Impressão de ficha de produção e cartão separado. O cartão anônimo não inclui o nome do comprador; notas internas não saem no cartão.
- Links de mapa e WhatsApp abertos por ação do operador. Não existe envio automático nem roteirização.
- Exportação CSV das solicitações carregadas.

Use **Atualizar dados** para consultar mudanças feitas em outra tela. A versão de cada pedido é conferida pelo servidor antes de uma alteração. Se houver conflito, atualize e revise os dados antes de repetir a operação. Não há atualização automática contínua.

## Pagamento antecipado e etapas

Somente **PIX e cartão de crédito antecipados**. Não há gateway, QR Code, cobrança, consulta ao banco nem coleta de dados de cartão.

Um pedido começa **Aguardando pagamento**. No painel, o operador pode registrar o recebimento integral **manualmente**, depois de conferi-lo no banco/operadora, informando uma referência e marcando a confirmação. Isso não realiza nem verifica o pagamento e não deve ser usado com um comprovante não conferido. Referência, valor integral e horário são registrados no histórico. O cliente pelo site não pode se marcar como pago.

Após o registro:

- **Entrega agendada:** Agendado → Em preparação → Pronto → Saiu para entrega → Entregue.
- **Retirada agendada:** Agendado → Em preparação → Pronto → Esperando retirada → Retirado.

Para marcar como pronto, confira arranjo e embalagem; o cartão precisa ser conferido quando há mensagem. Para despachar, informe o entregador. Venda na loja segue Agendado → Em preparação → Pronto → Concluído na loja. Para pedidos **para agora**, a primeira etapa após registrar recebimento é **Recebido**, em vez de Agendado. Etapas não podem ser puladas. Alterar destinatário/assinatura/mensagem reinicia a conferência do cartão; mudar orientações do arranjo reinicia a conferência floral. Se estava pronto, o pedido volta a Em preparação para ser conferido novamente. Pedidos concluídos não podem ser reabertos nesta versão.

O cancelamento exige motivo. Se houver recebimento registrado, o sistema sinaliza a necessidade de verificar estorno, mas **não devolve dinheiro nem marca o pagamento como estornado**. O operador resolve a devolução fora do sistema.

## Frete, catálogo e limites atuais

A taxa única vale para as três cidades e pode ser alterada em **Configurações** entre R$ 0 e R$ 1.000. O novo valor é aplicado apenas aos novos pedidos, mantendo o frete original dos anteriores. Em SQL Server, a configuração persiste ao reiniciar; em demo, volta a R$ 20. O catálogo e suas ilustrações são exemplos; edição de catálogo e controle de estoque ainda não existem.

A consulta atual carrega até **200 pedidos recentes** no SQL Server. As abas, clientes, agenda, indicadores e CSV usam esse conjunto, indicado na tela; não são relatórios históricos completos. Filtro de data usa o agendamento, não a data de criação. O histórico da aba corresponde a pedidos encerrados presentes nesse conjunto. O PDV agenda por dia/faixa de horário; a loja pública mantém dia/período. Não há reserva de capacidade nem validação de feriados. Não há controle de estoque, reembolso integrado, fiscal, marketing nem roteirização automática.

Para vender publicamente ainda é necessário configurar HTTPS, acesso ao servidor web, disponibilidade, backup, privacidade/LGPD, catálogo real, regras de capacidade e autenticação por usuários com permissões. Iniciar localmente ou enviar ao GitHub não publica o site na internet.

## Verificação

```bat
npm test
```

Os testes exercitam autorização administrativa, preço imposto pelo servidor, cidades, frete/retirada, confirmação manual, bloqueio de pagamento forjado e duplicado, concorrência de versões, conferência do arranjo/cartão, responsáveis, fluxos distintos de entrega e retirada, cancelamento com estorno pendente, compatibilidade de pedidos antigos, agrupamento de clientes e datas em São Paulo.

Também foi validado em Chromium: cadastro/edição manual, confirmação de recebimento, checklist, preparo, retirada, cartão anônimo sem notas internas, abas, mudança de layout, acesso móvel e logout. Os testes de aplicação usam o modo demo; não substituem a validação de persistência no SQL Server instalado na máquina do proprietário.

A versão 1.2 também foi validada com 15 testes automatizados e fluxo Chromium do PDV: padrões iniciais, consumidor final, venda na loja, retirada agendada, entrega para agora, frete, cancelamento do diálogo de agendamento, retorno para agora, busca/seleção de cliente e produto, preservação na edição, descarte de rascunho e layout móvel. Os novos campos usam o JSON existente, sem mudança nas tabelas SQL.
