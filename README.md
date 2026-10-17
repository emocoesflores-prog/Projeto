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

`sql/schema.sql` cria `dbo.Orders` e `dbo.StoreSettings`, sem redefinir a taxa. A versão 1.3 adiciona o cadastro independente `dbo.Customers` por meio de **sql/customers.sql**. Execute os scripts no SSMS com uma conta autorizada a criar tabelas; para a instalação padrão o banco é `Floricultura`. O script de clientes contém `USE [Floricultura]`; se configurou outro banco, ajuste essa linha antes de executar. Depois, a conta da aplicação necessita apenas de SELECT, INSERT e UPDATE. Não é necessário conceder `db_ddladmin` à aplicação.

Em uma instalação nova, crie o banco, selecione-o no SSMS, execute `sql/schema.sql` e depois `sql/customers.sql`. Em uma instalação anterior à versão 1.3, execute somente `sql/customers.sql`. Se `dbo.Customers` já existe, a versão 1.4 não exige outro script nem alteração de tabelas. O aplicativo informa a ausência do cadastro caso você tente iniciar antes dessa etapa.

A versão 1.3 **adiciona uma tabela de clientes e não exige recriar o banco**. O script pode ser executado novamente: não apaga pedidos, não redefine clientes existentes e importa nomes/telefones válidos dos pedidos anteriores, agrupados pelo WhatsApp normalizado. Os campos dos pedidos, preços registrados, histórico e versão continuam usando a coluna JSON existente. Pedidos antigos continuam legíveis: histórico e preços individuais antigos não são inventados, e o total original é preservado. Alterações SQL usam transação com bloqueio da linha e conferência de versão para evitar sobrescrever uma operação feita em outra tela.

O proprietário confirmou a conexão da primeira versão com seu SQL Server local. Os novos fluxos desta atualização foram testados em demonstração neste ambiente; a persistência dessas novas operações ainda deve ser conferida na máquina do proprietário. O SQL Server local não é acessível automaticamente pela nuvem. Não exponha a porta do banco à internet.

## PDV · Novo pedido

O botão **Novo pedido** abre uma tela de PDV com catálogo à esquerda e resumo da venda à direita. Há busca por nome, categoria ou código do produto, categorias, adição rápida, quantidades, observação por item e totais calculados no servidor.

Os três primeiros campos do resumo são:

1. **Cliente:** busca por nome ou WhatsApp no cadastro do banco, com navegação por teclado. A opção **Novo cliente** abre cadastro separado, aproveitando o texto digitado. Somente nome e WhatsApp são obrigatórios. Venda na loja continua aceitando consumidor final, desde que a busca esteja limpa.
2. **Modalidade:** Venda na Loja (padrão), Retirada, Entrega.
3. **Atendimento:** Pedido para agora (padrão), Realizar agendamento.

Cliente é quem compra. O destinatário do presente fica em outro campo: selecionar o comprador não preenche automaticamente o endereço nem o nome de quem recebe. Retirada e entrega exigem selecionar um cliente cadastrado no PDV e informar destinatário; entrega exige endereço e cidade atendida.

**Pedido para agora** não reserva hora e recebe data/período do servidor no fuso de São Paulo. **Realizar agendamento** abre uma janela para escolher dia e faixa; Cancelar/fechar preserva a escolha anterior e a ação “É um pedido para agora?” remove o agendamento. O seletor oferece os próximos 90 dias. As faixas iniciais, seguindo as referências fornecidas, são 09:10–10:50, 10:50–12:30, 13:40–15:20, 15:20–17:00 e 17:00–18:40, compartilhadas em `public/order-options.js`. Não se presume fechamento aos domingos/feriados; configure regras reais de funcionamento numa evolução do calendário. Faixas já encerradas são bloqueadas em São Paulo. Uma faixa em andamento ainda pode ser selecionada: o sistema não verifica capacidade ou prazo de preparo.

Venda na loja e retirada não cobram frete. Entrega exige endereço e cidade atendida, cobrando a taxa configurada. Ocasião, mensagem, substituição e cuidados com o presente ficam nos campos expansíveis. O botão **Registrar pedido** cria um pedido aguardando pagamento, sem cobrar ou confirmar recebimento. O rascunho fica somente em memória; fechar pede confirmação quando há dados, e um novo PDV começa com os padrões iniciais. Não há controle financeiro de caixa, leitor de código de barras, suspensão de vendas, descontos nem produtos personalizados nesta versão.

## Cadastro de clientes

