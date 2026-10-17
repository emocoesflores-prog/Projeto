# Três acessos separados

- **Gestão Inova Facil:** `/inova.html` — cadastro de floriculturas e gestão de seus acessos; login da Inova por CNPJ e senha.
- **Painel de cada floricultura:** `/painel/<slug>` — pedidos, clientes, catálogo, configurações e atendimento WhatsApp, com usuário/senha da própria loja.
- **Site público de cada floricultura:** `/loja/<slug>` — catálogo e pedidos dos clientes.

Para a Floricultura Emoções Flores, use `/painel/emocoes-flores` e `/loja/emocoes-flores`. Outras lojas recebem seus próprios links pelo endereço (slug) definido no cadastro. A gestão mostra ambos os links em cada loja. O atalho antigo `/admin.html` continua disponível e encaminha o usuário autenticado para o painel da própria loja.

As sessões da Inova e da floricultura usam cookies separados: podem permanecer abertas em abas diferentes, com saída independente. Um usuário de loja não entra pela gestão da Inova; o acesso da Inova não entra pela página operacional. Nos links individuais, o login e as requisições conferem a loja indicada no endereço.

Esta atualização de páginas e sessões não muda o esquema do banco. Quem já aplicou a migração da versão 2.0 não precisa executá-la novamente, e os usuários/senhas existentes continuam válidos.

# Plataforma de floriculturas

O modo `AUTH_MODE=multi` usa usuário e senha e separa as lojas no servidor. A empresa gestora é **Inova Facil Consultoria e Solucoes em Tecnologia Ltda - ME**, com login principal pelo CNPJ **53.770.070/0001-95** (com ou sem pontuação) e senha. O WhatsApp **(11) 96633-3900** é seu contato. O cadastro da empresa gestora é separado da loja **Floricultura Emoções Flores**, cujos dados antigos são preservados. O administrador principal usa o menu **Floriculturas** para gerenciar os estabelecimentos. O responsável de uma loja acessa somente a operação dessa loja.

## Atualizar uma instalação com SQL Server

1. Faça backup do banco atual e preserve `.env`, `.wwebjs_auth` e `.whatsapp-desk.json`. Pare o servidor.
2. Extraia o projeto atualizado e copie seu conteúdo para a instalação existente, preservando os arquivos privados acima. Preserve também `.tenants` em futuras atualizações.
3. Com o servidor parado, execute `npm run migrate:platform` na pasta atual do sistema. Ele usa as credenciais SQL do seu `.env`, confere o banco e verifica a preservação da quantidade de pedidos/clientes. A conta SQL precisa de permissão para alterar o esquema. Se a conta da aplicação não tiver essa permissão, no SSMS selecione **o banco atual** e execute `sql/multitenant.sql` com sua conta administrativa; não conceda privilégios permanentes extras à aplicação. O script não troca de banco: atribui os pedidos e clientes antigos à Floricultura Emoções Flores, preserva seus registros e cria as tabelas de lojas, usuários e sessões. Não execute os outros scripts de importação novamente em uma instalação já migrada.
4. No `.env`, mantenha `DATA_MODE=sqlserver` e as credenciais SQL atuais. Adicione `AUTH_MODE=multi` e `COOKIE_SECURE=false` para localhost. `ADMIN_TOKEN` deve conter uma chave privada de pelo menos 16 caracteres, preferencialmente 32 ou mais; ela serve somente para criar o primeiro administrador, não para entrar normalmente.
5. Execute `npm ci` e `npm start`. Se seu npm pedir aprovação do Puppeteer, execute `npm install-scripts approve puppeteer` e `npx puppeteer browsers install chrome` antes de iniciar. Preserve o caminho do Chrome instalado que já funciona em `WHATSAPP_BROWSER_PATH`.
6. Abra `/inova.html` para a gestão da Inova Facil e pressione Ctrl+F5. Na primeira configuração, informe a chave `ADMIN_TOKEN`, o nome da empresa gestora, o CNPJ de login já sugerido e uma senha com no mínimo 12 caracteres. Essa etapa só funciona enquanto não há usuário cadastrado. Depois, o acesso usa apenas usuário e senha.
7. Entre em **Floriculturas**. A **Floricultura Emoções Flores** já estará cadastrada com seus dados antigos; use **Criar acesso** nela para cadastrar o responsável pela operação dessa loja. O login principal da empresa gestora administra as lojas; para operar pedidos/WhatsApp, entre com o acesso da floricultura. Cadastre o nome completo da loja, endereço público (slug), informações de contato e endereço com CEP, nome da assistente e usuário/senha do responsável. Compartilhe essas credenciais por um canal privado. A loja pública terá o endereço `/loja/slug-da-loja`.

A conta SQL usada pelo aplicativo precisa de SELECT/INSERT/UPDATE nas tabelas e DELETE em `dbo.AppSessions`, para revogar sessões; o usuário que aplica a migração pode ser diferente do usuário da aplicação. Não é preciso manter permissão de alteração do esquema no aplicativo.

