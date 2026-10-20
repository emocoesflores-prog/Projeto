# Painel 3.1 — navegação e relatório único

## O que mudou

- **Gestão de Pedidos** abre o painel e é o primeiro item de **Operação**.
- **Visão geral** passou para **Gestão → Desempenho**, no resumo operacional que pode ser expandido no final do relatório.
- Desempenho deixou de ter vários submenus: vendas, clientes, produtos/catálogo, entregas, site, cupons e cancelamentos estão em um só relatório.
- Os módulos principais têm atalhos com ícones circulares e descrições em Gestão de Pedidos. O menu tem busca por função, inclusive termos como cupom, nota, motoboy e balcão. No primeiro acesso em computador, o menu mostra os nomes; continua sendo possível recolher. Uma escolha já salva no navegador é respeitada.

## Como usar o relatório

1. Entre em **Desempenho**, escolha período, origem dos pedidos e modalidade. Clique em **Aplicar filtros**.
2. Marque **Comparar com período anterior** para comparar quantidade de pedidos, valor pago e ticket médio com um intervalo imediatamente anterior de igual duração.
3. Escolha evolução por dia, semana ou mês, visualização em gráficos/tabelas e tamanho dos rankings.
4. Abra **Personalizar relatório** para mostrar/ocultar blocos, mudar sua ordem, usar a visão essencial ou restaurar o padrão. É obrigatório manter pelo menos um bloco.
5. Use **Exportar planilha CSV** ou **Imprimir relatório**. O arquivo e a impressão usam os dados e os blocos atualmente exibidos, com indicação dos filtros aplicados. A impressão abre o diálogo do navegador e também pode ser salva em PDF.

As preferências de visualização ficam somente no navegador, com identificação da floricultura e do usuário. Não são compartilhadas entre lojas. As datas e filtros de pedidos começam novamente no padrão de 30 dias ao entrar em uma nova sessão. A comparação não inventa percentual quando o período anterior é zero.

A origem e a modalidade filtram os pedidos antes do limite de 5.000 registros no SQL Server. Catálogo/base atual de clientes e contadores gerais do site têm sua própria abrangência, indicada na tela. O resumo operacional utiliza os pedidos recentes carregados no painel, até 200 no SQL Server, e não segue os filtros do relatório.

Trocar o tipo de gráfico, agrupamento ou ordem não consulta novamente o banco. Ao voltar ao mesmo relatório em até 30 segundos, a consulta é reaproveitada, com horário da última consulta. **Aplicar filtros** e **Atualizar dados** sempre permitem buscar novamente. Valores pagos continuam dependendo do recebimento registrado no sistema; não há conciliação bancária automática.

## Atualização

Pare o servidor. Preserve `.env`, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache` e `.whatsapp-desk.json`. Atualize os arquivos do projeto, execute `npm ci` e `npm start`, e use Ctrl+F5 no navegador. Não há nova migração de banco para quem já usa a plataforma multi-loja.