O menu **Clientes** consulta os cadastros do banco, independentemente de terem pedidos. No PDV, pesquise por nome (sem diferenciar acentos/maiúsculas) ou telefone parcial/formatado e selecione o resultado. A lista retorna até 20 resultados por consulta em toda a tabela; refine a busca quando necessário. Não existe limite vinculado aos 200 pedidos carregados no painel.

**Novo cliente** pode ser aberto pelo PDV ou pelo menu Clientes. Nome (mínimo de 3 caracteres) e WhatsApp brasileiro com DDD são os únicos campos obrigatórios. E-mail, nascimento, gênero, CEP, endereço, preferências de flores/presentes e notas internas são opcionais; se preenchidos, têm validação de formato. O telefone é normalizado com prefixo 55 e protegido por restrição única no banco. O sistema valida o formato, mas não verifica se existe uma conta ativa no WhatsApp.

Depois de salvar pelo PDV, o cadastro é selecionado automaticamente sem perder o carrinho ou o agendamento. O novo pedido guarda `customerId` e uma cópia do nome/telefone recuperados pelo servidor. A busca não usa os dados dos últimos pedidos, e falhas de rede não são tratadas como cliente inexistente. Notas e dados opcionais não aparecem na lista resumida; o perfil completo é acessível somente na área administrativa. O perfil principal pode ser consultado; edição/exclusão dos dados principais ainda não foram implementadas. Os endereços de entrega e destinatários podem ser cadastrados e editados pela janela de entregas, mantendo histórico. Alterar um pedido não altera automaticamente o cadastro do comprador nem o histórico de outros pedidos.

No SQL Server, a tabela `dbo.Customers` mantém identidade, nome, telefone único e os opcionais em JSON. Em demo, esse cadastro é independente e fica em memória, sendo perdido ao reiniciar. O script de importação recupera contatos válidos de pedidos antigos sem modificar esses pedidos. Cadastros futuros de clientes feitos apenas na loja pública não são automaticamente incorporados ao diretório nesta versão; o operador pode cadastrá-los pelo painel. As rotas de cadastro e busca exigem ADMIN_TOKEN. Não existem envios automáticos pelo WhatsApp.

## Entregas: endereços e destinatários por cliente

A versão 1.4 aplica máscara aos telefones e CEPs durante a digitação. Telefone brasileiro é exibido como `(11) 99999-9999` ou `(11) 9999-9999`; o cadastro continua normalizado com prefixo 55 no servidor.

Depois de escolher o cliente no PDV, selecionar **Entrega** abre a janela de entrega. Ela lista os endereços salvos desse comprador ou permite adicionar outro. Cada endereço pode ter uma identificação (ex.: Casa da mãe, Trabalho), CEP, rua, **número obrigatório**, bairro, complemento, referência, cidade/UF e **nome e telefone de quem recebe o presente**. Número precisa conter ao menos um dígito. Rua, bairro, CEP, cidade atendida e os contatos do destinatário são validados também no servidor. Complemento, referência e identificação são opcionais.

Ao digitar um CEP completo, o servidor consulta **https://viacep.com.br** para preencher rua, bairro, cidade e UF. Só o CEP é enviado ao provedor, não nomes ou telefones. A máquina que executa o Node precisa de acesso HTTPS a esse domínio; não há chave de API. CEP inválido, serviço indisponível ou campos vazios retornados pelo provedor são informados na tela, permitindo preencher os campos manualmente. A consulta não localiza número e complemento. Uma resposta atrasada não substitui outro CEP nem campos que o operador está digitando manualmente. Não é uma validação geográfica da existência do imóvel e não altera a área atendida: Mauá, Santo André e Ribeirão Pires/SP.

Use **Novo endereço** para cadastrar outro destino, **Editar** para alterar o mesmo endereço e **Histórico** para consultar as versões anteriores. Endereços diferentes podem ter destinatários diferentes. Salvar pelo PDV seleciona o endereço para aquela compra. Cancelar preserva o cadastro e a seleção anteriores; cancelar a primeira entrega volta à modalidade anterior. É possível gerenciar esses endereços também pelo perfil do cliente em **Clientes → Ver cadastro → Gerenciar endereços e destinatários**.

**Histórico preservado:** todos os endereços ficam no cadastro, sem exclusão pela interface. Cada edição mantém data/hora, ator genérico Administrador e os valores antes/depois, sem truncar versões antigas. O pedido guarda uma cópia do endereço e destinatário escolhidos, com identificador e versão. Editar o cadastro para uma compra futura não altera pedidos anteriores. Uma edição específica nos dados de um pedido permanece no histórico daquele pedido e não muda o cadastro de destinos. Se o endereço foi alterado em outra tela antes de finalizar o pedido, a versão é conferida e o operador precisa revisar a escolha.

