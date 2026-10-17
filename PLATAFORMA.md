# Plataforma de floriculturas

O modo `AUTH_MODE=multi` usa usuário e senha e separa as lojas no servidor. A empresa gestora é **Inova Facil Consultoria e Solucoes em Tecnologia Ltda - ME**, com login principal pelo CNPJ **53.770.070/0001-95** (com ou sem pontuação) e senha. O WhatsApp **(11) 96633-3900** é seu contato. O cadastro da empresa gestora é separado da loja **Floricultura Emoções Flores**, cujos dados antigos são preservados. O administrador principal usa o menu **Floriculturas** para gerenciar os estabelecimentos. O responsável de uma loja acessa somente a operação dessa loja.

## Atualizar uma instalação com SQL Server

1. Faça backup do banco atual e preserve `.env`, `.wwebjs_auth` e `.whatsapp-desk.json`. Pare o servidor.
2. Extraia o projeto atualizado e copie seu conteúdo para a instalação existente, preservando os arquivos privados acima. Preserve também `.tenants` em futuras atualizações.
3. Com o servidor parado, execute `npm run migrate:platform` na pasta atual do sistema. Ele usa as credenciais SQL do seu `.env`, confere o banco e verifica a preservação da quantidade de pedidos/clientes. A conta SQL precisa de permissão para alterar o esquema. Se a conta da aplicação não tiver essa permissão, no SSMS selecione **o banco atual** e execute `sql/multitenant.sql` com sua conta administrativa; não conceda privilégios permanentes extras à aplicação. O script não troca de banco: atribui os pedidos e clientes antigos à Floricultura Emoções Flores, preserva seus registros e cria as tabelas de lojas, usuários e sessões. Não execute os outros scripts de importação novamente em uma instalação já migrada.
4. No `.env`, mantenha `DATA_MODE=sqlserver` e as credenciais SQL atuais. Adicione `AUTH_MODE=multi` e `COOKIE_SECURE=false` para localhost. `ADMIN_TOKEN` deve conter uma chave privada de pelo menos 16 caracteres, preferencialmente 32 ou mais; ela serve somente para criar o primeiro administrador, não para entrar normalmente.
5. Execute `npm ci` e `npm start`. Se seu npm pedir aprovação do Puppeteer, execute `npm install-scripts approve puppeteer` e `npx puppeteer browsers install chrome` antes de iniciar. Preserve o caminho do Chrome instalado que já funciona em `WHATSAPP_BROWSER_PATH`.
6. Abra `/admin.html` e pressione Ctrl+F5. Na primeira configuração, informe a chave `ADMIN_TOKEN`, o nome da empresa gestora, o CNPJ de login já sugerido e uma senha com no mínimo 12 caracteres. Essa etapa só funciona enquanto não há usuário cadastrado. Depois, o acesso usa apenas usuário e senha.
7. Entre em **Floriculturas**. A **Floricultura Emoções Flores** já estará cadastrada com seus dados antigos; use **Criar acesso** nela para cadastrar o responsável pela operação dessa loja. O login principal da empresa gestora administra as lojas; para operar pedidos/WhatsApp, entre com o acesso da floricultura. Cadastre o nome completo da loja, endereço público (slug), informações de contato, região de entrega, nome da assistente e usuário/senha do responsável. Compartilhe essas credenciais por um canal privado. A loja pública terá o endereço `/loja/slug-da-loja`.

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
