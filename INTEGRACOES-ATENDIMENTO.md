# Atendimento multicanal — Inova Facil

A aplicação da Inova é cadastrada uma vez em cada provedor. Depois, cada floricultura autoriza sua própria página, Instagram ou caixa de e-mail nos botões do cabeçalho do Atendimento. Criar um aplicativo no Meta for Developers é diferente de instalar um plugin. Não é necessário criar um aplicativo para cada loja.

## Primeiro: endereço e proteção das contas

1. Use o domínio HTTPS em que o sistema será publicado. Em teste local, Google e Microsoft permitem redirects localhost cadastrados. Para Meta, prepare um endereço HTTPS público de desenvolvimento aceito pelo provedor. O SQL Server pode continuar local durante os testes, desde que o servidor da aplicação tenha acesso a ele.
2. No `.env` do servidor, configure `CHANNELS_PUBLIC_URL=https://seu-dominio` (somente origem, sem caminho) e `APP_ORIGIN` com a mesma origem pública. Em produção use `NODE_ENV=production` e `COOKIE_SECURE=true`.
3. Gere **uma vez**, no seu computador, a chave privada com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Copie a saída somente para `CHANNELS_ENCRYPTION_KEY` no `.env`; não envie a chave por chat nem inclua em ZIPs públicos.
4. Preserve a chave e a pasta privada `.tenants` nos backups. As autorizações são cifradas com AES-256-GCM e vinculadas à loja e ao canal. Trocar/perder a chave exige conectar novamente as contas; não apague os dados dos clientes para resolver isso.
5. Preencha as credenciais abaixo no `.env` e reinicie `npm start`. Elas não são inseridas na tela da floricultura e não são o `ADMIN_TOKEN`.

## Instagram e Facebook — passo a passo Meta

1. Entre em https://developers.facebook.com/ com o perfil que administra a Inova e conclua o cadastro de desenvolvedor.
2. Em **Meus aplicativos → Criar aplicativo**, escolha o caso de uso empresarial que permite mensagens do Messenger/Instagram. A Meta altera os nomes dessas opções; adicione os recursos de **Facebook Login para Empresas**, **Messenger** e **Instagram com Facebook Login**, conforme os produtos disponíveis para seu aplicativo.
3. Vincule o aplicativo ao portfólio empresarial da Inova. Em Configurações básicas, informe domínio, URL de política de privacidade, instruções/URL para exclusão de dados e contatos de suporte. Preencha os requisitos reais da sua empresa, não endereços fictícios.
4. Copie o **ID do aplicativo** para `META_APP_ID` e o **segredo do aplicativo** para `META_APP_SECRET`, apenas no servidor. Use `META_GRAPH_VERSION=v24.0` ou uma versão suportada pelo seu aplicativo que tenha sido homologada.
5. No Login do Facebook, cadastre **exatamente** estes redirects (troque o domínio):
   - `https://seu-dominio/api/channels/oauth/facebook/callback`
   - `https://seu-dominio/api/channels/oauth/instagram/callback`
6. Prepare uma **Página do Facebook** de teste. Para Instagram, use conta **profissional** e vincule-a a essa página. O perfil que autorizar precisa ter o acesso às tarefas de mensagens da página.
7. Adicione os perfis de teste como administradores/desenvolvedores/testadores do aplicativo e aceite os convites. Em desenvolvimento, contas comuns de clientes ainda não estarão liberadas.
8. O fluxo solicita `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic` e `instagram_manage_messages`. Solicite os acessos avançados aplicáveis e faça a análise do aplicativo pela Meta, apresentando uma gravação real da autorização, leitura e resposta no Atendimento. A Meta pode exigir verificação empresarial e outras etapas; a aprovação é dela.
9. Abra **Atendimento → Facebook · Conectar** ou **Instagram · Conectar**, autorize na janela da Meta e selecione a página da floricultura se houver mais de uma. Volte à aba do canal para ver as conversas.
10. Para comercializar a outras lojas, conclua a revisão, configure o aplicativo em produção e valide com uma página externa aos testadores. A conexão em desenvolvimento não prova liberação comercial.

O conector consulta conversas de mensagens privadas pela Graph API. Não usa comentários públicos como mensagens, não faz captura de senha do Instagram e não automatiza a página web. As respostas dependem das permissões, das janelas e das regras de mensagens da Meta. Atualização automática por consulta a cada 15 segundos enquanto o Atendimento está visível; esta versão não usa webhooks da Meta. Anexos e chamadas dos canais Meta não estão implementados nesta versão; o texto fica disponível no painel e o conteúdo não textual é identificado para consulta na origem.

## Gmail / Google Workspace