O administrador principal pode editar dados, suspender/reativar lojas e redefinir a senha de seus responsáveis. Suspensão e redefinição invalidam as sessões anteriores daquela loja. O responsável também pode alterar o nome da própria assistente em **Configurações**. **Florzinha** é o nome da assistente da Floricultura Emoções Flores; as outras lojas escolhem seus próprios nomes.

## Separação e acesso

- Pedidos, clientes, endereços e consultas SQL recebem o identificador da loja a partir da sessão autenticada, e não de campos enviados pelo navegador. O mesmo telefone pode ser cadastrado em lojas diferentes.
- Configurações e a cópia inicial do catálogo pertencem à loja. A loja pública resolve sua identidade pelo slug; isso não concede acesso administrativo.
- Cada loja tem seu próprio serviço e perfil do WhatsApp e seu arquivo de anotações. A sessão existente da Floricultura Emoções Flores continua na pasta original. Outras lojas usam `.tenants/<identificador>/`.
- Senhas usam scrypt com sal individual. O navegador recebe um cookie de sessão HttpOnly/SameSite, não o hash da senha. As sessões expiram em oito horas e podem ser encerradas pelo botão Sair. Operações administrativas exigem proteção CSRF.
- A configuração da API de IA permanece no servidor (`FLORZINHA_API_KEY` / `FLORZINHA_MODEL`, nomes preservados por compatibilidade). A chave é da plataforma; as sugestões usam a identidade e o histórico da loja solicitante. O envio das respostas continua manual, após revisão.
- Desktop, celular e tablet usam as mesmas rotas autenticadas. O menu pode expandir/recolher; em telas estreitas ele sobrepõe o conteúdo. Formulários e atendimento adaptam sua disposição ao espaço disponível.

## Publicação

O modo demo é somente para testes: usuários, lojas, pedidos e cadastros em memória somem ao reiniciar. Use SQL Server para persistência. Este código opera em uma instância Node com armazenamento local persistente para os perfis do WhatsApp; não execute várias instâncias compartilhando os mesmos perfis. Cada navegador do WhatsApp consome recursos próprios, portanto dimensione e teste o servidor para a quantidade de lojas pretendida.

Na internet, configure HTTPS, `NODE_ENV=production`, `COOKIE_SECURE=true` e `APP_ORIGIN` com a origem pública exata, por exemplo `https://painel.suaempresa.com.br`. A aplicação recusa iniciar em produção sem cookies seguros. Mantenha `.env`, `.tenants`, perfis do WhatsApp e backups fora da publicação estática e do Git.

`AUTH_MODE=legacy` conserva explicitamente o acesso antigo por chave, para instalações que ainda não migraram. Ele não oferece múltiplas lojas e não deve ser usado para comercializar acessos separados.

## Validação desta entrega

A suíte automatizada cobre login, autorização, CSRF, cadastro de lojas, separação de pedidos/clientes/endereços/configurações e recursos WhatsApp, nomes da IA, suspensão e invalidação das sessões. O navegador foi exercitado em sete resoluções, de 360 a 1920 pixels. A validação com SQL Server real não pôde ser executada neste ambiente: o download da imagem de teste foi recusado pelo registro. O usuário autorizou aplicar a migração no banco em uso e confirmou ter backup. A execução permanece pendente no computador Windows onde está o SQL Server; este ambiente não tem acesso a ele.

## Cadastro e entregas (2.1)

Na gestão Inova, **Editar** permite alterar nome do responsável, usuário e senha. Uma senha em branco mantém a existente; lojas sem acesso exigem uma senha inicial. Alterações de credenciais revogam as sessões daquela loja. Alterações só de endereço ou contato preservam o acesso. O CEP consulta ViaCEP com cancelamento de consultas antigas, preserva alterações manuais e permite preencher manualmente quando o serviço está indisponível.

No painel da própria floricultura, **Entregas → Taxa de Entrega** cadastra cidade, bairro e valor. Bairro em branco define a taxa geral da cidade; uma regra de bairro específico tem prioridade. Sem regra geral, apenas os bairros cadastrados são atendidos. A aba **Retirada na loja** guarda o endereço de retirada. Essas informações não ficam no formulário da Inova. Lojas novas precisam configurar sua área antes de oferecer entrega; lojas existentes mantêm a configuração anterior até salvar as novas regras. Salvar uma lista vazia desativa as entregas do site, mantendo retirada disponível.

O servidor calcula o frete dos novos pedidos pelo endereço selecionado; o site e o PDV exibem a mesma cotação. Valores de pedidos existentes não são recalculados. Tudo permanece separado por floricultura, nos campos JSON já existentes, sem nova migração SQL para quem já usa a versão 2.0.

## Financeiro da Inova

**Financeiro** é vinculado ao cadastro de cada floricultura e também pode ser aberto pelo botão **Financeiro** no cartão da loja. Registre descrição, valor e vencimento de cada cobrança. A confirmação é manual após conferir o recebimento: data, forma de pagamento e referência ficam no histórico, com identificação do administrador. Cobranças pendentes podem ser canceladas com motivo; pagamentos confirmados não são apagados nem confirmados duas vezes. Não há integração bancária ou geração automática recorrente de mensalidades nesta versão.

