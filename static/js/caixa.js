(() => {
  const { $, api, brl, esc, parseValor, setStatus, Autocomplete } = window.Leilao;
  const busca = $('#buscaPessoa'), aviso = $('#avisoCaixa'), painel = $('#painelCaixa');
  const form = $('#formPagamento'), pixEl = $('#valorPix'), especieEl = $('#valorEspecie');
  const obsEl = $('#observacao'), obsWrap = $('#observacaoWrap'), btnSalvar = $('#confirmarPagamento');
  let atual = null, carregando = false, salvando = false;

  function avisoSet(tipo, texto) {
    setStatus(aviso, tipo, texto);
  }

  function pintar() {
    if (!atual) return;
    const p = atual.pessoa;
    $('#clienteCard').innerHTML =
      `<p class="text-sm text-tinta/70">Cadastro nº ${p.id}</p>` +
      `<h2 class="text-2xl font-extrabold">${esc(p.nome)}</h2>` +
      `<p class="mt-1">CPF: ${esc(p.cpf || '—')} &nbsp; Telefone: ${esc(p.telefone || '—')}</p>`;
    $('#itensCaixa').innerHTML = atual.arremates.length
      ? atual.arremates.map(a =>
          `<tr class="border-t border-tinta/10"><td class="px-4 py-2">${a.id}</td>` +
          `<td class="px-4 py-2">${esc(a.produto)}${a.doado ? ' (D)' : ''}</td>` +
          `<td class="px-4 py-2 text-right tabular-nums">${brl(a.valor_arremate)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="px-4 py-4 text-center text-tinta/70">Nenhum item arrematado.</td></tr>';
    $('#totalDevedor').textContent = brl(atual.valor_total_devedor);
    $('#resumoPago').textContent =
      `Já recebido: PIX ${brl(atual.valor_pix)} + espécie ${brl(atual.valor_especie)} = ${brl(atual.valor_pago_total)}. ` +
      `Saldo atual: ${brl(atual.saldo_restante)} (${atual.status === 'LIQUIDADO' ? 'liquidado' : 'pendente'}).`;
    $('#imprimirPromissoria').href = `/promissoria/${p.id}`;
    painel.classList.remove('hidden');
    calcular();
  }

  async function carregar(pessoa) {
    if (carregando) return;
    carregando = true;
    avisoSet('', 'Carregando cadastro e arremates…');
    try {
      const r = await api(`/api/caixa/pessoas/${pessoa.id}`);
      if (!r.ok) {
        avisoSet('erro', r.data?.erro || 'Não foi possível carregar o cadastro.');
        return;
      }
      atual = r.data;
      busca.value = `${atual.pessoa.id} - ${atual.pessoa.nome}`;
      $('#buscaInfo').textContent = `Cadastro nº ${atual.pessoa.id} selecionado.`;
      pixEl.value = '0,00';
      especieEl.value = '0,00';
      obsEl.value = '';
      avisoSet('', '');
      pintar();
      pixEl.focus();
    } finally {
      carregando = false;
    }
  }

  Autocomplete(busca, {
    minChars: 1,
    search: async q => {
      const r = await api('/api/caixa/pessoas?q=' + encodeURIComponent(q));
      return r.ok ? r.data : [];
    },
    render: p => `<span class="ac-num">${p.id}</span><span>${esc(p.nome)}</span>` +
                 `<span class="ac-meta">${esc(p.cpf || '')}</span>`,
    onSelect: carregar,
    onEmpty: () => {
      $('#buscaInfo').textContent = 'Nenhum cadastro encontrado. Escolha um resultado da lista.';
    },
  });
  busca.addEventListener('input', () => {
    atual = null;
    painel.classList.add('hidden');
    $('#buscaInfo').textContent = 'Digite o número de cadastro ou parte do nome.';
  });

  function amount(el) {
    const value = parseValor(el.value);
    return value === null ? (el.value.trim() ? null : 0) : value;
  }

  function calcular() {
    if (!atual) return;
    const pix = amount(pixEl), especie = amount(especieEl);
    const valido = pix !== null && especie !== null && pix >= 0 && especie >= 0;
    const recebido = valido ? Math.round((pix + especie) * 100) / 100 : 0;
    const trocoVal = Math.max(0, recebido - atual.saldo_restante);
    const restanteVal = Math.max(0, atual.saldo_restante - recebido);
    $('#totalInformado').textContent = valido ? brl(recebido) : 'Valor inválido';
    $('#troco').textContent = brl(trocoVal);
    $('#restante').textContent = brl(restanteVal);
    obsWrap.classList.toggle('hidden', !valido || restanteVal === 0);
    obsEl.required = valido && restanteVal > 0;
  }

  pixEl.addEventListener('input', calcular);
  especieEl.addEventListener('input', calcular);
  obsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!atual || salvando) return;
    const pix = amount(pixEl), especie = amount(especieEl);
    if (pix === null || especie === null || pix < 0 || especie < 0) {
      avisoSet('erro', 'Informe valores válidos e não negativos para PIX e espécie.');
      (pix === null || pix < 0 ? pixEl : especieEl).focus();
      return;
    }
    const valorPago = Math.round((pix + especie) * 100) / 100;
    if (Math.max(0, atual.saldo_restante - valorPago) > 0 && !obsEl.value.trim()) {
      obsWrap.classList.remove('hidden');
      obsEl.required = true;
      avisoSet('erro', 'Descreva como e quando o saldo restante será pago.');
      obsEl.focus();
      return;
    }
    salvando = true;
    btnSalvar.disabled = true;
    const recibo = window.open('about:blank', '_blank');
    try {
      const r = await api('/api/pagamentos', {
        method: 'POST',
        body: JSON.stringify({
          arrematante_id: atual.pessoa.id,
          valor_pix: pixEl.value,
          valor_especie: especieEl.value,
          observacao_pendencia: obsEl.value,
        }),
      });
      if (!r.ok) {
        recibo?.close();
        avisoSet('erro', r.data?.erro || 'Não foi possível registrar o pagamento.');
        return;
      }
      atual = r.data;
      pixEl.value = '0,00';
      especieEl.value = '0,00';
      obsEl.value = '';
      pintar();
      avisoSet('ok', 'Pagamento registrado. A promissória foi atualizada.');
      if (recibo) recibo.location = `/promissoria/${atual.pessoa.id}`;
    } finally {
      salvando = false;
      btnSalvar.disabled = false;
    }
  });
})();
