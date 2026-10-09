/* Utilitários compartilhados: Fetch API, navegação por Enter, máscaras, autocomplete e atalhos globais. */
window.Leilao = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Mesma regra do servidor: "1.500" = 1500, "12.5" = 12,5, "1.234,50" = 1234,5
  function parseValor(raw) {
    let s = String(raw ?? '').replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const v = Number(s);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  }

  async function api(url, opts = {}) {
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
      let data = null;
      try { data = await res.json(); } catch (_) { /* resposta sem corpo */ }
      return { ok: res.ok, status: res.status, data };
    } catch (_) {
      return { ok: false, status: 0, data: { erro: 'Sem conexão com o servidor. Verifique a rede e tente de novo.' } };
    }
  }

  function setStatus(el, tipo, texto) {
    el.textContent = texto || '';
    el.className = (el.dataset.base || (el.dataset.base = el.className)) +
      (tipo === 'ok' ? ' text-pinheiro font-semibold' : tipo === 'erro' ? ' text-tijolo font-semibold' : '');
  }

  // Enter avança para o próximo campo; no último chama onLast. validate[id] pode bloquear o avanço.
  function enterFlow(fields, onLast, validate = {}) {
    fields.forEach((el, i) => el.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const v = validate[el.id];
      if (v && !(await v(el))) return;
      if (i < fields.length - 1) { fields[i + 1].focus(); fields[i + 1].select?.(); }
      else onLast();
    }));
  }

  function mascarar(el, fn) { el.addEventListener('input', () => { el.value = fn(el.value); }); }
  const digitos = s => s.replace(/\D/g, '');
  const maskCpf = v => digitos(v).slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  function maskTel(v) {
    const d = digitos(v).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  // Lista suspensa navegável por teclado. O pai do input deve ter position:relative.
  function Autocomplete(input, { search, render, onSelect, onEmpty, active = () => true, minChars = 2 }) {
    const box = document.createElement('div');
    box.className = 'ac-list hidden';
    box.setAttribute('role', 'listbox');
    input.parentElement.appendChild(box);
    input.setAttribute('autocomplete', 'off');
    let items = [], idx = -1, timer = null, inflight = null, seq = 0;

    const close = () => { box.classList.add('hidden'); items = []; idx = -1; };
    const paint = () => {
      box.innerHTML = items.map((it, i) =>
        `<div role="option" data-i="${i}" class="ac-item${i === idx ? ' ac-active' : ''}">${render(it)}</div>`).join('');
      box.classList.toggle('hidden', items.length === 0);
    };
    function consulta() {
      const q = input.value.trim();
      if (!active() || q.length < minChars) { close(); return Promise.resolve(); }
      const my = ++seq;
      const p = search(q).then(list => {
        if (my !== seq) return;
        items = list; idx = list.length ? 0 : -1; paint();
      });
      inflight = p;
      p.finally(() => { if (inflight === p) inflight = null; });
      return p;
    }
    const escolher = it => { close(); onSelect(it); };
    async function assentar() { // espera a busca pendente antes de decidir no Enter
      if (timer) { clearTimeout(timer); timer = null; await consulta(); }
      else if (inflight) await inflight;
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; consulta(); }, 90);
    });
    input.addEventListener('keydown', async e => {
      const aberto = items.length > 0;
      if (e.key === 'ArrowDown' && aberto) { e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp' && aberto) { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
      else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab' && !e.shiftKey && aberto && idx >= 0 && active()) { e.preventDefault(); escolher(items[idx]); }
      else if (e.key === 'Enter' && active() && input.value.trim().length >= minChars) {
        e.preventDefault(); e.stopImmediatePropagation();
        await assentar();
        if (items.length && idx >= 0) escolher(items[idx]);
        else { close(); onEmpty && onEmpty(); }
      }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    box.addEventListener('mousedown', e => {
      const el = e.target.closest('.ac-item');
      if (!el) return;
      e.preventDefault();
      escolher(items[+el.dataset.i]);
    });
    return { close };
  }

  // Campo "número de cadastro OU nome": só dígitos busca por ID; texto abre a lista.
  function PessoaPicker(input, info, { onSelect = () => {} } = {}) {
    const state = { current: null, label: '' };
    let epoch = 0;
    const rotulo = p => `${p.id} - ${p.nome}`;

    function definir(p) {
      state.current = p; state.label = rotulo(p);
      input.value = state.label;
      setStatus(info, 'ok', `✓ Cadastro nº ${p.id} confirmado`);
    }
    function limpar() {
      epoch++;
      state.current = null; state.label = ''; input.value = '';
      setStatus(info, '', '');
    }
    async function resolver() {
      const v = input.value.trim();
      if (state.current && v === state.label) return state.current;
      if (!v) return null;
      const minha = epoch;
      if (/^\d+$/.test(v)) {
        const r = await api('/api/pessoas/' + v);
        if (minha !== epoch) return null;
        if (r.ok) { definir(r.data); return r.data; }
        state.current = null;
        setStatus(info, 'erro', r.data?.erro || 'Cadastro não encontrado.');
        return null;
      }
      setStatus(info, 'erro', 'Escolha um nome da lista ou digite o número de cadastro.');
      return null;
    }

    input.addEventListener('input', () => { state.current = null; setStatus(info, '', ''); });
    Autocomplete(input, {
      active: () => !state.current && !/^\d+$/.test(input.value.trim()),
      search: async q => {
        const r = await api('/api/pessoas/busca?q=' + encodeURIComponent(q));
        return r.ok ? r.data : [];
      },
      render: p => `<span class="ac-num">${p.id}</span><span>${esc(p.nome)}</span>` +
                   `<span class="ac-meta">${p.funcao === 'COMISSAO' ? 'comissão' : 'cliente'}</span>`,
      onSelect: p => { definir(p); onSelect(p); },
      onEmpty: () => setStatus(info, 'erro', 'Nenhum nome encontrado. Confira ou digite o número de cadastro.'),
    });
    input.addEventListener('blur', () => { if (input.value.trim() && !state.current) resolver(); });

    return { resolver, definir, limpar, get atual() { return state.current; } };
  }

  // Alt+1 / Alt+2 / Alt+3 trocam de tela
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const a = document.querySelector(`a[data-code="${e.code}"]`);
    if (a) { e.preventDefault(); location.href = a.href; }
  });

  return { $, esc, brl, parseValor, api, setStatus, enterFlow, mascarar, maskCpf, maskTel, Autocomplete, PessoaPicker };
})();
