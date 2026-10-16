# Leilão Paroquial

    pip install -r requirements.txt
    python app.py          # abre em http://localhost:5000 (outros PCs: http://IP-DESTE-PC:5000)

Nome no cabeçalho e na promissória: `LEILAO_NOME="Festa de São José" python app.py`
Bancos criados pela versão anterior são migrados sozinhos na primeira execução.

## Regras do lance
- O valor precisa atingir o mínimo do item (igual ao mínimo vale) e ser MAIOR que o maior lance atual.
- Lance válido: vira o novo maior arrematante do item. Lance recusado mostra o motivo e não grava nada.
- Todos os lances ficam registrados. Cancelar o maior lance devolve a liderança ao anterior.
- A promissória de cada pessoa lista só os itens em que ela é a maior arrematante.

## Doação do item arrematado
- Na Arrematação, com o item na tela, clique em "O arrematante doou o item" ou aperte F7. Com a tela limpa, F7 doa o último lance salvo. Também há o botão Doar na lista das últimas 5.
- A venda continua valendo: o item segue na promissória do comprador, marcado com (D), e o valor entra no total dele.
- O item volta ao leilão: qualquer pessoa (inclusive quem doou) pode arrematar a partir do valor mínimo, sem precisar superar o valor doado.
- Se o mesmo comprador arrematar de novo, a promissória dele mostra as duas vendas (uma com D).
- Doação feita por engano: "Desfazer doação" na lista das últimas 5, enquanto ninguém tiver dado lance depois.

## Itens
Tipo do item: no cadastro, o campo Tipo lista os tipos existentes; o botão + (ou a tecla + no campo) abre o cadastro de um novo tipo, que já fica selecionado. Ao salvar vários itens seguidos, o tipo escolhido se mantém.

Na tela Itens, abaixo do cadastro, há a lista com filtros: busca (número, produto, tipo, descrição, doador), situação (disponíveis/arrematados) e doações (já doados/nunca doados). Itens doados mostram "Doado 2x" (a contagem total). "Arrematar" abre a Arrematação já com o item carregado.

## Alterar e excluir
- Itens (lista na tela Itens): "Editar" leva o item para o formulário (Esc cancela). Dá para mudar produto, valor mínimo, tipo, descrição e doador. O número de ordem só muda se o item ainda não tem lances.
- Pessoas (tela Pessoas cadastradas): "Alterar" abre uma janela com os dados (F2 altera a pessoa marcada). O número de cadastro não muda.
- Excluir sempre pede confirmação. Item ou pessoa com lances registrados só é excluído numa segunda confirmação, que mostra o que será apagado: os lances dela/dele também saem, e as promissórias mudam.
- Ao excluir uma pessoa, os itens que ela doou continuam cadastrados, só ficam sem doador.

## Atalhos
Alt+1 Arrematação, Alt+2 Cadastro, Alt+3 Itens, Alt+4 Pessoas cadastradas.
Arrematação: F2 limpa, F4 cancela o último lance, F8 promissória de outro cliente, F7 item doado, F9 liga/desliga a promissória automática.
Itens e Pessoas cadastradas: F3 ou / vão para a busca.
Lista de pessoas: setas escolhem, Enter abre a promissória, Esc limpa a busca, F3 ou / voltam para a busca.

O Tailwind e a fonte vêm de CDN: a máquina precisa de internet (ou baixe o Tailwind e sirva localmente).
