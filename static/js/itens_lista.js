(() => {
  const { $, api, brl, esc } = window.Leilao;
  const busca = $('#fBusca'), sit = $('#fSituacao'), doa = $('#fDoacao');
  const conta = $('#fContagem'), linhas = $('#linhasItens');
  const aviso = $('#fAviso');
  let timer = null, seq = 0, atuais = [];

  const PILULA = 'inline-block rounded-full px-2 py-0.5 text-sm font-bold ';

  function render(lista, filtrando) {
    if (!lista.length) {
      linhas.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-tinta/70">` +
        (filtrando ? 'Nenhum item encontrado com esses filtros.' : 'Nenhum item cadastrado ainda.') + '</td></tr>';
      return;
    }
    linhas.innerHTML = lista.map(it => {
      const situacao = it.arrematante_id
        ? `<span class="font-semibold">Arrematado</span><div class="text-sm text-tinta/70">${esc(it.arrematante_nome)} (nº ${it.arrematante_id}), ${brl(it.lance_valor)}</div>`
        : `<span class="${PILULA}border-2 border-pinheiro text-pinheiro">Disponível</span>`;
      const doado = it.doacoes > 0
        ? `<span class="${PILULA}bg-ouro-claro border border-ouro text-tinta">Doado ${it.doacoes}x</span>` : '';
      return `<tr class="border-t border-tinta/10">` +
        `<td class="px-4 py-3 font-extrabold tabular-nums text-pinheiro">${it.id}</td>` +
        `<td class="px-4 py-3"><div class="font-semibold break-words">${esc(it.produto)}</div>` +
          (it.descricao ? `<div class="text-sm text-tinta/70 break-words">${esc(it.descricao)}</div>` : '') + `</td>` +
        `<td class="px-4 py-3">${esc(it.tipo_nome || '')}</td>` +
        `<td class="px-4 py-3">${esc(it.doador_nome || '')}</td>` +
        `<td class="px-4 py-3 text-right tabular-nums whitespace-nowrap">${brl(it.valor_minimo)}</td>` +
        `<td class="px-4 py-3">${situacao}</td>` +
        `<td class="px-4 py-3 whitespace-nowrap">${doado}</td>` +
        `<td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-2">` +
          `<a href="/arrematacao?item=${it.id}" class="botao botao-sec botao-pequeno whitespace-nowrap" aria-label="Arrematar o item ${it.id}">Arrematar</a>` +
          `<button type="button" data-acao="editar" data-id="${it.id}" class="botao botao-sec botao-pequeno" aria-label="Editar o item ${it.id}">Editar</button>` +
          `<button type="button" data-acao="excluir" data-id="${it.id}" class="botao botao-perigo botao-pequeno" aria-label="Excluir o item ${it.id}">Excluir</button>` +
        `</div></td>` +
      `</tr>`;
    }).join('');
  }

  async function carregar() {
    const minha = ++seq;
    const qs = new URLSearchParams({ q: busca.value.trim(), situacao: sit.value, doacao: doa.value });
    const r = await api('/api/itens?' + qs);
    if (minha !== seq) return;                      // chegou uma resposta mais nova
    if (!r.ok) { conta.textContent = r.data?.erro || 'Não foi possível carregar os itens.'; return; }
    const filtrando = !!(busca.value.trim() || sit.value || doa.value);
    atuais = r.data.itens;
    render(atuais, filtrando);
    const t = r.data.total;
    conta.textContent = `${t} ${t === 1 ? 'item' : 'itens'}` +
      (t > r.data.itens.length ? `, mostrando os ${r.data.itens.length} primeiros. Refine a busca para ver os demais.` : '');
  }

  function mostrarAviso(texto, erroFlag = false) {
    aviso.textContent = texto;
    aviso.className = 'mb-2 font-semibold min-h-[1.5rem] ' + (erroFlag ? 'text-tijolo' : 'text-pinheiro');
  }

  async function excluir(it) {
    if (!confirm(`Excluir o item ${it.id} (${it.produto})?\n\nEssa ação não pode ser desfeita.`)) return;
    let r = await api('/api/itens/' + it.id, { method: 'DELETE' });
    if (r.status === 409 && r.data?.codigo === 'tem_lances') {      // já houve lances: exige uma segunda confirmação
      const d = r.data;
      const vendas = d.vendas.length
        ? '\n\nVendas que serão apagadas:\n' + d.vendas.map(v => `• ${v.nome}: ${brl(v.valor)}${v.doado ? ' (doado)' : ''}`).join('\n') : '';
      if (!confirm(`${d.erro}${vendas}\n\nSe você excluir mesmo assim, o item e todos os lances dele serão apagados e as promissórias dessas pessoas mudam. Continuar?`)) return;
      r = await api('/api/itens/' + it.id + '?forcar=1', { method: 'DELETE' });
    }
    if (!r.ok) { mostrarAviso(r.data?.erro || 'Não foi possível excluir o item.', true); return; }
    document.dispatchEvent(new CustomEvent('itens:excluido', { detail: { id: it.id } }));
    await carregar();
    mostrarAviso(`Item ${it.id} (${it.produto}) excluído.` + (r.data.lances_apagados ? ` ${r.data.lances_apagados} lance(s) apagado(s) junto.` : ''));
  }

  linhas.addEventListener('click', e => {
    const b = e.target.closest('button[data-acao]');
    const it = b && atuais.find(x => String(x.id) === b.dataset.id);
    if (!it) return;
    if (b.dataset.acao === 'editar') document.dispatchEvent(new CustomEvent('itens:editar', { detail: it }));
    else excluir(it);
  });

  busca.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; carregar(); }, 150);
  });
  busca.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); busca.value = ''; carregar(); } });
  sit.addEventListener('change', carregar);
  doa.addEventListener('change', carregar);
  $('#fLimpar').addEventListener('click', () => { busca.value = ''; sit.value = ''; doa.value = ''; carregar(); busca.focus(); });

  document.addEventListener('keydown', e => {
    const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'F3' || (e.key === '/' && !digitando)) { e.preventDefault(); busca.focus(); busca.select(); }
  });
  document.addEventListener('itens:salvo', carregar);                              // item novo aparece na lista
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); }); // volta de outra tela/aba

  carregar();
})();
