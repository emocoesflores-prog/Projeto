# Versão 3.2 — Central de Configurações por floricultura

Acesse **Gestão → Configurações**. A central reúne os ajustes existentes e novas preferências de painel, e-commerce, pedidos, PDV, Oficina e rotas. Há busca por nome/finalidade e acesso aos editores de cada módulo. Os campos continuam pertencendo somente à floricultura autenticada.

## Organização

- Loja e operação: preferências de Gestão de Pedidos, empresa/horários, entregas e retirada, agenda, PDV, Oficina, rotas e impressão.
- Financeiro e fiscal: formas de pagamento, Caixa, cupons e dados fiscais.
- Atendimento e integrações: canais, nome da assistente e credenciais de APIs.
- Painel administrativo: layout, cores, tema, leitura, menu e relatório personalizado.
- E-commerce: identidade, layout, conteúdo, domínio, produtos, categorias e clientes.

Os links de módulo levam aos editores já existentes; o botão “Central de Configurações” permite retornar. Não foram adicionados botões sem função para serviços ausentes dos exemplos enviados.

## Aparência do painel

Escolha distribuição confortável/compacta, paletas rosa/azul/lavanda ou cor própria, fonte de 16/18/20 px, bordas discretas/arredondadas, tema inicial e navegação expandida/recolhida. As cores de destaque são ajustadas para favorecer a leitura no tema escolhido.

O tema e o menu podem ser alternados no uso diário. Essa escolha do navegador é guardada por floricultura; salvar novamente as preferências do painel aplica o novo padrão. A aparência do painel não altera as cores da loja virtual.

## E-commerce

Há três layouts: Boutique, Editorial e Essencial. Configure paleta ou cor própria, fundo claro, fonte arredondada/clássica/moderna, tamanho dos textos, bordas e cards espaçados/compactos. Escolha três/quatro colunas no computador; celular e tablet usam adaptação responsiva.

Configure logotipo por URL HTTPS pública, aviso de topo, título e texto principal. Ative/desative apresentação, ocasiões, benefícios, contato WhatsApp, descrições e favoritos. Políticas e perguntas frequentes aparecem no rodapé como textos expansíveis. A prévia é ilustrativa; o site só muda após salvar. Textos não executam HTML e URLs de logotipo são limitadas a HTTPS. O fundo é limitado a cores claras para preservar a leitura da vitrine. Não há upload de imagens neste editor.

## Preferências operacionais aplicadas

- Pedidos: lista/duas colunas e etapa inicial.
- PDV: modalidade inicial de balcão/retirada e apresentação compacta dos produtos.
- Oficina: abertura com filtro do dia e atualização de 10 a 120 segundos. O servidor continua exigindo pagamento e checklist para avançar; esses controles não podem ser removidos pela aparência.
- Rotas: minutos por parada e velocidade estimada para o cálculo em linha reta. O serviço rodoviário, quando configurado, fornece os tempos de deslocamento por vias; não há trânsito em tempo real.

## Domínio próprio: cadastro e titularidade

O editor aceita somente hostname público, como `loja.exemplo.com.br`, sem protocolo, porta, IP ou caminho. Ao salvar um novo domínio, é gerado um valor TXT específico da floricultura:

- Nome: `_inova-verification.loja.exemplo.com.br`
- Tipo: TXT
- Valor: `inova-verification=<valor exibido no painel>`

Cadastre esse registro no provedor DNS e clique em Verificar DNS. Alguns provedores pedem o nome relativo à zona, por exemplo `_inova-verification.loja`. Aguarde a propagação. A aplicação confere o valor do TXT e protege contra alteração concorrente e verificação do mesmo domínio em outra floricultura. Trocar o domínio invalida a comprovação anterior e gera outro valor.

**A verificação comprova a titularidade, mas não ativa o site naquele domínio.** Esta versão não emite certificado TLS, não modifica DNS no registrador e não roteia automaticamente o domínio para a loja. A Inova ainda precisa publicar a aplicação em um servidor acessível, configurar o apontamento, o proxy HTTPS e o vínculo de roteamento da loja na infraestrutura. Enquanto o servidor estiver apenas no computador local, use o link `/loja/<slug>` já disponível. O estado do editor indica que a hospedagem está pendente após a verificação; não mostra domínio ativo sem ativação real.

## Atualizar no Windows

Pare `npm start`, preserve `.env`, `.tenants`, `.wwebjs_auth`, `.wwebjs_cache` e `.whatsapp-desk.json`, atualize os arquivos e execute `npm ci` e `npm start`. Use Ctrl+F5. Não precisa alterar o `.env` que já funciona. Nenhuma nova variável é exigida por esta versão.

Não há nova migração para instalações já migradas à plataforma multi-loja: as configurações usam o perfil JSON da loja. O SQL Server local do cliente não foi acessado nesta execução. Em `DATA_MODE=demo`, os dados de negócio continuam temporários.

Pagamentos seguem com confirmação manual. Fiscal configura os dados, mas ainda não emite NF-e/NFC-e. As integrações externas continuam exigindo aplicativos/chaves e permissões dos respectivos provedores.
