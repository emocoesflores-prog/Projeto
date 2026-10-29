# Versão 3.3 — PDV e Gestão de Pedidos compactos

## PDV

O painel direito mantém cliente, modalidade, horário, produtos, pagamento, cupom, total e botão de registro próximos. No computador, a área básica de venda cabe sem rolagem da página; listas longas de produtos da venda têm rolagem própria. A vitrine do lado esquerdo também mantém sua própria lista.

Observações, detalhes do presente e escolha do agendamento abrem em janelas próprias. Seus valores continuam associados ao formulário da venda e são preservados ao voltar. Isso evita esticar o painel inteiro. O endereço e o cliente continuam usando o cadastro da loja, e a cobrança permanece calculada no servidor. Não foi removida a confirmação separada do recebimento.

Em telas pequenas, orientação horizontal com pouca altura, fontes muito ampliadas ou listas/textos extensos, a rolagem necessária é preservada para não cortar campos ou diminuir excessivamente as letras. Não é possível mostrar uma quantidade ilimitada de itens simultaneamente. Os testes verificam a área básica do PDV em cinco resoluções de computador, a partir de 1024×768 e incluindo 1280×720, nos dois temas.

## Gestão de Pedidos

- Layout único de lista: o botão Ajustar layout foi removido, inclusive das novas preferências. Configurações antigas de duas colunas são interpretadas como lista.
- Linhas com cliente/código, dia da semana, data, período e faixa de horário, total, forma de pagamento, origem, modalidade e etapa.
- Sem rolagem da página no computador nas resoluções testadas; a lista e detalhes extensos usam áreas internas. Não há reserva de uma grande área mínima vazia para poucos pedidos.
- Detalhes divididos em Resumo, Itens e cartão, Produção, Pagamento e Histórico. As ações principais permanecem no rodapé do pedido. Formulários e histórico continuam disponíveis nas abas.

## Cores e etapas

Aguardando pagamento usa amarelo; agendado, azul; recebido, ciano; produção, roxo; pronto, verde; em entrega, laranja; esperando retirada, verde-água; concluído, cinza-azulado; cancelado, vermelho. As etiquetas conservam nomes e contadores para não depender apenas de cor.

Cancelados têm filtro próprio. Concluídos incluem entregues, retirados e vendas de balcão concluídas, sem os cancelamentos.

## Origem do pedido

Pedidos novos do site recebem origem Site. O PDV informa PDV; pedidos abertos pelo painel lateral do Atendimento preservam o canal selecionado: WhatsApp, Instagram, Facebook ou e-mail. Essa informação indica o contexto em que o pedido foi registrado pelo operador; não substitui confirmação de identidade ou pagamento pelo provedor.

Pedidos antigos com origem manual, sem canal gravado, mostram “Painel · canal não registrado”. Nenhum canal antigo foi deduzido por telefone. A origem Site é definida no servidor, mesmo que uma solicitação pública tente informar outro canal. O campo fica no JSON do pedido, isolado por floricultura, e não requer nova migração SQL.

## Menu

Operação, Cadastro e Gestão têm seus próprios botões de expandir/recolher, com estado de navegação salvo no navegador para o endereço do painel. A busca abre os grupos que possuem resultados. Escolher um módulo expõe seu grupo, e recolher o menu inteiro continua permitindo os atalhos por ícone. Os controles são botões com indicação acessível do estado aberto/fechado.

## Atualização

Pare o servidor, preserve `.env`, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache` e `.whatsapp-desk.json`, atualize os arquivos do projeto, execute `npm ci` e `npm start` e pressione Ctrl+F5. Não altere seu `.env` que já funciona. Não há nova migração para uma plataforma multi-loja já instalada. O SQL Server do computador do cliente não foi acessado nesta execução.