A regra de inadimplência é individual: bloquear somente o painel, somente o site ou ambos. O bloqueio automático pode ser desabilitado por loja. Uma cobrança vence até o fim do dia no horário de Brasília; fica vencida no dia seguinte. Cada solicitação protegida verifica a situação atual, inclusive sessões abertas. O painel verifica o acesso a cada 10 segundos enquanto visível e ao receber foco, limpando a operação caso o painel esteja bloqueado e restaurando a sessão válida após regularização. Quando o site é a área bloqueada, uma mensagem de indisponibilidade temporária substitui a vitrine e o servidor impede novos pedidos. A situação financeira não é exposta ao visitante.

A confirmação dos pagamentos libera a área configurada quando não restam vencimentos pendentes; uma suspensão manual não é revertida pelo financeiro. Outras lojas e a conta da Inova não são bloqueadas por dívidas de uma floricultura. Valores e histórico financeiro não são enviados ao site público nem ao login da floricultura. Os registros usam o JSON privado do cadastro no SQL Server, com transação e bloqueio de linha para evitar confirmações concorrentes; não há nova alteração de esquema SQL para instalações da plataforma 2.0. O SQL Server do computador Windows não é acessível neste ambiente de desenvolvimento: a validação automatizada usa o modo demonstração, além das verificações de consulta existentes.

## Cidades, bairros, retiradas e desempenho (2.2)

**Entregas → Taxa de Entrega** usa campos pesquisáveis: cidade com UF, seguida dos bairros dessa cidade. A lista local tem 5.571 registros de municípios e códigos IBGE; sua origem/licença está em `data/README.md`. Bairros são sugestões consultadas no OpenStreetMap via Overpass, com cache e cobertura variável. Não são distritos do IBGE. Permanece possível digitar manualmente quando a fonte está incompleta ou indisponível. A consulta externa de bairros não pôde ser validada nesta nuvem devido a bloqueio de rede do provedor; os testes exercitam a resposta, cache, falhas e fluxo no navegador com dados simulados. O servidor em produção precisa alcançar `overpass-api.de` por HTTPS; o navegador não faz a consulta externa diretamente.

Em **Retirada na loja**, cadastre até 20 locais com nome, CEP, rua, número, bairro, complemento, cidade, UF e orientações. O CEP usa ViaCEP e preserva campos alterados manualmente enquanto aguarda a consulta. O primeiro local é o principal; o botão **Definir como principal** muda essa ordem. O endereço antigo permanece disponível para atualização por CEP. Site e PDV permitem selecionar a unidade. O pedido guarda uma cópia da unidade escolhida; alterar/remover um local depois não reescreve o endereço do pedido antigo.

**Desempenho** tem nove análises: Vendas, Clientes, Base de clientes, Catálogo, Produtos, Entregas, Descontos, Cancelamentos e Visão geral estabelecimentos. O período pode ser 7, 30 ou 90 dias ou personalizado (até 366 dias), sempre pela data de criação do pedido no horário de Brasília. Valor pago exclui cancelados e considera a confirmação atual de recebimento. O cadastro de clientes e catálogo mostram a base atual, com novos clientes no período separados. Produtos vendidos usam os preços gravados nos itens; valores antigos ausentes não são estimados. Descontos exibem a ausência de registro porque esta versão não possui lançamentos de descontos. A visão geral mostra apenas a própria floricultura e suas unidades de retirada.

A análise consulta até 5.000 pedidos do período, separadamente do limite de 200 da tela operacional. Ao atingir o limite, exibe um aviso para reduzir o período. A base cadastral é agregada no banco. Todas as consultas privadas são limitadas à loja autenticada. Não é necessário aplicar outra migração SQL para instalações da plataforma 2.0 ou 2.1; o SQL Server local do Windows não é acessível a partir desta nuvem.

## Visual e tema global (2.3)

Os painéis da floricultura e da Inova usam o mesmo conjunto de cores, fontes, botões, ícones, campos, tabelas e janelas, inspirado no atendimento WhatsApp. O botão de tema fica no cabeçalho de todas as telas e também no atendimento e no PDV. A preferência vale para todas as telas administrativas, é salva neste navegador e sincronizada entre abas abertas na mesma origem. A preferência anterior de tema do atendimento é reaproveitada. Sem preferência salva, o painel inicia no tema escuro. O site público mantém sua apresentação própria.

Na visão geral, ações rápidas abrem novo pedido, atendimento ou cadastro de cliente. Estados de foco, seleção e passagem do mouse seguem o mesmo padrão; as animações respeitam a opção de redução de movimento do dispositivo. Os layouts foram verificados nos dois temas, incluindo janelas e diferentes resoluções. Não há alteração de banco, credenciais ou regras de faturamento nesta atualização.

## Paleta e leitura (2.3.1)

A identidade administrativa usa azul, branco e cinza no tema claro, e azul com cinzas escuros no tema escuro. A escala de leitura usa corpo e campos de 16 px, botões de 15 px, dados densos de 14–15 px e informações auxiliares de 13–14 px. Menus expandidos usam 16 px. Cores de alerta e cancelamento continuam distintas. A preferência global de tema é preservada. Não há alteração no banco.