Os endereços e suas versões usam o JSON de `dbo.Customers`; pedidos usam o JSON já existente de `dbo.Orders`. As atualizações do cadastro usam transação e bloqueio da linha para preservar outros endereços do mesmo cliente. **Não há nova migração SQL nesta versão** para quem já executou `sql/customers.sql`. Em demonstração, endereços/históricos também ficam em memória e somem ao reiniciar. O diretório de destinos é administrativo e não é exposto a compradores anônimos da loja pública. O checkout público continua como pedido de visitante sem acesso ao catálogo privado de endereços; a máscara também funciona nele.

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

A consulta de pedidos carrega até **200 pedidos recentes** no SQL Server. As abas de pedidos, agenda, indicadores e CSV usam esse conjunto, indicado na tela; não são relatórios históricos completos. Filtro de data usa o agendamento, não a data de criação. O histórico da aba corresponde a pedidos encerrados presentes nesse conjunto. O PDV agenda por dia/faixa de horário; a loja pública mantém dia/período. Não há reserva de capacidade nem validação de feriados. Não há controle de estoque, reembolso integrado, fiscal, marketing nem roteirização automática.

Para vender publicamente ainda é necessário configurar HTTPS, acesso ao servidor web, disponibilidade, backup, privacidade/LGPD, catálogo real, regras de capacidade e autenticação por usuários com permissões. Iniciar localmente ou enviar ao GitHub não publica o site na internet.

## Verificação

```bat
npm test
```

Os testes exercitam autorização administrativa, preço imposto pelo servidor, cidades, frete/retirada, confirmação manual, bloqueio de pagamento forjado e duplicado, concorrência de versões, conferência do arranjo/cartão, responsáveis, fluxos distintos de entrega e retirada, cancelamento com estorno pendente, compatibilidade de pedidos antigos, agrupamento de clientes e datas em São Paulo.

Também foi validado em Chromium: cadastro/edição manual, confirmação de recebimento, checklist, preparo, retirada, cartão anônimo sem notas internas, abas, mudança de layout, acesso móvel e logout. Os testes de aplicação usam o modo demo; não substituem a validação de persistência no SQL Server instalado na máquina do proprietário.

A versão anterior 1.2 foi validada com 15 testes automatizados e fluxo Chromium do PDV: padrões iniciais, consumidor final, venda na loja, retirada agendada, entrega para agora, frete, cancelamento do diálogo de agendamento, retorno para agora, busca/seleção de cliente e produto, preservação na edição, descarte de rascunho e layout móvel. Os novos campos usam o JSON existente, sem mudança nas tabelas SQL.

A versão 1.3 tem 19 testes automatizados, incluindo cadastro obrigatório/opcional, busca por nome/telefone, normalização/duplicidade, cliente sem pedido, autenticação e vínculo entre cliente e pedido. Foram testados no Chromium o novo fluxo de busca/cadastro, preenchimento só dos obrigatórios, perfil completo, seleção por teclado, inversão dos campos, preservação do carrinho, erro de busca e telas móveis. **A migração SQL desta versão não foi executada na máquina do proprietário por este ambiente**; execute o script no SSMS e confira cadastro/busca após reiniciar o sistema para validar sua persistência local.

A versão 1.4 tem 25 testes automatizados e validação Chromium de máscaras, popup, número obrigatório, destinatário, múltiplos endereços, seleção em próxima compra, edição, histórico, preservação dos pedidos anteriores, isolamento entre clientes e telas móveis. O preenchimento de CEP foi testado com respostas simuladas do formato ViaCEP, incluindo falha e resposta atrasada. O acesso real ao ViaCEP nesta nuvem respondeu 403/indisponível; foi adicionada a exigência de domínio ao rascunho do ambiente, sem presumir aplicação/publicação. A consulta real de CEP e a persistência SQL devem ser conferidas na máquina local do proprietário após a atualização.

## Atendimento WhatsApp Web

O menu **Atendimento WhatsApp** permite conectar um número por QR Code, listar até 100 conversas individuais, consultar as últimas 50 mensagens de uma conversa e enviar texto (até 4.000 caracteres). As conversas são atualizadas a cada cinco segundos enquanto essa tela está aberta. Grupos, envio de anexos, filas e múltiplos atendentes não estão implementados. Não há respostas automáticas nem vínculo automático com pedidos/clientes.

