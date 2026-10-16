(() => {
  const { $, api, brl, esc, enterFlow, mascarar, maskCpf, maskTel } = window.Leilao;
  const busca = $('#busca'), linhas = $('#linhas'), contagem = $('#contagem');
  let lista = [], sel = 0, timer = null, seq = 0;

  const ICONE = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
    '<path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';

  function render() {
    if (!lista.length) {
      linhas.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-tinta/70">` +
        (busca.value.trim() ? 'Nenhuma pessoa encontrada com essa busca.' : 'Nenhuma pessoa cadastrada ainda.') + '</td></tr>';
      return;
    }
    linhas.innerHTML = lista.map((p, i) =>
      `<tr data-i="${i}" class="border-t border-tinta/10">` +
        `<td class="px-4 py-3 font-extrabold tabular-nums text-pinheiro">${p.id}</td>` +
        `<td class="px-4 py-3"><div class="font-semibold break-words">${esc(p.nome)}</div>` +
          (p.cpf ? `<div class="text-sm text-tinta/70">${esc(p.cpf)}</div>` : '') + `</td>` +
        `<td class="px-4 py-3 whitespace-nowrap">${esc(p.telefone || '')}</td>` +
        `<td class="px-4 py-3">${p.funcao === 'COMISSAO' ? 'Comissão' : 'Cliente'}</td>` +
        `<td class="px-4 py-3 text-right tabular-nums">${p.qtd_itens}</td>` +
        `<td class="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">${brl(p.total)}</td>` +
        `<td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-2">` +
          `<a href="/promissoria/${p.id}" target="_blank" rel="noopener" ` +
            `class="botao botao-pequeno whitespace-nowrap" aria-label="Nota promissória de ${esc(p.nome)}">${ICONE} Nota Promissória</a>` +
          `<button type="button" data-acao="editar" data-id="${p.id}" class="botao botao-sec botao-pequeno" aria-label="Alterar o cadastro de ${esc(p.nome)}">Alterar</button>` +
          `<button type="button" data-acao="excluir" data-id="${p.id}" class="botao botao-perigo botao-pequeno" aria-label="Excluir o cadastro de ${esc(p.nome)}">Excluir</button>` +
        `</div></td>` +
      `</tr>`).join('');
    marcar(false);
  }

  function marcar(rolar = true) {
    const trs = linhas.querySelectorAll('tr[data-i]');
    trs.forEach((tr, i) => tr.classList.toggle('bg-pinheiro-claro', i === sel));
    if (rolar && trs[sel]) trs[sel].scrollIntoView({ block: 'nearest' });
  }

  async function carregar() {
    const minha = ++seq;
    const r = await api('/api/pessoas?q=' + encodeURIComponent(busca.value.trim()));
    if (minha !== seq) return;
    if (!r.ok) { contagem.textContent = r.data?.erro || 'Não foi possível carregar a lista.'; return; }
    lista = r.data.pessoas; sel = 0;
    render();
    const t = r.data.total;
    contagem.textContent = `${t} ${t === 1 ? 'pessoa' : 'pessoas'}` +
      (t > lista.length ? `, mostrando as ${lista.length} primeiras. Refine a busca para ver as demais.` : '');
  }

  const aviso = $('#aviso');
  function mostrarAviso(texto, erroFlag = false) {
    aviso.textContent = texto;
    aviso.className = 'mb-3 font-semibold min-h-[1.5rem] ' + (erroFlag ? 'text-tijolo' : 'text-pinheiro');
  }

  // ------------------------------------------------------------------ alterar cadastro (janela)
  const modal = $('#modalEd'), formEd = $('#formEd'), edMsg = $('#edMsg');
  const edNome = $('#edNome'), edCpf = $('#edCpf'), edTel = $('#edTelefone'), edEnd = $('#edEndereco'), edFuncao = $('#edFuncao');
  let editando = null, salvando = false;
  mascarar(edCpf, maskCpf);
  mascarar(edTel, maskTel);

  function abrirEdicao(p) {
    if (!p) return;
    editando = p.id;
    $('#edNum').textContent = p.id;
    edNome.value = p.nome || ''; edCpf.value = p.cpf || ''; edTel.value = p.telefone || '';
    edEnd.value = p.endereco || ''; edFuncao.value = p.funcao || 'CLIENTE';
    edMsg.textContent = '';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    edNome.focus(); edNome.select();
  }
  function fecharEdicao() {
    modal.classList.add('hidden'); modal.classList.remove('flex');
    editando = null;
    busca.focus();
  }
  async function salvarEdicao() {
    if (salvando || editando === null) return;
    if (!edNome.value.trim()) { edMsg.textContent = 'Informe o nome.'; edNome.focus(); return; }
    salvando = true;
    const r = await api('/api/pessoas/' + editando, {
      method: 'PUT',
      body: JSON.stringify({ nome: edNome.value, cpf: edCpf.value, telefone: edTel.value, endereco: edEnd.value, funcao: edFuncao.value }),
    });
    salvando = false;
    if (!r.ok) { edMsg.textContent = r.data?.erro || 'Não foi possível salvar.'; return; }
    const numero = editando;
    fecharEdicao();
    await carregar();
    mostrarAviso(`Cadastro nº ${numero} atualizado.`);
  }
  enterFlow([edNome, edCpf, edTel, edEnd, edFuncao], salvarEdicao);
  formEd.addEventListener('submit', e => { e.preventDefault(); salvarEdicao(); });
  $('#edCancelar').addEventListener('click', fecharEdicao);
  modal.addEventListener('mousedown', e => { if (e.target === modal) fecharEdicao(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharEdicao(); return; }
    if (e.key !== 'Tab') return;                       // mantém o Tab dentro da janela
    const foc = [...modal.querySelectorAll('input, select, button')];
    const primeiro = foc[0], ultimo = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  });

  // ------------------------------------------------------------------ excluir cadastro
  async function excluir(p) {
    if (!confirm(`Excluir o cadastro de ${p.nome} (nº ${p.id})?\n\nEssa ação não pode ser desfeita.`)) return;
    let r = await api('/api/pessoas/' + p.id, { method: 'DELETE' });
    if (r.status === 409 && r.data?.codigo === 'tem_lances') {       // tem lances: exige uma segunda confirmação
      const d = r.data;
      const itens = d.vendas.length
        ? '\n\nItens que ele deve:\n' + d.vendas.map(v => `• Item ${v.item_id} (${v.produto}): ${brl(v.valor)}${v.doado ? ' (D)' : ''}`).join('\n') +
          `\nTotal: ${brl(d.total)}` : '';
      if (!confirm(`${d.erro}${itens}\n\nSe você excluir mesmo assim, o cadastro e todos os lances dele serão apagados. ` +
                   `Itens em que ele era o maior lance voltam ao lance anterior, se houver. Continuar?`)) return;
      r = await api('/api/pessoas/' + p.id + '?forcar=1', { method: 'DELETE' });
    }
    if (!r.ok) { mostrarAviso(r.data?.erro || 'Não foi possível excluir o cadastro.', true); return; }
    await carregar();
    mostrarAviso(`Cadastro de ${p.nome} excluído.` +
      (r.data.lances_apagados ? ` ${r.data.lances_apagados} lance(s) apagado(s) junto.` : '') +
      (r.data.itens_sem_doador ? ` ${r.data.itens_sem_doador} item(ns) doado(s) por essa pessoa ficaram sem doador.` : ''));
    busca.focus();
  }

  linhas.addEventListener('click', e => {
    const b = e.target.closest('button[data-acao]');
    const p = b && lista.find(x => String(x.id) === b.dataset.id);
    if (!p) return;
    if (b.dataset.acao === 'editar') abrirEdicao(p); else excluir(p);
  });

  busca.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; carregar(); }, 150);
  });

  busca.addEventListener('keydown', async e => {
    if (e.key === 'ArrowDown' && lista.length) { e.preventDefault(); sel = Math.min(sel + 1, lista.length - 1); marcar(); }
    else if (e.key === 'ArrowUp' && lista.length) { e.preventDefault(); sel = Math.max(sel - 1, 0); marcar(); }
    else if (e.key === 'Escape') { e.preventDefault(); busca.value = ''; carregar(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (timer) { clearTimeout(timer); timer = null; await carregar(); } // espera a busca digitada
      const p = lista[sel];
      if (p) window.open('/promissoria/' + p.id, '_blank');
    }
  });

  document.addEventListener('keydown', e => {
    const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'F3' || (e.key === '/' && !digitando)) { e.preventDefault(); busca.focus(); busca.select(); }
    else if (e.key === 'F2' && !editando) { e.preventDefault(); abrirEdicao(lista[sel]); }
  });

  // Ao voltar da aba da promissória, atualiza os totais.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });

  carregar();
  busca.focus();
})();
