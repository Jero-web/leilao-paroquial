(() => {
  const { $, api, enterFlow, mascarar, PessoaPicker, parseValor, brl, esc } = window.Leilao;
  const form = $('#form'), msg = $('#msg');
  const ordem = $('#ordem'), produto = $('#produto'), valorMin = $('#valor_minimo'), descricao = $('#descricao'), doador = $('#doador');
  const picker = PessoaPicker(doador, $('#doadorInfo'));
  const tipoSel = $('#tipo'), tipoNovo = $('#tipoNovo'), tipoNome = $('#tipoNome'), tipoMsg = $('#tipoMsg'), tipoAviso = $('#tipoAviso');
  const cartao = $('#cartao'), vazio = $('#vazio');
  let salvando = false;
  let editando = null;      // número de ordem do item que está sendo alterado (null = cadastrando)

  const erro = t => { msg.textContent = t || ''; };

  // manterTipo: ao salvar vários itens do mesmo tipo em sequência, o tipo escolhido continua selecionado
  function limpar(proximo, manterTipo = false) {
    produto.value = ''; valorMin.value = ''; descricao.value = '';
    if (!manterTipo) tipoSel.value = '';
    tipoAviso.textContent = '';
    picker.limpar(); erro('');
    if (proximo !== undefined) ordem.value = proximo;
    ordem.focus(); ordem.select();
  }

  function mostrarCartao(it, atualizado = false) {
    $('#cartaoRotulo').textContent = atualizado ? 'Item atualizado' : 'Item cadastrado';
    $('#cartaoNumero').textContent = it.id;
    $('#cartaoProduto').textContent = it.produto;
    $('#cartaoTipo').textContent = it.tipo_nome ? 'Tipo: ' + it.tipo_nome : 'Sem tipo';
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
    const r = await api(editando ? '/api/itens/' + editando : '/api/itens', {
      method: editando ? 'PUT' : 'POST',
      body: JSON.stringify({
        id: ordem.value.trim(), produto: produto.value, valor_minimo: valorMin.value, tipo_id: tipoSel.value,
        descricao: descricao.value, doador_id: doadorId,
      }),
    });
    salvando = false;
    if (!r.ok) {
      erro(r.data?.erro || 'Não foi possível salvar.');
      if (r.data?.campo === 'id') { ordem.focus(); ordem.select(); }
      return;
    }
    const foiEdicao = !!editando;
    mostrarCartao(r.data, foiEdicao);
    if (foiEdicao) sairEdicao(r.data.proximo); else limpar(r.data.proximo, true);
    document.dispatchEvent(new CustomEvent('itens:salvo'));
  }

  enterFlow([ordem, produto, valorMin, tipoSel, descricao, doador], salvar, {
    produto: async () => { if (produto.value.trim()) return true; erro('Informe o produto.'); return false; },
    doador: async () => !doador.value.trim() || !!(await picker.resolver()),
  });
  form.addEventListener('submit', e => { e.preventDefault(); salvar(); });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); salvar(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); if (editando) sairEdicao(); else limpar(); }
    else if (e.key === 'Escape' && editando && !e.defaultPrevented) { e.preventDefault(); sairEdicao(); }
  });

  // ------------------------------------------------------------------ alterar item cadastrado
  const banner = $('#bannerEdicao'), tituloForm = $('#tituloForm'), btnTxt = $('#btnSalvarTxt');
  const moeda = v => (v > 0 ? Number(v).toFixed(2).replace('.', ',') : '');

  async function entrarEdicao(it) {
    editando = it.id;
    await carregarTipos(it.tipo_id ?? '');
    ordem.value = it.id;
    produto.value = it.produto || '';
    valorMin.value = moeda(it.valor_minimo);
    descricao.value = it.descricao || '';
    if (it.doador_id) picker.definir({ id: it.doador_id, nome: it.doador_nome }); else picker.limpar();
    erro(''); tipoAviso.textContent = '';
    $('#edNum').textContent = it.id;
    banner.classList.remove('hidden');
    tituloForm.textContent = 'Alterar item';
    btnTxt.textContent = 'Salvar alterações';
    window.scrollTo(0, 0);
    produto.focus(); produto.select();
  }

  async function sairEdicao(proximo) {
    editando = null;
    banner.classList.add('hidden');
    tituloForm.textContent = 'Cadastro de itens';
    btnTxt.textContent = 'Salvar item';
    if (proximo === undefined) {                       // cancelou: volta o próximo número livre
      const r = await api('/api/itens/proximo');
      proximo = r.ok ? r.data.proximo : '';
    }
    limpar(proximo);
  }

  $('#edCancelar').addEventListener('click', () => sairEdicao());
  document.addEventListener('itens:editar', e => entrarEdicao(e.detail));
  document.addEventListener('itens:excluido', e => { if (editando === e.detail.id) sairEdicao(); });

  // ------------------------------------------------------------------ tipos de item
  async function carregarTipos(selecionarId) {
    const r = await api('/api/tipos');
    if (!r.ok) return;
    const atual = selecionarId !== undefined ? String(selecionarId) : tipoSel.value;
    tipoSel.innerHTML = '<option value="">Sem tipo</option>' +
      r.data.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
    tipoSel.value = [...tipoSel.options].some(o => o.value === atual) ? atual : '';
  }

  function abrirNovoTipo() {
    tipoMsg.textContent = ''; tipoAviso.textContent = '';
    tipoNome.value = '';
    tipoNovo.classList.remove('hidden');
    tipoNome.focus();
  }
  function fecharNovoTipo() { tipoNovo.classList.add('hidden'); tipoSel.focus(); }

  async function salvarNovoTipo() {
    const nome = tipoNome.value.trim().replace(/\s+/g, ' ');
    if (!nome) { tipoMsg.textContent = 'Digite o nome do tipo.'; tipoNome.focus(); return; }
    const r = await api('/api/tipos', { method: 'POST', body: JSON.stringify({ nome }) });
    if (r.ok) {
      await carregarTipos(r.data.id);            // o tipo novo já fica selecionado
      tipoAviso.textContent = `Tipo "${r.data.nome}" cadastrado e selecionado.`;
      fecharNovoTipo();
    } else if (r.status === 409 && r.data?.tipo) {
      await carregarTipos(r.data.tipo.id);       // já existia: só seleciona
      tipoAviso.textContent = `O tipo "${r.data.tipo.nome}" já existia e foi selecionado.`;
      fecharNovoTipo();
    } else {
      tipoMsg.textContent = r.data?.erro || 'Não foi possível cadastrar o tipo.';
      tipoNome.focus();
    }
  }

  $('#tipoMais').addEventListener('click', abrirNovoTipo);
  $('#tipoSalvar').addEventListener('click', salvarNovoTipo);
  $('#tipoCancelar').addEventListener('click', fecharNovoTipo);
  tipoSel.addEventListener('keydown', e => { if (e.key === '+') { e.preventDefault(); abrirNovoTipo(); } });
  tipoNome.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); salvarNovoTipo(); }
    else if (e.key === 'Escape') { e.preventDefault(); fecharNovoTipo(); }
  });
  // Outro operador pode ter cadastrado tipos: ao voltar para esta aba, atualiza a lista mantendo a escolha.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarTipos(); });

  carregarTipos();
  ordem.focus(); ordem.select();
})();
