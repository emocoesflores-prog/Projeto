# Correção de dependências — versão 3.6.1

Os dois alertas altos exibidos pelo `npm audit` na versão 3.6 eram consequência de uma mesma vulnerabilidade na biblioteca de autenticação Microsoft: [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5). Ela afeta o fluxo de código de autorização do MSAL Node, que poderia enviar parâmetros a um endereço controlado por um atacante. A dependência chega ao projeto pela cadeia `mssql → tedious → @azure/identity → @azure/msal-node`.

A aplicação configura o SQL Server com usuário e senha, sem utilizar esse fluxo de autenticação Azure. Ainda assim, a biblioteca vulnerável foi atualizada. A verificação atual encontrou uma correção compatível em `@azure/identity`, resolvendo a pendência documentada na versão 3.5.

| Dependência | Antes | Corrigida |
| --- | --- | --- |
| `@azure/identity` | 4.14.0 | 4.14.1 |
| `@azure/msal-node` | 6.0.1 | 7.1.2 |
| `@azure/msal-common`, dependência do MSAL Node | 16.14.1 | 16.15.0 |

O próprio `@azure/identity` corrigido declara a nova versão do MSAL como dependência. Não foi necessário usar `--force`, adicionar um override incompatível ou trocar o driver SQL Server. O arquivo `package-lock.json` registra as versões corrigidas para que `npm ci` as reinstale.

## Corrigir a instalação 3.6 já existente

Pare o servidor com **Ctrl+C** e, na pasta que contém `package.json`, execute:

```bat
npm audit fix
npm audit
npm start
```

Essa foi a correção compatível conferida nesta atualização. Não adicione `--force`. O resultado esperado da auditoria é `found 0 vulnerabilities`; ele depende dos alertas conhecidos no momento da consulta. Se houver novos alertas, confira seus detalhes antes de aplicar atualizações incompatíveis. Guarde o `package-lock.json` atualizado: substituir depois pelo arquivo antigo da versão 3.6 reinstalaria as versões antigas no próximo `npm ci`.

## Instalar a versão 3.6.1 completa

Como alternativa à correção local, atualize o código com o pacote 3.6.1, preservando `.env`, banco e pastas privadas. Com o servidor parado:

```bat
npm ci
npm run media:setup
npm audit
npm start
```

Não há nova configuração de `.env` nem alteração de banco para esta correção.

## Avisos que podem continuar aparecendo

Os avisos `deprecated` de `glob` e `fluent-ffmpeg` são avisos de manutenção de dependências do WhatsApp e não os dois alertas de segurança acima. Eles podem aparecer mesmo quando o `npm audit` informa zero vulnerabilidades conhecidas. A troca dessas bibliotecas exige uma atualização compatível da integração; não foram removidas nem substituídas à força nesta correção.

Os avisos `install-scripts` também são separados: informam scripts de instalação não aprovados pelo npm. O comando explícito `npm run media:setup` prepara o conversor de mídia, como na versão 3.5. O WhatsApp continua utilizando o navegador configurado na instalação.

## Validação

Após reinstalar as dependências a partir do lock corrigido, o `npm audit` informou **zero vulnerabilidades conhecidas** e os **124 testes automatizados passaram**. Também foram conferidos o carregamento e a criação das configurações do driver SQL Server e das bibliotecas Azure, sem realizar login externo. O conversor de mídia foi reinstalado com o comando do projeto. O SQL Server do computador do cliente não foi acessado neste ambiente.
