(() => {
  const { $, api, enterFlow, mascarar, PessoaPicker, parseValor, brl } = window.Leilao;
  const form = $('#form'), msg = $('#msg');
  const ordem = $('#ordem'), produto = $('#produto'), valorMin = $('#valor_minimo'), descricao = $('#descricao'), doador = $('#doador');
  const picker = PessoaPicker(doador, $('#doadorInfo'));
  const cartao = $('#cartao'), vazio = $('#vazio');
  let salvando = false;

  const erro = t => { msg.textContent = t || ''; };

  function limpar(proximo) {
    produto.value = ''; valorMin.value = ''; descricao.value = '';
    picker.limpar(); erro('');
    if (proximo !== undefined) ordem.value = proximo;
    ordem.focus(); ordem.select();
  }

  function mostrarCartao(it) {
    $('#cartaoNumero').textContent = it.id;
    $('#cartaoProduto').textContent = it.produto;
    $('#cartaoMin').textContent = it.valor_minimo > 0 ? 'Valor mínimo ' + brl(it.valor_minimo) : 'Sem valor mínimo';
    $('#cartaoDoador').textContent = it.doador_nome ? 'Doador: ' + it.doador_nome : 'Sem doador informado';
    vazio.classList.add('hidden');
    cartao.classList.remove('hidden');
    cartao.classList.remove('flash'); void cartao.offsetWidth; cartao.classList.add('flash');
  }

  async function salvar() {
    if (salvando) return;
    erro('');
    if (!/^\d*$/.test(ordem.value.trim())) { erro('O número de ordem deve ter só dígitos.'); ordem.focus(); return; }
    if (!produto.value.trim()) { erro('Informe o produto.'); produto.focus(); return; }
    if (valorMin.value.trim() && parseValor(valorMin.value) === null) { erro('Valor mínimo inválido.'); valorMin.focus(); return; }
    let doadorId = null;
    if (doador.value.trim()) {
      const p = await picker.resolver();
      if (!p) { doador.focus(); return; }
      doadorId = p.id;
    }
    salvando = true;
    const r = await api('/api/itens', {
      method: 'POST',
      body: JSON.stringify({
        id: ordem.value.trim(), produto: produto.value, valor_minimo: valorMin.value,
        descricao: descricao.value, doador_id: doadorId,
      }),
    });
    salvando = false;
    if (!r.ok) {
      erro(r.data?.erro || 'Não foi possível salvar.');
      if (r.data?.campo === 'id') { ordem.focus(); ordem.select(); }
      return;
    }
    mostrarCartao(r.data);
    limpar(r.data.proximo);
  }

  enterFlow([ordem, produto, valorMin, descricao, doador], salvar, {
    produto: async () => { if (produto.value.trim()) return true; erro('Informe o produto.'); return false; },
    doador: async () => !doador.value.trim() || !!(await picker.resolver()),
  });
  form.addEventListener('submit', e => { e.preventDefault(); salvar(); });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); salvar(); } });
  document.addEventListener('keydown', e => { if (e.key === 'F2') { e.preventDefault(); limpar(); } });
  ordem.focus(); ordem.select();
})();
