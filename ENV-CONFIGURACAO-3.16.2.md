# Configuração do ambiente — versão 3.16.2

Foram conferidas as 32 variáveis lidas pelo aplicativo. O arquivo [.env.local-sqlserver.example](.env.local-sqlserver.example) é o modelo completo para a instalação que roda em `http://localhost:3000` com SQL Server. O [.env.example](.env.example) contém as mesmas variáveis, com demonstração como ponto de partida.

O arquivo real chama-se `.env`, fica na pasta do `package.json` e não é incluído no repositório. Não sobrescreva seus valores existentes ao copiar exemplos. Senhas, aplicativos OAuth, caminhos personalizados e chaves precisam corresponder à instalação real.

## Instalação atual no computador

- `NODE_ENV=development`, `COOKIE_SECURE=false` e `APP_ORIGIN=http://localhost:3000` correspondem ao painel acessado por localhost.
- `DATA_MODE=sqlserver` mantém os pedidos no banco. O modo `demo` não persiste os pedidos.
- `AUTH_MODE=multi` mantém as floriculturas e os atendentes com acessos separados.
- Copie `ADMIN_TOKEN`, `SQL_HOST`, `SQL_PORT`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD` e `SQL_TRUST_CERTIFICATE` do ambiente que já funciona. Os nomes do banco e do usuário nos exemplos são referências, não dados descobertos no seu SQL Server.
- Senhas e valores com `#`, espaços ou outros caracteres especiais devem ficar entre aspas. Para caminhos Windows personalizados, prefira barras `/`, por exemplo `C:/dados/inova/fotos`.
- Se abrir o painel por `127.0.0.1` ou por outra porta, ajuste APP_ORIGIN para a origem exata usada no navegador.

## Todas as variáveis

| Variável | Uso |
| --- | --- |
| NODE_ENV | development no localhost; production na publicação HTTPS. |
| PORT | Porta HTTP do servidor Node; padrão 3000. |
| DATA_MODE | sqlserver para banco real; demo para demonstração sem persistência. |
| AUTH_MODE | multi para plataforma com usuários individuais; legacy para instalação antiga. |
| ADMIN_TOKEN | Chave inicial do administrador, mínimo de 16 caracteres. Preserve a atual. Não é a senha dos atendentes. |
| SQL_HOST | Host do SQL Server que o aplicativo já utiliza. |
| SQL_PORT | Porta TCP do SQL Server; padrão 1433. |
| SQL_DATABASE | Nome do banco existente. |
| SQL_USER | Login SQL da aplicação. |
| SQL_PASSWORD | Senha do login SQL. |
| SQL_TRUST_CERTIFICATE | false valida o certificado; true aceita certificado não confiável de um servidor conhecido. TLS permanece habilitado no código. Preserve o valor compatível com sua instalação. |
| COOKIE_SECURE | false em HTTP local; true em HTTPS público. |
| APP_ORIGIN | Origem exata do painel, sem caminho; valida a origem na autenticação. |
| PLATFORM_PUBLIC_URL | Endereço HTTPS da plataforma; padrão https://inovafacil.com.br. |
| WHATSAPP_BROWSER_PATH | Executável Chrome/Chromium existente; vazio usa o navegador do Puppeteer. |
| WHATSAPP_SHOW_BROWSER | false oculta a janela; true mostra apenas para diagnóstico. |
| FLORZINHA_API_KEY | Chave de IA padrão do servidor, opcional. Cada loja também pode salvar sua chave no painel. |
| FLORZINHA_MODEL | Modelo da IA; padrão gpt-4.1-mini. |
| ORS_API_KEY | Chave padrão OpenRouteService para cálculo rodoviário, opcional; a loja pode ter chave própria no painel. |
| CHANNELS_PUBLIC_URL | Origem do retorno OAuth. Deve ser o endereço público exato em produção. |
| CHANNELS_ENCRYPTION_KEY | Chave base64 de 32 bytes do cofre dos canais e integrações. Preserve a existente. |
| META_APP_ID | ID do aplicativo Meta da plataforma, necessário para Facebook/Instagram. |
| META_APP_SECRET | Segredo do aplicativo Meta. |
| META_GRAPH_VERSION | Versão da Graph API; padrão v24.0. |
| GOOGLE_CLIENT_ID | Cliente OAuth Google, para Gmail/Workspace. |
| GOOGLE_CLIENT_SECRET | Segredo OAuth Google. |
| MICROSOFT_CLIENT_ID | Cliente OAuth Microsoft, para Outlook/365. |
| MICROSOFT_CLIENT_SECRET | Valor do segredo OAuth Microsoft. |
| PRODUCT_MEDIA_ROOT | Pasta privada de mídia dos produtos; vazio usa .product-media. |
| ORDER_UPLOAD_ROOT | Pasta privada de fotos dos pedidos; vazio usa .order-uploads. |
| ORDER_UPLOAD_QUOTA_MB | Cota de fotos por loja, em MB; padrão 5120, mínimo aplicado 512. |
| DRIVER_ACCESS_KEY | Chave base64 de 32 bytes dos links de entregadores/rastreio. Vazio usa .driver-access/key. Preserve a chave já utilizada. |

