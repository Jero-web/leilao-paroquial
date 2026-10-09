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

## Atalhos
Alt+1 Arrematação, Alt+2 Cadastro, Alt+3 Itens, Alt+4 Pessoas cadastradas.
Arrematação: F2 limpa, F4 cancela o último lance, F8 promissória de outro cliente, F9 liga/desliga a promissória automática.
Lista de pessoas: setas escolhem, Enter abre a promissória, Esc limpa a busca, F3 ou / voltam para a busca.

O Tailwind e a fonte vêm de CDN: a máquina precisa de internet (ou baixe o Tailwind e sirva localmente).
