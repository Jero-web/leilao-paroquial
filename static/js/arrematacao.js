(() => {
  const { $, api, brl, esc, parseValor, PessoaPicker } = window.Leilao;
  const ordemEl = $('#ordem'), arrEl = $('#arrematante'), valorEl = $('#valor');
  const itemCard = $('#itemCard'), feedback = $('#feedback'), valorPrev = $('#valorPreview');
  const tbody = $('#ultimos'), btn = $('#btnAdd');

  let item = null;         // último item consultado
  let forcar = false;      // lance abaixo do mínimo aguardando confirmação
  let enviando = false;
  let ultimaPessoa = null; // base para o F8
  let ultimos = [];
  let avisoTimer = null;

  const picker = PessoaPicker(arrEl, $('#arrInfo'), { onSelect: () => { valorEl.focus(); valorEl.select(); } });

  // ------------------------------------------------------------------ feedback
  const ESTILOS = {
    ok: 'bg-pinheiro text-white',
    erro: 'bg-tijolo text-white',
    aviso: 'bg-ouro-claro text-tinta border-2 border-ouro',
  };
  function aviso(tipo, texto) {
    clearTimeout(avisoTimer);
    feedback.className = 'min-h-[4rem] rounded-lg px-4 py-3 text-lg font-semibold flex items-center ' + (tipo ? ESTILOS[tipo] : '');
    feedback.textContent = texto || '';
    if (tipo === 'ok') {
      feedback.classList.remove('flash'); void feedback.offsetWidth; feedback.classList.add('flash');
      avisoTimer = setTimeout(() => aviso(null), 10000);
    }
  }

  // ------------------------------------------------------------------ item
  function pintarItem(estado, it, msg) {
    const base = 'rounded-xl p-4 min-h-[8rem] ';
    if (estado === 'ok' || estado === 'vendido') {
      const vendido = estado === 'vendido';
      itemCard.className = base + (vendido ? 'bg-ouro-claro border-2 border-ouro' : 'bg-white border-2 border-pinheiro');
      const a = it.arrematado;
      itemCard.innerHTML =
        `<p class="text-sm text-tinta/70">Item nº ${it.id}</p>` +
        `<p class="text-2xl font-bold break-words">${esc(it.produto)}</p>` +
        (it.descricao ? `<p class="text-base mt-1">${esc(it.descricao)}</p>` : '') +
        `<div class="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-lg">` +
          `<span>Valor mínimo <strong>${brl(it.valor_minimo)}</strong></span>` +
          (it.doador_nome ? `<span>Doador <strong>${esc(it.doador_nome)}</strong></span>` : '') +
        `</div>` +
        (vendido ? `<p class="mt-3 font-bold text-tijolo">Já arrematado por ${esc(a.arrematante_nome)} (nº ${a.arrematante_id}) por ${brl(a.valor)}. ` +
                   `Cancele esse arremate para lançar de novo.</p>` : '');
    } else if (estado === 'erro') {
      itemCard.className = base + 'bg-tijolo-claro border-2 border-tijolo';
      itemCard.innerHTML = `<p class="text-lg font-bold text-tijolo">${esc(msg)}</p>`;
    } else {
      itemCard.className = base + 'border-2 border-dashed border-tinta/25';
      itemCard.innerHTML = '<p class="text-tinta/70">Digite o número de ordem e aperte Enter ou Tab. A descrição e o valor mínimo aparecem aqui.</p>';
    }
  }

  async function resolverItem() {
    const v = ordemEl.value.trim();
    if (!v) { item = null; pintarItem('vazio'); return null; }
    if (!/^\d+$/.test(v)) { item = null; pintarItem('erro', null, 'O número de ordem deve ter só dígitos.'); return null; }
    if (!item || String(item.id) !== v) {
      const r = await api('/api/item/' + v);
      if (!r.ok) { item = null; pintarItem('erro', null, r.data?.erro || 'Item não encontrado.'); return null; }
      item = r.data;
      valorEl.placeholder = item.valor_minimo > 0 ? 'mínimo ' + brl(item.valor_minimo) : '0,00';
    }
    if (item.arrematado) { pintarItem('vendido', item); return null; }
    pintarItem('ok', item);
    return item;
  }

  // ------------------------------------------------------------------ limpeza
  function limparCampos() {
    ordemEl.value = ''; valorEl.value = ''; valorEl.placeholder = '0,00';
    picker.limpar();
    valorPrev.textContent = ''; valorPrev.className = 'mt-1 min-h-[1.5rem] font-semibold';
    item = null; forcar = false;
    pintarItem('vazio');
  }
  function irParaOrdem() { ordemEl.focus(); ordemEl.select(); }

  // ------------------------------------------------------------------ lançar arremate
  async function adicionar() {
    if (enviando) return;
    enviando = true; btn.disabled = true;
    try {
      const it = await resolverItem();
      if (!it) { irParaOrdem(); return; }
      const p = await picker.resolver();
      if (!p) { arrEl.focus(); arrEl.select(); return; }
      const v = parseValor(valorEl.value);
      if (v === null || v <= 0) { aviso('erro', 'Informe o valor do arremate.'); valorEl.focus(); valorEl.select(); return; }

      const r = await api('/api/arremates', {
        method: 'POST',
        body: JSON.stringify({ item_id: it.id, arrematante_id: p.id, valor: valorEl.value, forcar }),
      });
      if (r.ok) {
        const a = r.data;
        ultimaPessoa = p;
        limparCampos();
        aviso('ok', `Arrematado: item ${a.item_id} (${a.produto}) para ${a.arrematante_nome}, nº ${a.arrematante_id}, por ${brl(a.valor)}`);
        carregarUltimos();
        ordemEl.focus();
        return;
      }
      if (r.status === 409 && r.data?.codigo === 'abaixo_minimo') {
        forcar = true;
        aviso('aviso', `${r.data.erro} Enter confirma assim mesmo, Esc deixa corrigir.`);
        valorEl.focus();
        return;
      }
      if (r.data?.codigo === 'ja_arrematado') item = null;
      aviso('erro', r.data?.erro || 'Não foi possível registrar o arremate.');
      if (r.data?.campo === 'valor') { valorEl.focus(); valorEl.select(); } else irParaOrdem();
    } finally {
      enviando = false; btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------ últimas 5
  function renderUltimos() {
    if (!ultimos.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-3 py-6 text-center text-tinta/70">Nenhum arremate ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = ultimos.map(a =>
      `<tr class="border-t border-tinta/10">` +
        `<td class="px-3 py-2 align-top"><span class="font-bold tabular-nums">${a.item_id}</span></td>` +
        `<td class="px-3 py-2"><div class="font-semibold break-words">${esc(a.produto)}</div>` +
          `<div class="text-sm text-tinta/70">${esc(a.arrematante_nome)} (nº ${a.arrematante_id})</div></td>` +
        `<td class="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">${brl(a.valor)}</td>` +
        `<td class="px-3 py-2 text-right"><button type="button" data-id="${a.id}" ` +
          `class="text-tijolo font-semibold underline focus:outline-none focus-visible:ring-4 focus-visible:ring-ouro rounded" ` +
          `aria-label="Cancelar arremate do item ${a.item_id}">Cancelar</button></td>` +
      `</tr>`).join('');
  }
  async function carregarUltimos() {
    const r = await api('/api/arremates/ultimos');
    ultimos = r.ok ? r.data : [];
    renderUltimos();
  }
  async function cancelar(a) {
    if (!a || !confirm(`Cancelar o arremate do item ${a.item_id} (${a.produto}) para ${a.arrematante_nome}?`)) { ordemEl.focus(); return; }
    const r = await api('/api/arremates/' + a.id, { method: 'DELETE' });
    item = null;
    aviso(r.ok ? 'aviso' : 'erro', r.ok ? `Arremate do item ${a.item_id} cancelado. O item pode ser lançado de novo.` : (r.data?.erro || 'Não foi possível cancelar.'));
    await carregarUltimos();
    if (ordemEl.value.trim()) resolverItem();
    irParaOrdem();
  }
  tbody.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) cancelar(ultimos.find(a => String(a.id) === b.dataset.id));
  });

  // ------------------------------------------------------------------ campos e Enter
  ordemEl.addEventListener('input', () => { item = null; forcar = false; });
  ordemEl.addEventListener('blur', () => { if (ordemEl.value.trim()) resolverItem(); });
  ordemEl.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    if (await resolverItem()) { arrEl.focus(); arrEl.select(); }
  });

  arrEl.addEventListener('input', () => { forcar = false; });
  arrEl.addEventListener('keydown', async e => { // texto: a lista (autocomplete) trata o Enter antes deste
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    if (await picker.resolver()) { valorEl.focus(); valorEl.select(); }
  });

  valorEl.addEventListener('input', () => {
    forcar = false;
    const v = parseValor(valorEl.value);
    if (v !== null && v > 0) {
      const abaixo = item && v < item.valor_minimo;
      valorPrev.textContent = brl(v) + (abaixo ? ' (abaixo do mínimo)' : '');
      valorPrev.className = 'mt-1 min-h-[1.5rem] font-semibold ' + (abaixo ? 'text-tijolo' : 'text-pinheiro');
    } else {
      valorPrev.textContent = '';
    }
  });
  valorEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    adicionar();
  });
  btn.addEventListener('click', adicionar);

  // ------------------------------------------------------------------ F8: promissória
  const modal = $('#modal'), pmEl = $('#pmPessoa');
  const pm = PessoaPicker(pmEl, $('#pmInfo'));
  const modalAberto = () => !modal.classList.contains('hidden');

  async function abrirModal() {
    let base = picker.atual;
    if (!base && arrEl.value.trim()) base = await picker.resolver();
    base = base || ultimaPessoa;
    pm.limpar();
    if (base) pm.definir(base);
    modal.classList.remove('hidden'); modal.classList.add('flex');
    pmEl.focus(); pmEl.select();
  }
  function fecharModal() {
    modal.classList.add('hidden'); modal.classList.remove('flex');
    irParaOrdem();
  }
  async function abrirPdf() {
    const p = await pm.resolver();
    if (!p) { pmEl.focus(); return; }
    window.open('/promissoria/' + p.id, '_blank');
    fecharModal();
  }
  pmEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    abrirPdf();
  });
  $('#pmAbrir').addEventListener('click', abrirPdf);
  $('#pmFechar').addEventListener('click', fecharModal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) fecharModal(); });
  modal.addEventListener('keydown', e => { // mantém o Tab dentro do modal
    if (e.key !== 'Tab') return;
    const foc = [...modal.querySelectorAll('input, button')];
    const primeiro = foc[0], ultimo = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  });

  // ------------------------------------------------------------------ atalhos globais
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (modalAberto()) { e.preventDefault(); fecharModal(); }
      else if (forcar) { e.preventDefault(); forcar = false; aviso(null); valorEl.focus(); valorEl.select(); }
      return;
    }
    if (modalAberto()) return;
    if (e.key === 'F2') { e.preventDefault(); limparCampos(); aviso(null); irParaOrdem(); }
    else if (e.key === 'F4') { e.preventDefault(); cancelar(ultimos[0]); }
    else if (e.key === 'F8') { e.preventDefault(); abrirModal(); }
  });

  pintarItem('vazio');
  carregarUltimos();
  ordemEl.focus();
})();