WhatsApp Web utiliza o vínculo por QR Code e o perfil salvo; não precisa das credenciais Meta/OAuth. Facebook/Instagram, Gmail e Outlook precisam dos aplicativos correspondentes. IMAP/SMTP é configurado em Gerenciar canais → E-mail, com a chave do cofre habilitada; não usa variáveis globais de senha ou servidor SMTP.

## Publicação na internet

Se o servidor da plataforma estiver efetivamente publicado no domínio principal `inovafacil.com.br`, substitua somente estas linhas do modelo local:

```dotenv
NODE_ENV=production
COOKIE_SECURE=true
APP_ORIGIN=https://inovafacil.com.br
CHANNELS_PUBLIC_URL=https://inovafacil.com.br
PLATFORM_PUBLIC_URL=https://inovafacil.com.br
```

Se o painel estiver em um subdomínio, APP_ORIGIN e CHANNELS_PUBLIC_URL devem usar esse subdomínio exato. Os domínios precisam estar publicados com HTTPS; preencher o .env não configura DNS, certificado, hospedagem nem acesso ao computador local.

`floriculturaemocoesflores.com.br` pertence à Emoções Flores: cadastre e verifique esse domínio nas configurações dessa floricultura. Não o transforme no domínio global de todas as lojas. Sem domínio próprio, o endereço da loja usa `https://inovafacil.com.br/<slug>`.

Cadastre nos provedores os retornos OAuth da origem escolhida:

```text
/api/channels/oauth/facebook/callback
/api/channels/oauth/instagram/callback
/api/channels/oauth/gmail/callback
/api/channels/oauth/outlook/callback
```

Consulte [o guia das integrações](INTEGRACOES-ATENDIMENTO.md) para aplicativos, permissões e homologação. A Meta exige uma origem pública HTTPS apropriada; localhost não publica o aplicativo para contas externas.

## Preservar ou gerar chaves

Mantenha ADMIN_TOKEN, CHANNELS_ENCRYPTION_KEY e DRIVER_ACCESS_KEY existentes. Não gere novas chaves ao atualizar uma instalação que já usa essas chaves. Se DRIVER_ACCESS_KEY está vazio porque a chave foi criada automaticamente, preserve `.driver-access/key`.

Apenas para uma instalação nova, gere localmente:

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use o resultado para ADMIN_TOKEN. Para CHANNELS_ENCRYPTION_KEY, uma instalação nova usa uma chave independente em base64:

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copie o resultado somente para o .env local e para seu backup privado. Não é necessário definir DRIVER_ACCESS_KEY se você mantiver a chave automática em `.driver-access/key`.

## Fila e atualização

Intervalos de 8–25 segundos, limites por minuto/hora, horário de atendimento e leitura são configurados por floricultura no painel: **Gerenciar canais → Fila e horários de envio**. Não há variáveis de .env para esses ajustes. A variável antiga WHATSAPP_HEADLESS deixou de ser utilizada; use WHATSAPP_SHOW_BROWSER.

Após editar o .env, encerre o servidor com Ctrl + C e inicie novamente com `npm start`. Mudanças no arquivo não são aplicadas automaticamente ao processo que já está rodando.
