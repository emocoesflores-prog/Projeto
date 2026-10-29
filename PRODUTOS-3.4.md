# Produtos — versão 3.4

Em **Cadastros → Produtos**, o catálogo agora é uma lista pesquisável, com filtros de categoria, disponibilidade e estoque baixo. A lista mostra o saldo, preço, situação e visibilidade. Cada floricultura possui seu próprio catálogo, mídias, configurações e histórico.

## Cadastro por abas

- **Informações:** ativo/inativo; sistema, site ou ambos; nome; código interno único; descrição, conteúdo do presente e instruções internas (2.000 caracteres cada, com contador); categoria principal obrigatória e várias categorias/subcategorias adicionais.
- **Estoque:** controle opcional, saldo inicial e alerta de reposição. Entradas exigem custo unitário e justificativa; saídas exigem Perda ou Ajuste de estoque e justificativa. Entradas recalculam o custo médio ponderado. O custo do cadastro também pode ser revisado manualmente, com histórico.
- **Imagem e vídeo:** até três fotos, escolha de capa, JPG/PNG/WebP de até 5 MB cada; vídeo MP4/WebM de até 30 MB ou link HTTPS do YouTube, Vimeo ou arquivo MP4/WebM. Links de plataformas abrem no serviço original; arquivos MP4/WebM usam o player do navegador. Os arquivos dependem de codec compatível com o dispositivo.
- **Preço e Fiscal:** preço, custo, margem bruta estimada e promoção com preço e datas de vigência no horário de São Paulo. Cadastro fiscal por produto, separado dos parâmetros gerais da loja.
- **SEO do Produto:** título, descrição, palavras-chave, URL editável e prévia. O botão de IA usa a credencial da assistente desta floricultura, configurada em Integrações e IA, com cobrança pelo provedor da API. Sem chave, o preenchimento manual continua funcionando e nenhuma geração é simulada. Revise o texto sugerido antes de salvar. A IA recebe apenas nome, descrição, conteúdo e categoria; não recebe custo, estoque nem instruções internas. Palavras-chave não garantem classificação em mecanismos de busca.
- **Complementos:** até vinte produtos para oferecer junto ao presente, na página do produto e na sacola. Sugestões só exibem produtos disponíveis no catálogo público. A inclusão depende da ação do comprador.
- **Histórico:** cadastro, alterações de preço/custo/informações e movimentações. Consulte por período, operador registrado, produto e tipo; exporte os registros carregados em CSV. A mesma consulta está em Desempenho → Produtos e estoque. Datas dos filtros e da exibição seguem São Paulo; o CSV registra o instante UTC.

## Site e Oficina de Flores

A página de produto tem endereço individual **/loja/ENDERECO-DA-LOJA/produto/URL-DO-PRODUTO**, galeria, vídeo, descrição, conteúdo do presente e complementos. O título e a meta description são enviados no HTML, antes do JavaScript. A mudança da URL preserva redirecionamento do endereço anterior.

**O que acompanha** aparece ao cliente e na Oficina. **Instruções internas** aparecem na Oficina e na impressão da ficha de produção, nunca no catálogo ou HTML público. Pedidos novos preservam uma cópia das orientações, custo e parâmetros fiscais do momento da venda; edições posteriores não alteram pedidos antigos. Pedidos anteriores à versão não têm essa cópia retroativa.

## Como o saldo funciona

O saldo é reservado/baixado **ao registrar o pedido**, inclusive enquanto aguarda pagamento. O servidor confere o estoque novamente dentro da mesma transação da venda. Duas solicitações simultâneas não podem consumir a mesma unidade disponível. Carrinhos não reservam estoque. O PDV atualiza o catálogo a cada abertura; o servidor sempre valida o saldo final.

Cancelamentos **não devolvem automaticamente o saldo**: flores já produzidas podem ter sido consumidas ou perdidas. Após conferir o item, registre uma entrada com motivo Devolução e o custo; perdas devem ser registradas como saída. Não há explosão automática de componentes, estoque de insumos, lotes/validade ou integração com inventário externo nesta versão.

## Limite da configuração fiscal

Há campos de NCM, CEST, GTIN, unidade, origem e cBenef; CFOP dentro/fora do estado para CPF, CNPJ consumidor final e CNPJ contribuinte; CST/CSOSN, ICMS/FCP/ST, PIS/COFINS/IPI; e CST/classificação, alíquotas, reduções e diferimento de IBS/CBS, além de classificação e alíquota do Imposto Seletivo. Campos sem alíquota permanecem **não configurados**, sem atribuir percentuais por conta própria.

Isso é um **cadastro de parâmetros**, não um motor tributário, validador oficial ou emissor de NF-e/NFC-e. Não há certificado, assinatura, XML, transmissão, autorização SEFAZ, cálculo automático de DIFAL/créditos/monofasia ou garantia de cobertura de todos os enquadramentos e regimes. CPF/CNPJ, por si só, não determina todo o tratamento tributário. O contador e a integração emissora precisam validar regime, UF, destino, operação, classificação e vigência antes de uso fiscal.

Em 29/10/2026, a consulta aos portais oficiais foi bloqueada pela rede deste ambiente. Portanto, não foi possível conferir a última versão de notas técnicas e tabelas; **não se declara conformidade integral e atualizada**. Referências a conferir com o responsável fiscal:

- Lei Complementar 214/2025 e alterações: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
- Portal Nacional da NF-e, notas técnicas e tabelas: https://www.nfe.fazenda.gov.br/portal/
- Receita Federal, Reforma Tributária do Consumo: https://www.gov.br/receitafederal/pt-br/assuntos/reforma-tributaria-do-consumo

## Atualização no Windows / SQL Server

1. Pare o servidor. Preserve seu `.env`, banco, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache`, `.whatsapp-desk.json` e demais dados privados.
2. Atualize o código, execute `npm ci` e depois `npm start`. Atualize o navegador com **Ctrl+F5**.
3. Há uma **nova tabela de histórico**, `dbo.ProductEvents`, criada na inicialização do servidor com `sql/product-events.sql`. O script é idempotente e não apaga pedidos, clientes ou produtos. Se a conta do aplicativo não tiver permissão de criação, execute esse arquivo no SSMS, no banco correto, com uma conta autorizada, e reinicie. `npm run migrate:platform` também instala essa tabela.
4. Não há nova variável obrigatória no `.env`. A chave da IA existente continua sendo utilizada conforme a configuração individual da loja.
5. As fotos/vídeos ficam na pasta privada **`.product-media`**, separados pelo identificador da floricultura. Inclua essa pasta nos backups e preserve-a nas próximas atualizações. Ela não vai no ZIP do código. A biblioteca tem limite de 500 MB por floricultura nesta versão; remover uma foto do produto retira sua referência, sem apagar imediatamente o arquivo físico. Em nuvem com várias instâncias, é necessário armazenamento persistente compartilhado, além do SQL Server.

Os testes automatizados e de navegador usam dados temporários. Nenhum banco SQL Server local do cliente foi acessado ou migrado neste ambiente.
