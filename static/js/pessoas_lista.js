(() => {
  const { $, api, brl, esc } = window.Leilao;
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
        `<td class="px-4 py-3 text-right"><a href="/promissoria/${p.id}" target="_blank" rel="noopener" ` +
          `class="botao botao-pequeno whitespace-nowrap" aria-label="Nota promissória de ${esc(p.nome)}">${ICONE} Nota Promissória</a></td>` +
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
  });

  // Ao voltar da aba da promissória, atualiza os totais.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });

  carregar();
  busca.focus();
})();
