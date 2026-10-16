# Sistema de Leilão Paroquial

Aplicação web para cadastro de pessoas e itens, registro de arremates, emissão de
promissórias e liquidação de pagamentos em caixa. A aplicação usa Flask e SQLite;
os PDFs são gerados com ReportLab.

## Requisitos

- Python 3.10 ou superior.
- Dependências Python listadas em [`requirements.txt`](./requirements.txt).
- Navegador moderno e acesso à internet para carregar Tailwind CSS e a fonte
  Public Sans via CDN.

Node.js não é necessário para executar a aplicação. Ele pode ser usado
opcionalmente para verificar a sintaxe dos arquivos JavaScript.

## Instalação e execução

Crie um ambiente virtual e instale as dependências:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Inicie o servidor:

```powershell
python app.py
```

Abra <http://localhost:5000>. Para acessar de outro computador na mesma rede,
use `http://IP-DESTE-PC:5000`.

O banco SQLite `leilao.db` é criado e atualizado automaticamente quando a
aplicação inicia. Para inicializá-lo manualmente:

```powershell
python init_db.py
```

Por padrão, o banco fica no diretório do projeto. Para usar outro arquivo,
configure `LEILAO_DB` antes de iniciar:

```powershell
$env:LEILAO_DB = "C:\dados\leilao.db"
python app.py
```

Para alterar o nome exibido na aplicação e nos PDFs:

```powershell
$env:LEILAO_NOME = "Festa de São José"
python app.py
```

## Funcionalidades

### Arrematação

- Registra lances para os itens cadastrados. O lance deve atingir o valor mínimo
  e superar o maior lance atual.
- Mantém o histórico de lances; cancelar o lance mais recente restaura o lance
  anterior como vencedor.
- A promissória lista os itens vencidos pelo arrematante.
- Um item doado pelo arrematante continua constando como valor devido e pode
  voltar ao leilão a partir do valor mínimo.

### Cadastros, itens e pessoas

- Cadastre pessoas, itens e tipos de item.
- Pesquise os cadastros e filtre a lista de itens por número, produto, tipo,
  descrição, doador e situação.
- O número de cadastro da pessoa e o número de ordem do item são seus
  identificadores no sistema.
- A exclusão de pessoas com pagamentos registrados é bloqueada para preservar
  o histórico financeiro.

### Caixa e pagamentos

Abra **Caixa** em <http://localhost:5000/caixa> ou use o atalho **Alt+5**.

1. Pesquise o arrematante pelo número de cadastro ou pelo nome.
2. Confira os dados da pessoa, os itens arrematados e o total devido.
3. Informe os valores recebidos por PIX e/ou em espécie.
4. Se restar saldo, descreva como e quando será pago; a observação é obrigatória.
5. Confirme o registro. A promissória atualizada é aberta para impressão.

O formulário calcula em tempo real o total informado, o troco e o saldo
restante. Cada recebimento é salvo na tabela `pagamentos`; os valores do caixa
e do PDF representam os pagamentos acumulados do arrematante.

### Promissória e recibo

Acesse `/promissoria/<pessoa_id>` para gerar o PDF de qualquer arrematante,
mesmo que ainda não tenha pagamentos. O documento contém os itens arrematados,
os valores acumulados recebidos por PIX e espécie, total pago, saldo devedor,
observação de pagamento, data e hora de emissão e campo para assinatura.

## Banco de dados

O schema de referência está em [`schema.sql`](./schema.sql). O script
[`init_db.py`](./init_db.py) cria e atualiza o banco de forma repetível.

A tabela `pagamentos` armazena cada lançamento associado a uma pessoa, incluindo
valor devedor na data do registro, valores recebidos, saldo, observação, status
(`LIQUIDADO` ou `PENDENTE`) e data do pagamento. A tabela referencia `pessoas`
por chave estrangeira.

## Atalhos de teclado

| Atalho | Ação |
| --- | --- |
| Alt+1 | Arrematação |
| Alt+2 | Cadastro |
| Alt+3 | Itens |
| Alt+4 | Pessoas cadastradas |
| Alt+5 | Caixa |
| F2 | Limpar a tela de arrematação ou editar a pessoa selecionada |
| F3 ou `/` | Ir para a busca nas listas |
| F4 | Cancelar o último lance |
| F7 | Marcar o item arrematado como doado |
| F8 | Abrir a promissória de outra pessoa |
| F9 | Ativar ou desativar a abertura automática da promissória |
| Setas e Enter | Navegar pela lista de pessoas e abrir a promissória |
| Tab | Alternar entre os valores de PIX e espécie no Caixa |
| Enter no campo de observação do Caixa | Confirmar o pagamento |
| Esc | Fechar a promissória ou cancelar a edição |

O Tailwind CSS e a fonte são carregados de uma CDN. Para uso sem internet,
configure esses recursos para serem servidos localmente.
