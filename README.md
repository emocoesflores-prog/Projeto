# Floricultura Emoções Flores

Loja em português para retirada ou entrega em **Mauá, Santo André e Ribeirão Pires (SP)**. Desenvolvida com Node.js 24, Express e integração SQL Server. O catálogo e as imagens são ilustrativos. A taxa inicial de entrega é R$ 20 para as três cidades e pode ser alterada no painel administrativo. Retirada: Rua Havana, 95, Parque das Américas, Mauá – SP.

## Executar na sua máquina

Instale o Node.js 24 LTS e copie este projeto para sua máquina. No terminal, dentro da pasta do projeto:

```sh
npm ci
```

Copie `.env.example` para `.env` (no PowerShell: `Copy-Item .env.example .env`). Edite o arquivo, sem compartilhar credenciais. Execute:

```sh
npm start
```

A porta padrão é 3000. No navegador da própria máquina, abra o endereço local na porta 3000. A loja está na rota `/` e o painel na rota `/admin.html`. Para habilitar o painel, configure um `ADMIN_TOKEN` longo, aleatório e exclusivo em `.env`. Não há chave padrão e esse arquivo está excluído do Git.

`DATA_MODE=demo` permite testar sem banco. Os pedidos ficam apenas em memória e desaparecem ao reiniciar. Use dados fictícios. No SQL Server os pedidos são persistidos.

## Usar seu SQL Server instalado

1. No SQL Server Management Studio, crie um banco exclusivo chamado `Floricultura` (ou escolha outro e ajuste `SQL_DATABASE`). Não use um banco de produção existente sem avaliar as tabelas `dbo.Orders` e `dbo.StoreSettings`.
2. No SQL Server Configuration Manager, habilite TCP/IP para a instância e confira a porta TCP. Reinicie o serviço se mudar a configuração. Instâncias Express podem usar porta dinâmica; prefira configurar uma porta fixa e usar `SQL_HOST` e `SQL_PORT` separadamente.
3. Configure uma conta SQL dedicada e sua senha com as permissões necessárias. A conexão atual usa autenticação SQL; autenticação integrada do Windows ainda não foi implementada. Se necessário, habilite o modo misto na instância. Não use `sa` como usuário da aplicação.
4. No `.env`, defina `DATA_MODE=sqlserver`, `SQL_HOST=localhost`, a porta correta, o banco, `SQL_USER` e `SQL_PASSWORD` locais. O servidor mantém criptografia e valida o certificado. Somente para desenvolvimento local com certificado próprio, use `SQL_TRUST_CERTIFICATE=true`; em produção, use certificado confiável e mantenha `false`.
5. Execute `npm start`. A inicialização cria `dbo.Orders` e `dbo.StoreSettings` usando `sql/schema.sql` caso ela não exista. A conta precisa de permissão para essa criação inicial. Para produção, execute a migração com uma conta separada e restrinja a conta da aplicação a SELECT, INSERT e UPDATE.

O SQL Server da sua máquina não é o banco deste ambiente na nuvem. A conexão real ainda precisa ser validada na sua máquina. Não exponha a porta do banco à internet. Para acesso público ao site hospedado na sua máquina, ainda será necessário configurar domínio, HTTPS, acesso de entrada ao servidor web, disponibilidade contínua e backups. Rodar localmente não publica o site automaticamente.

Os itens, modalidade, endereço, cidade, agendamento, cartão e forma de pagamento são persistidos como JSON validado pelo SQL Server; identificador, data, total em centavos e status ficam em colunas. O catálogo inicial está em `catalog.js`.

## Pagamento e operação

Somente pagamento **antecipado** por PIX ou cartão de crédito. Conforme solicitado, nenhum provedor foi integrado: não há QR Code, cobrança nem coleta de dados de cartão. O checkout registra uma **solicitação aguardando pagamento**, sem confirmar compra ou reservar entrega/retirada. O status de pagamento é definido pelo servidor como pendente, independentemente do conteúdo enviado pelo navegador. O painel permite cancelar solicitações, mas não liberá-las para preparação ou entrega enquanto não existir confirmação confiável de pagamento.

A retirada não cobra frete. Entregas aceitam somente as três cidades atendidas, validadas também no servidor. A taxa inicial é R$ 20, única para as três cidades. Após entrar no painel, altere o campo “Taxa única de entrega (R$)” e clique em “Salvar taxa”. A taxa aceita valores de R$ 0 até R$ 1.000. A alteração vale para novos pedidos; cada pedido conserva o frete calculado pelo servidor no momento do registro. No SQL Server, a configuração é salva em `dbo.StoreSettings` e mantida ao reiniciar; no modo demonstração, fica em memória e volta a R$ 20 ao reiniciar. A migração não redefine uma taxa já cadastrada. A vitrine consulta a taxa ao abrir a sacola e antes do envio. Não há cálculo por bairro/CEP nesta versão. Datas e períodos não reservam capacidade nem conferem feriados ou horário de funcionamento.

## Validação

```sh
npm test
```

Os testes cobrem as três cidades, rejeição de cidades não atendidas, retirada sem frete/endereço, PIX e cartão, pagamento pendente imposto pelo servidor, bloqueio de entrega não paga, cálculo de preços, alteração autenticada de frete, rejeição de taxas inválidas, preservação dos valores de pedidos antigos, validação de itens/datas e acesso administrativo.

## Pendências para operação comercial

Conectar e testar seu SQL Server; implementar gestão de catálogo/estoque, regras de calendário e capacidade; integrar pagamentos e webhooks quando solicitado; adicionar login individual e permissões, notificações e rastreio, política de privacidade/LGPD, backups, monitoramento e HTTPS. As fotos devem representar os produtos reais e ter autorização de uso. Esta versão ainda não aceita vendas reais.

## Central de comando

O painel `/admin.html` reúne visão geral, pedidos, agenda, catálogo, clientes e configurações em uma interface responsiva. A referência visual é a imagem fornecida pelo proprietário; o site externo não pôde ser consultado pela rede deste ambiente.

- Indicadores de solicitações, agendamentos do dia, pagamentos pendentes e cancelamentos são derivados dos pedidos carregados. Não representam receita paga.
- Agenda dos próximos três dias e consulta por data, usando o dia local de São Paulo. Pedidos cancelados são excluídos da agenda.
- Busca por cliente, destinatário ou código; filtros por modalidade e status; detalhes com cartão, itens e frete; cancelamento e exportação CSV.
- Clientes agrupados pelo telefone normalizado. Não é um cadastro de CRM independente.
- Catálogo somente para consulta; edição e estoque ainda não implementados.
- Configuração de frete com acesso protegido, preservando os valores dos pedidos antigos.

No SQL Server a consulta atual carrega no máximo 200 solicitações. O painel informa esse limite; os números não constituem relatórios completos de períodos históricos. A chave de acesso não é persistida no armazenamento do navegador. Pagamentos, roteirização, fiscal, marketing e atendimento integrado ainda não estão implementados; não são apresentados como funções disponíveis.

Validação adicional: testes de agrupamento de clientes, virada de mês/ano na agenda e fuso horário de São Paulo. Foi validado em Chromium o checkout de retirada, login administrativo, detalhes de pedido, edição de frete, navegação entre seções, logout e ausência de transbordamento horizontal nas telas móveis de 390 px.