1. Em https://console.cloud.google.com/, crie/selecione o projeto da Inova e habilite a **Gmail API**.
2. Configure a tela de consentimento OAuth (marca, domínio, privacidade, contatos e público). Para clientes de outras empresas, use o público externo.
3. Crie credencial **Cliente OAuth → Aplicativo da Web**. Redirect: `https://seu-dominio/api/channels/oauth/gmail/callback` (ou o localhost exato cadastrado apenas em desenvolvimento).
4. Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`.
5. Cadastre os escopos `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` e `https://www.googleapis.com/auth/gmail.send`. Adicione testadores durante desenvolvimento.
6. Em **Atendimento → E-mail · Conectar**, escolha Gmail e autorize a caixa da loja. É necessário permitir acesso contínuo para o token de atualização.
7. Para distribuição comercial, conclua a verificação dos escopos exigida pelo Google. Leitura do Gmail pode exigir avaliação adicional de segurança. Contas de organizações podem precisar de liberação do administrador; tokens de apps externos em teste podem expirar rapidamente.

O painel lista até 30 conversas recentes (incluindo recebidas e enviadas), carrega até 80 mensagens por conversa e envia respostas em texto. Não altera a marcação de leitura do Gmail. Não exibe anexos nesta versão.

## Outlook / Microsoft 365

1. No https://entra.microsoft.com/, abra **Registros de aplicativo → Novo registro**. Para atender clientes de organizações diferentes e contas pessoais Outlook, selecione o tipo de conta que admite ambos.
2. Adicione plataforma **Web** com redirect `https://seu-dominio/api/channels/oauth/outlook/callback`.
3. Crie um segredo de cliente. Coloque o **ID do aplicativo (cliente)** em `MICROSOFT_CLIENT_ID` e o **valor do segredo**, não seu identificador, em `MICROSOFT_CLIENT_SECRET`.
4. Nas permissões delegadas do Microsoft Graph, adicione `User.Read`, `Mail.Read`, `Mail.Send` e `offline_access`. Conceda consentimento administrativo quando a organização exigir.
5. Reinicie o servidor e selecione Outlook no botão de e-mail do Atendimento. Autorize a caixa da floricultura.

São listadas as 60 mensagens recentes agrupadas por conversa, com até 80 mensagens ao abrir. Respostas são em texto. Regras organizacionais e políticas de consentimento continuam valendo. Anexos não são exibidos nesta versão.

## E-mail próprio — IMAP / SMTP

No botão de e-mail escolha **Servidor próprio**. Preencha e-mail, usuário, senha de aplicativo, servidor IMAP e servidor SMTP conforme a hospedagem da caixa.

- IMAP: porta 993, TLS obrigatório.
- SMTP: porta 465 (TLS) ou 587 (STARTTLS obrigatório).
- O certificado precisa ser válido. Hosts privados/locais são recusados para proteger o servidor compartilhado; cada conexão resolve e valida o IP e usa esse IP na conexão TLS, com validação do nome original.
- É necessária uma pasta identificada como **Enviados** (`\\Sent`) pelo servidor; ela recebe uma cópia da resposta enviada pelo painel.
- A conexão verifica login IMAP e SMTP, sem enviar e-mail de teste. A resposta só sai quando o atendente clicar em Enviar.
- As conversas são agrupadas pelo endereço do contato, consultando mensagens recentes de Entrada e Enviados. A lista examina 40 de cada pasta; ao abrir, examina até 200 de cada e exibe até 80 do contato. Mensagens acima de 8 MB não têm seu conteúdo carregado.

## Pedidos e isolamento

No WhatsApp, o telefone verificado identifica o comprador (não o destinatário). O painel consulta somente pedidos da floricultura autenticada, com paginação de 30, inclusive anteriores à lista operacional de 200. Não supõe que um identificador privado LID seja um telefone: consulta o vínculo fornecido pelo WhatsApp.

O pedido abre em uma janela sobre a conversa. **Novo pedido** abre o PDV sem trocar de tela e seleciona o cadastro quando há correspondência exata; sem cadastro, deixa o telefone na busca para cadastrar/selecionar. Salvar atualiza o histórico. O botão de informações recolhe/restaura a lateral e salva a preferência no navegador. O nome do menu é **Atendimento**.

Facebook, Instagram e e-mail não fornecem necessariamente um telefone. Sem número verificável o painel informa isso e não associa compras por semelhança de nome. O cadastro e a seleção de clientes continuam disponíveis no novo pedido. As sugestões de IA, anexos e áudio permanecem disponíveis no WhatsApp; os novos conectores trabalham com leitura e resposta de texto.

As conexões são privadas de cada loja. **Desconectar** remove a autorização armazenada localmente; não exclui mensagens no provedor. Para remover o consentimento do aplicativo inteiro, use as configurações de aplicativos autorizados no provedor, considerando outras conexões que utilizem o mesmo aplicativo.

## Validação e operação

Os conectores foram testados com respostas simuladas dos provedores, isolamento de lojas, proteção dos tokens e fluxos de interface. A homologação com contas reais depende dos aplicativos, permissões e credenciais da Inova e não foi feita na nuvem. O SQL Server local do usuário não foi acessado.

Esta instalação usa um processo Node e armazenamento privado no disco para autorizações e estados auxiliares. Para múltiplas instâncias na nuvem, mova o cofre e os estados de autorização para armazenamento compartilhado protegido antes de distribuir as requisições entre servidores. Não distribua pastas privadas da loja dentro do ZIP do programa.