Após baixar esta versão atualizada, execute `npm ci` com Node.js 24. A instalação do Puppeteer baixa o Chrome necessário; se a instalação tiver usado `PUPPETEER_SKIP_DOWNLOAD=true`, execute `npx puppeteer browsers install chrome` ou configure `WHATSAPP_BROWSER_PATH` com o caminho de um Chrome/Chromium instalado. Linux precisa das bibliotecas de sistema e de um sandbox Chromium funcional. A nuvem usada nesta implementação tem Chromium com sandbox incompatível; a conexão real não foi validada nela.

Execute `npm start`, abra o painel administrativo, entre com seu `ADMIN_TOKEN`, escolha **Atendimento WhatsApp → Conectar WhatsApp** e escaneie o QR em **WhatsApp no celular → Aparelhos conectados → Conectar aparelho**. Aguarde o estado conectado, selecione uma conversa e envie uma mensagem. **Desconectar aparelho** encerra a sessão. Sair do painel apenas encerra o acesso ao painel; a sessão do WhatsApp continua no servidor.

A sessão é guardada em `.wwebjs_auth/` e o cache em `.wwebjs_cache/`, ignorados pelo Git. Esses arquivos concedem acesso à conta: mantenha-os privados e fora de downloads e backups públicos. Use um servidor privado confiável; proteja o painel com HTTPS ao acessar pela rede. O servidor precisa de acesso HTTPS ao WhatsApp Web e seus serviços (`web.whatsapp.com`, `*.whatsapp.com`, `*.whatsapp.net`); uma política de rede restrita pode bloquear a conexão.

Esta integração usa `whatsapp-web.js`, não é uma API oficial da Meta e pode parar de funcionar com alterações do WhatsApp ou sofrer restrições da plataforma. A suíte automatizada valida serviço e rotas com cliente simulado; recebimento e envio reais precisam ser conferidos após conectar uma conta pelo QR Code. Se um envio falhar, confira no celular antes de reenviar para evitar duplicatas.

### Correção das dependências do navegador

O projeto fixa Puppeteer 25.14.0 por `overrides` para substituir a versão 24.38.0 exigida pela biblioteca WhatsApp, cuja cadeia de download inclui `extract-zip` e `basic-ftp` vulneráveis. Esta combinação requer Node.js 24 conforme o restante do projeto. A instalação limpa, os 27 testes e o carregamento CommonJS/Client/LocalAuth e APIs de inicialização do Chromium foram verificados. A conexão com conta real continua pendente pelos bloqueios de rede e sandbox documentados acima. Não use `npm audit fix --force`: a sugestão observada rebaixava o WhatsApp para 1.34.2.

No Windows, após baixar esta atualização, preserve seu `.env` e execute na pasta do projeto:

```bat
npm ci
npm install-scripts approve puppeteer
npx puppeteer browsers install chrome
npm audit
npm start
```

O comando `install-scripts approve` aplica-se ao npm que apresenta essa solicitação de aprovação; versões sem esse comando não precisam dessa etapa. A instalação explícita do Chrome é útil quando o download automático foi bloqueado. Nesta atualização, `npm audit` retornou zero vulnerabilidades conhecidas. Os avisos de descontinuação de `glob` e `fluent-ffmpeg` ainda vêm de dependências transitivas e não significam falha de instalação. Atualizações futuras podem mudar o resultado da auditoria.

### Sessão vinculada que fica iniciando

A sessão salva pode ser restaurada sem um novo QR Code. A configuração usa a página atual do WhatsApp Web (`webVersionCache: none`) e a identificação real do Chrome (`userAgent: false`), evitando reutilizar HTML antigo e o identificador Chrome 101 padrão da biblioteca. Isso não apaga `.wwebjs_auth` nem desconecta o celular.

Para diagnosticar no Windows, pare o servidor com Ctrl+C, acrescente `WHATSAPP_HEADLESS=false` ao `.env` existente e execute `npm start`. Clique em Conectar WhatsApp e examine a janela do Chrome aberta pelo sistema. Não abra manualmente outra janela com o mesmo perfil. Informe apenas o texto da tela; não compartilhe QR Codes, mensagens ou dados de clientes. Após a correção, volte a `WHATSAPP_HEADLESS=true` e reinicie o servidor. A autenticação também tem limite de espera; excedê-lo fecha o navegador sem executar logout nem apagar a sessão. As verificações automatizadas não substituem o teste com uma conta real.
