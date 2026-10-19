# Versão 2.5.0 — visual e sugestões de bairros

A vitrine e as ferramentas administrativas receberam uma identidade compartilhada inspirada nos prints fornecidos pelo usuário: fundo creme, rosa, lavanda e cartões com cantos arredondados. Não foi possível consultar a página externa na nuvem (acesso HTTP bloqueado); os prints orientaram a composição. A marca e os dados continuam sendo os de cada floricultura.

## Site

- Cabeçalho com pesquisa sem distinção de acentos, categorias e sacola.
- Filtros por categoria e faixa de valor, ordenação por preço/nome e atalhos por ocasião.
- Minha lista: favoritos guardados neste navegador, separados por endereço da loja. Não há conta de cliente ou sincronização entre dispositivos nesta função.
- Detalhes do presente em janela, com adição à sacola e retorno ao catálogo.
- Feedback de inclusão na sacola, layout adaptado a celular/tablet/computador e navegação por teclado.
- Contato pelo WhatsApp usa somente o telefone válido cadastrado na própria floricultura; não envia mensagens automaticamente. O atalho não aparece se a loja não informou telefone.
- As imagens incluídas são ilustrações originais, identificadas como tal, sem copiar fotografias da referência. Não foram adicionadas avaliações, prazos de entrega garantidos ou rankings de vendas fictícios.
- O checkout continua registrando uma solicitação aguardando pagamento. A versão não cria cobrança automática, autorização de cartão ou reserva antecipada.

## Painéis

Os painéis da Inova e das floriculturas, o Atendimento, o PDV, Entregas, Clientes, Pedidos e Desempenho compartilham paleta e tipografia. Claro é a escolha inicial em um navegador sem preferência anterior; escolhas já salvas são preservadas. Tema escuro continua disponível para todos os painéis. A identidade colorida de cada canal do Atendimento continua independente da cor geral da interface.

Texto principal de 16 px, botões de 14–16 px e títulos maiores. As fontes Quicksand e Nunito Sans são servidas pelo próprio programa, sem requisição ao Google Fonts. Arquivos distribuídos por Fontsource 5.3.0, sob SIL Open Font License; licenças preservadas em `public/fonts/`.

## Bairros

O problema de Mauá era a dependência de uma única consulta externa ao Overpass/OpenStreetMap. O programa agora inclui 62 nomes extraídos de respostas postais reais do ViaCEP para Mauá/SP, validados pelo código IBGE 3529401 e disponíveis sem rede. A lista aparece imediatamente ao selecionar a cidade.

Não é uma lista oficial/completa de divisões municipais: são sugestões de nomes usados em endereços postais. Nomes ausentes continuam podendo ser digitados e salvos. A procedência, data da consulta e pesquisas utilizadas estão em `data/README.md` e `data/neighborhoods-br.json`.

Outras cidades consultam ViaCEP primeiro, com validação de código IBGE, nome e UF para não misturar municípios homônimos. OpenStreetMap é uma alternativa quando a fonte postal não tem sugestões. As consultas têm limite de tempo, cache e compartilhamento das solicitações simultâneas. Um problema de rede não impede a digitação manual nem apaga as taxas cadastradas.

## Atualização no Windows

1. Pare o servidor com Ctrl+C.
2. Atualize os arquivos do programa preservando `.env`, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache` e `.whatsapp-desk.json`.
3. Execute `npm ci`, depois `npm start` e atualize o navegador com Ctrl+F5.
4. Não há nova migração SQL nesta versão. O banco local do usuário não foi acessado pela nuvem. As configurações existentes e os endereços já registrados nos pedidos permanecem preservados.

## Validação

Testes automatizados cobrem a base offline de Mauá, fallback, cache e recusa de bairros de outra cidade, além das regras anteriores de pedidos, clientes, isolamento, pagamentos e conexões. A interface foi conferida em seis resoluções, nos dois temas administrativos, com compra por retirada, múltiplos locais, taxa de bairro, favoritos isolados, pesquisa, filtros e detalhes de presentes. A seleção de bairro e o salvamento da taxa de Mauá foram testados na interface com a base real, sem substituir a resposta de bairros por uma simulação.
