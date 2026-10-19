# Painel da floricultura — versão 3.0

## Atualização no Windows

1. Pare o servidor com Ctrl+C. Preserve `.env`, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache` e `.whatsapp-desk.json` da instalação em uso.
2. Atualize os arquivos do projeto a partir do ZIP desta versão. Não substitua o `.env` pelo arquivo de exemplo.
3. Execute `npm ci` e depois `npm start`. No navegador, use Ctrl+F5.
4. Entre no link `/painel/<endereço-da-loja>` com o usuário e a senha da floricultura. A gestão da Inova permanece em `/inova.html`; o site fica em `/loja/<endereço-da-loja>`.

Não há nova migração SQL para estes módulos: os cadastros ficam no perfil JSON da respectiva linha de `dbo.Tenants`; os pedidos continuam em `dbo.Orders`, sempre filtrados por floricultura. A migração inicial da plataforma continua obrigatória para instalações antigas. Em `DATA_MODE=demo`, os dados de negócio ficam somente na memória e desaparecem ao reiniciar. O SQL Server local do cliente não foi acessado pelos testes na nuvem.

## Organização dos menus

- **Operação:** Visão geral, Ponto de Venda (PDV), Oficina de Flores (ODF), Gestão de Entregas (GDE), Atendimento e Agenda diária.
- **Cadastro:** Produtos, Categorias e subcategorias, Clientes, Taxa de Entregas, Entregadores, Promoções, Agendamentos, Impressões, Integrações e IA e Fiscal.
- **Gestão:** Desempenho, Minha Empresa, Caixa, Gestão de Pedidos e Configurações.

O menu pode ser expandido ou recolhido. Os temas claro e escuro continuam no cabeçalho. Em Configurações, cada loja escolhe paleta rosa/creme, azul ou lavanda e texto de 16, 18 ou 20 px.

## Categorias e produtos

Crie categorias principais e subcategorias em Cadastro → Categorias. Um produto pode ser associado a várias categorias e subcategorias. Ao escolher uma subcategoria, o produto também participa do filtro da categoria principal no site e no PDV. As categorias dos produtos antigos são preservadas com identificadores estáveis por loja.

Categorias podem ser desativadas sem apagar pedidos ou produtos. Produtos inativos deixam de ser oferecidos no site e no PDV; os itens e preços dos pedidos antigos permanecem como foram registrados. O cadastro permite editar nome, descrição, preço, disponibilidade, categorias e ilustração. As imagens incluídas são ilustrações, não fotografias de produtos reais.

## Do PDV à entrega

1. Crie o pedido no PDV ou pelo site. Ele fica aguardando pagamento.
2. Confira o recebimento e registre a referência manualmente em Gestão de Pedidos. O sistema não faz cobrança nem confirmação bancária automática.
3. O pedido pago aparece na Oficina. Informe a pessoa responsável e avance a produção. Para ficar pronto, confira arranjo, embalagem e cartão quando houver mensagem.
4. Na GDE, selecione pedidos de entrega pagos e prontos, do mesmo dia. Escolha o entregador ativo, origem e posição de cada parada. Revise o mapa e a sugestão antes de salvar.
5. Despache a rota para atualizar os pedidos em uma única operação. Confirme cada entrega efetivamente realizada; a rota termina quando todas forem concluídas.

A Oficina atualiza a cada 10 segundos quando o operador não está preenchendo campos. O planejamento de uma rota é mantido durante a edição; use Atualizar pedidos para buscar mudanças externas. Alterações concorrentes são conferidas novamente ao salvar, e não sobrescrevem silenciosamente outro operador.

A lista operacional mostra até 1.000 pedidos abertos. Em Gestão de Pedidos, **Pesquisar histórico completo** consulta pedidos antigos por cliente, telefone, destinatário, código ou dia, com paginação de 50 registros.

## Mapas, sugestões de rota e taxa por distância

O mapa usa Leaflet local e mapas de OpenStreetMap com atribuição. É necessário acesso à internet para as imagens do mapa. As localizações podem ser marcadas no mapa ou digitadas como latitude e longitude.

Sem uma API de rotas, a sugestão prioriza o fim de cada período e a proximidade **em linha reta**, usando 30 km/h e cinco minutos por parada. Não é um percurso rodoviário, não considera trânsito e não garante um ótimo global. Revise o caminho antes de despachar.

Para pesquisa de endereços, matriz de distâncias por ruas e trajeto rodoviário, configure uma chave **OpenRouteService**. A plataforma pode definir `ORS_API_KEY` no `.env`; cada floricultura também pode salvar sua própria chave em Integrações e IA, com o cofre de credenciais habilitado. A disponibilidade depende do plano, limites e acesso à API do provedor. Não há trânsito em tempo real.

O planejamento é limitado a 25 pedidos por rota e o cálculo expira em dez minutos. Uma parada não pode pertencer simultaneamente a duas rotas abertas. Os períodos são priorizados e chegadas estimadas fora do horário aparecem como alerta para revisão; a sugestão não garante o cumprimento do prazo.

Em Taxa de Entregas, a cobrança opcional por distância exige origem cadastrada e serviço rodoviário configurado. A fórmula é `máximo(taxa mínima, valor inicial + distância em km × valor por km)`, arredondada para cima em centavos, respeitando a distância máxima. Quando habilitada, substitui a taxa fixa do endereço. A área de cidades atendidas continua sendo respeitada. Endereços ambíguos ou fora da área são recusados; não se inventa uma distância. O orçamento é calculado no servidor e fica registrado no pedido.

## Cupons, pagamentos e agenda

Cupons podem ser percentuais inteiros ou valores fixos, com validade, mínimo dos produtos e limite de utilização. Não descontam o frete. O limite conta pedidos registrados, inclusive pendentes, e é verificado transacionalmente para não permitir duas utilizações da última vaga. Cancelar um pedido não devolve automaticamente uma utilização. Os valores dos produtos e descontos são calculados no servidor. Site e PDV mostram o orçamento antes do registro.

Em Agendamentos, defina dias da semana, datas indisponíveis, horizonte de dias, antecedência até o fim da faixa e períodos personalizados de entrega e/ou retirada. Novos agendamentos são verificados no servidor. Pedidos para agora e vendas de balcão não usam as faixas de agendamento. A agenda não representa reserva de capacidade por quantidade de pedidos.

Em Caixa → Formas de pagamento, ative PIX, cartão ou adicione outras opções. Esse cadastro disponibiliza a opção e as orientações; não contrata adquirente, não processa cartão e não faz conciliação bancária.

## Caixa e desempenho

O Caixa agrupa recebimentos pela data em que foram registrados, além de entradas e despesas manuais. Estornos de lançamentos geram um registro inverso, preservando o original. Pedidos cancelados com recebimento são destacados para conferir o eventual reembolso e registrar sua saída. O sistema não efetua estorno no banco. A consulta é limitada a 5.000 recebimentos por período, com aviso para reduzir a faixa. Há exportação CSV.

Desempenho inclui vendas, clientes, base de clientes, site, catálogo, produtos, entregas, descontos, cancelamentos e visão geral. Valores de vendas consideram pedidos pagos não cancelados; caixa e vendas podem diferir pela data do recebimento e cancelamentos. As métricas do site contam acessos, adições à sacola e solicitações concluídas, por dia e tipo de dispositivo, sem identificar visitantes. Não são pessoas únicas e podem ser reduzidas por bloqueadores ou falhas de rede. O registro começa nesta versão, sem estimar visitas antigas.

## Integrações e IA

Cada floricultura conecta seus canais e sua conta de e-mail. As permissões e os aplicativos OAuth de Meta, Google e Microsoft precisam ser configurados previamente pela plataforma, conforme `INTEGRACOES-ATENDIMENTO.md`. Não basta cadastrar o menu para os provedores liberarem a integração.

As chaves próprias de IA e rotas usam o mesmo cofre AES-256-GCM das conexões. A Inova configura uma vez `CHANNELS_ENCRYPTION_KEY`, com 32 bytes aleatórios em Base64, e preserva essa chave e `.tenants` no backup. Não altere uma chave já em uso: as credenciais existentes dependem dela para descriptografia. As chaves das lojas não ficam no perfil JSON nem são retornadas ao navegador. Ao remover uma chave própria, será usado o serviço padrão do servidor, se configurado.

A IA permite nome, modelo e orientações por loja. Ela produz sugestões de texto que o operador revisa antes de enviar. Não confirma pagamentos, não cadastra pedidos nem envia mensagens automaticamente.

## Fiscal

O submenu Fiscal guarda razão social, CNPJ, inscrições, município/UF, regime tributário, ambiente pretendido, séries/numeração de NF-e/NFC-e, identificação do CSC, NCM, CFOP, CST/CSOSN, origem e alíquotas padrão de ICMS/PIS/COFINS, separados por loja.

**Esta versão não emite NF-e/NFC-e, não calcula os tributos de cada operação e não transmite documentos à SEFAZ.** Para essa etapa ainda será necessário integrar um serviço emissor, cadastrar certificado e credenciamento de cada empresa e homologar as regras com seu contador. Não informe certificado, senha do certificado ou CSC secreto nesses campos. O cadastro não habilita emissão e não avança numeração fiscal. As impressões do sistema são documentos operacionais, não documentos fiscais.
