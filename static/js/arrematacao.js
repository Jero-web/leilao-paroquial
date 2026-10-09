(() => {
  const { $, api, brl, esc, parseValor, PessoaPicker } = window.Leilao;
  const ordemEl = $('#ordem'), arrEl = $('#arrematante'), valorEl = $('#valor');
  const itemCard = $('#itemCard'), feedback = $('#feedback'), valorPrev = $('#valorPreview');
  const tbody = $('#ultimos'), btn = $('#btnAdd'), chk = $('#chkPromissoria');

  let item = null;         // último item consultado (inclui o maior lance atual em item.arrematado)
  let enviando = false;
  let ultimaPessoa = null; // base para o F8
  let ultimos = [];
  let avisoTimer = null;

  // "Abrir promissória ao salvar" fica ligado por padrão e lembra a escolha deste computador.
  const CHAVE = 'leilao.abrirPromissoria';
  try { chk.checked = localStorage.getItem(CHAVE) !== '0'; } catch (_) { /* storage indisponível */ }
  chk.addEventListener('change', () => { try { localStorage.setItem(CHAVE, chk.checked ? '1' : '0'); } catch (_) {} });

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

  // ------------------------------------------------------------------ item e regras do lance
  function pintarItem(estado, it, msg) {
    const base = 'rounded-xl p-4 min-h-[8rem] ';
    if (estado === 'ok') {
      itemCard.className = base + 'bg-white border-2 border-pinheiro';
      const l = it.arrematado;
      itemCard.innerHTML =
        `<p class="text-sm text-tinta/70">Item nº ${it.id}</p>` +
        `<p class="text-2xl font-bold break-words">${esc(it.produto)}</p>` +
        (it.descricao ? `<p class="text-base mt-1">${esc(it.descricao)}</p>` : '') +
        `<div class="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-lg">` +
          `<span>Valor mínimo <strong>${brl(it.valor_minimo)}</strong></span>` +
          (it.doador_nome ? `<span>Doador <strong>${esc(it.doador_nome)}</strong></span>` : '') +
        `</div>` +
        (l
          ? `<div class="mt-3 rounded-lg bg-ouro-claro border-2 border-ouro px-3 py-2">` +
              `<span class="font-semibold">Maior lance atual:</span> <strong class="tabular-nums">${brl(l.valor)}</strong> ` +
              `de ${esc(l.arrematante_nome)} (nº ${l.arrematante_id}). O novo lance precisa ser maior.</div>`
          : `<p class="mt-3 text-tinta/70">Sem lances ainda. O primeiro lance precisa atingir o valor mínimo.</p>`);
    } else if (estado === 'erro') {
      itemCard.className = base + 'bg-tijolo-claro border-2 border-tijolo';
      itemCard.innerHTML = `<p class="text-lg font-bold text-tijolo">${esc(msg)}</p>`;
    } else {
      itemCard.className = base + 'border-2 border-dashed border-tinta/25';
      itemCard.innerHTML = '<p class="text-tinta/70">Digite o número de ordem e aperte Enter ou Tab. A descrição, o valor mínimo e o maior lance atual aparecem aqui.</p>';
    }
  }

  // Mesma regra do servidor: atingir o mínimo (igual vale) e superar o maior lance atual.
  function problemaValor(v) {
    if (!item) return null;
    if (v < item.valor_minimo - 1e-9) return `não atinge o mínimo do item (${brl(item.valor_minimo)})`;
    const l = item.arrematado;
    if (l && v <= l.valor + 1e-9) return `precisa ser maior que o maior lance atual (${brl(l.valor)})`;
    return null;
  }

  function dicaValor() {
    const l = item?.arrematado;
    valorEl.placeholder = l ? 'acima de ' + brl(l.valor)
      : (item && item.valor_minimo > 0 ? 'mínimo ' + brl(item.valor_minimo) : '0,00');
  }

  async function resolverItem() {
    const v = ordemEl.value.trim();
    if (!v) { item = null; pintarItem('vazio'); dicaValor(); return null; }
    if (!/^\d+$/.test(v)) { item = null; pintarItem('erro', null, 'O número de ordem deve ter só dígitos.'); return null; }
    if (!item || String(item.id) !== v) {
      const r = await api('/api/item/' + v);
      if (!r.ok) { item = null; pintarItem('erro', null, r.data?.erro || 'Item não encontrado.'); dicaValor(); return null; }
      item = r.data;
    }
    pintarItem('ok', item);
    dicaValor();
    atualizarPreview();
    return item;
  }

  function atualizarPreview() {
    const v = parseValor(valorEl.value);
    if (v !== null && v > 0) {
      const prob = problemaValor(v);
      valorPrev.textContent = brl(v) + (prob ? ` (${prob})` : '');
      valorPrev.className = 'mt-1 min-h-[1.5rem] font-semibold ' + (prob ? 'text-tijolo' : 'text-pinheiro');
    } else {
      valorPrev.textContent = '';
    }
  }

  // ------------------------------------------------------------------ limpeza
  function limparCampos() {
    ordemEl.value = ''; valorEl.value = '';
    picker.limpar();
    valorPrev.textContent = '';
    item = null;
    pintarItem('vazio'); dicaValor();
  }
  function irParaOrdem() { ordemEl.focus(); ordemEl.select(); }

  // ------------------------------------------------------------------ salvar arremate
  async function salvar() {
    if (enviando) return;
    enviando = true; btn.disabled = true;
    try {
      item = null;                      // sempre confere o maior lance atual antes de salvar
      const it = await resolverItem();
      if (!it) { irParaOrdem(); return; }
      const p = await picker.resolver();
      if (!p) { arrEl.focus(); arrEl.select(); return; }
      const v = parseValor(valorEl.value);
      if (v === null || v <= 0) { aviso('erro', 'Informe o valor do arremate.'); valorEl.focus(); valorEl.select(); return; }
      const prob = problemaValor(v);
      if (prob) { aviso('erro', `Lance recusado: o valor ${prob}.`); valorEl.focus(); valorEl.select(); return; }

      const r = await api('/api/arremates', {
        method: 'POST',
        body: JSON.stringify({ item_id: it.id, arrematante_id: p.id, valor: valorEl.value }),
      });
      if (r.ok) {
        const a = r.data;
        ultimaPessoa = p;
        const abrir = chk.checked;
        limparCampos();
        aviso('ok', `Novo maior lance do item ${a.item_id} (${a.produto}): ${a.arrematante_nome}, nº ${a.arrematante_id}, ${brl(a.valor)}.` +
                    (a.anterior ? ` Superou ${a.anterior.nome} (${brl(a.anterior.valor)}).` : ''));
        carregarUltimos();
        if (abrir) abrirPromissoria(p); else ordemEl.focus();
        return;
      }
      aviso('erro', r.data?.erro || 'Não foi possível registrar o arremate.');
      if (r.data?.codigo) { item = null; await resolverItem(); }   // alguém pode ter dado outro lance: atualiza o cartão
      if (r.data?.campo === 'valor' || r.data?.codigo) { valorEl.focus(); valorEl.select(); } else irParaOrdem();
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
          `<div class="text-sm text-tinta/70">${esc(a.arrematante_nome)} (nº ${a.arrematante_id})` +
          (a.lider ? '' : ' <span class="font-semibold text-tijolo">lance superado</span>') + `</div></td>` +
        `<td class="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">${brl(a.valor)}</td>` +
        `<td class="px-3 py-2 text-right"><button type="button" data-id="${a.id}" ` +
          `class="text-tijolo font-semibold underline focus:outline-none focus-visible:ring-4 focus-visible:ring-ouro rounded" ` +
          `aria-label="Cancelar lance do item ${a.item_id}">Cancelar</button></td>` +
      `</tr>`).join('');
  }
  async function carregarUltimos() {
    const r = await api('/api/arremates/ultimos');
    ultimos = r.ok ? r.data : [];
    renderUltimos();
  }
  async function cancelar(a) {
    if (!a) { ordemEl.focus(); return; }
    const aviso1 = a.lider ? ' O lance anterior do item, se houver, volta a valer.' : '';
    if (!confirm(`Cancelar o lance de ${brl(a.valor)} de ${a.arrematante_nome} no item ${a.item_id} (${a.produto})?${aviso1}`)) { ordemEl.focus(); return; }
    const r = await api('/api/arremates/' + a.id, { method: 'DELETE' });
    item = null;
    if (r.ok) {
      const l = r.data.lider;
      aviso('aviso', `Lance cancelado. ` + (l
        ? `Maior lance atual do item ${a.item_id}: ${brl(l.valor)} de ${l.arrematante_nome}.`
        : `O item ${a.item_id} está sem lances.`));
    } else {
      aviso('erro', r.data?.erro || 'Não foi possível cancelar.');
    }
    await carregarUltimos();
    if (ordemEl.value.trim()) resolverItem();
    irParaOrdem();
  }
  tbody.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) cancelar(ultimos.find(a => String(a.id) === b.dataset.id));
  });

  // ------------------------------------------------------------------ campos e Enter
  ordemEl.addEventListener('input', () => { item = null; });
  ordemEl.addEventListener('blur', () => { if (ordemEl.value.trim()) resolverItem(); });
  ordemEl.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    if (await resolverItem()) { arrEl.focus(); arrEl.select(); }
  });

  arrEl.addEventListener('keydown', async e => { // texto: a lista (autocomplete) trata o Enter antes deste
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    if (await picker.resolver()) { valorEl.focus(); valorEl.select(); }
  });

  valorEl.addEventListener('input', atualizarPreview);
  valorEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    salvar();
  });
  btn.addEventListener('click', salvar);

  // ------------------------------------------------------------------ promissória (modal com PDF)
  const modal = $('#modal'), pmEl = $('#pmPessoa'), frame = $('#pmFrame');
  const pmImprimir = $('#pmImprimir'), pmNova = $('#pmNovaAba');
  let esperandoPdf = false;
  const pm = PessoaPicker(pmEl, $('#pmInfo'), { onSelect: p => carregarPdf(p) });
  const modalAberto = () => !modal.classList.contains('hidden');

  function carregarPdf(p) {
    const url = '/promissoria/' + p.id;
    pmNova.href = url;
    pmImprimir.disabled = true;
    esperandoPdf = true;
    frame.classList.remove('hidden');
    frame.src = url + '?v=' + Date.now();  // evita PDF antigo em cache
  }
  frame.addEventListener('load', () => {
    if (!esperandoPdf) return;
    esperandoPdf = false;
    pmImprimir.disabled = false;
    setTimeout(() => pmImprimir.focus(), 150); // o leitor de PDF costuma roubar o foco: devolve ao botão
  });

  function mostrarModal() { modal.classList.remove('hidden'); modal.classList.add('flex'); }
  function abrirPromissoria(p) {         // chamado logo após salvar: já mostra o PDF do arrematante
    pm.limpar(); pm.definir(p);
    mostrarModal();
    carregarPdf(p);
  }
  async function abrirModalF8() {        // escolher outro cliente
    let base = picker.atual;
    if (!base && arrEl.value.trim()) base = await picker.resolver();
    base = base || ultimaPessoa;
    pm.limpar();
    if (base) pm.definir(base);
    mostrarModal();
    pmEl.focus(); pmEl.select();
  }
  function fecharModal() {
    modal.classList.add('hidden'); modal.classList.remove('flex');
    esperandoPdf = false;
    frame.src = 'about:blank'; frame.classList.add('hidden');
    pmImprimir.disabled = true;
    irParaOrdem();
  }
  async function carregarDoCampo() {
    const p = await pm.resolver();
    if (p) carregarPdf(p); else pmEl.focus();
  }
  pmEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    carregarDoCampo();
  });
  $('#pmAbrir').addEventListener('click', carregarDoCampo);
  $('#pmFechar').addEventListener('click', fecharModal);
  pmImprimir.addEventListener('click', () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (_) { window.open(pmNova.href, '_blank'); }
  });
  modal.addEventListener('mousedown', e => { if (e.target === modal) fecharModal(); });
  modal.addEventListener('keydown', e => { // mantém o Tab dentro do modal
    if (e.key !== 'Tab') return;
    const foc = [...modal.querySelectorAll('input, button:not(:disabled), a[href]')];
    const primeiro = foc[0], ultimo = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  });

  // ------------------------------------------------------------------ atalhos globais
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalAberto()) { e.preventDefault(); fecharModal(); return; }
    if (e.key === 'F8') { e.preventDefault(); if (modalAberto()) { pmEl.focus(); pmEl.select(); } else abrirModalF8(); return; }
    if (modalAberto()) return;
    if (e.key === 'F2') { e.preventDefault(); limparCampos(); aviso(null); irParaOrdem(); }
    else if (e.key === 'F4') { e.preventDefault(); cancelar(ultimos[0]); }
    else if (e.key === 'F9') {
      e.preventDefault();
      chk.checked = !chk.checked; chk.dispatchEvent(new Event('change'));
      aviso('aviso', chk.checked ? 'A promissória vai abrir depois de cada arremate salvo.' : 'A promissória não vai mais abrir sozinha (F8 abre quando precisar).');
    }
  });

  pintarItem('vazio'); dicaValor();
  carregarUltimos();
  ordemEl.focus();
})();
