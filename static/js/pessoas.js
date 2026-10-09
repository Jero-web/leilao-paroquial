(() => {
  const { $, api, enterFlow, mascarar, maskCpf, maskTel } = window.Leilao;
  const form = $('#form'), msg = $('#msg');
  const nome = $('#nome'), cpf = $('#cpf'), telefone = $('#telefone'), endereco = $('#endereco'), funcao = $('#funcao');
  const cartao = $('#cartao'), vazio = $('#vazio');
  let salvando = false;

  mascarar(cpf, maskCpf);
  mascarar(telefone, maskTel);

  function limpar() {
    [nome, cpf, telefone, endereco].forEach(el => { el.value = ''; });
    funcao.value = 'CLIENTE';
    msg.textContent = '';
    nome.focus();
  }

  function mostrarCartao(p) {
    $('#cartaoNumero').textContent = p.id;
    $('#cartaoNome').textContent = p.nome;
    $('#cartaoFuncao').textContent = p.funcao === 'COMISSAO' ? 'Membro da comissão' : 'Cliente';
    $('#cartaoLink').href = '/promissoria/' + p.id;
    vazio.classList.add('hidden');
    cartao.classList.remove('hidden');
    cartao.classList.remove('flash'); void cartao.offsetWidth; cartao.classList.add('flash');
  }

  async function salvar() {
    if (salvando) return;
    msg.textContent = '';
    if (!nome.value.trim()) { msg.textContent = 'Informe o nome.'; nome.focus(); return; }
    salvando = true;
    const r = await api('/api/pessoas', {
      method: 'POST',
      body: JSON.stringify({
        nome: nome.value, cpf: cpf.value, telefone: telefone.value, endereco: endereco.value, funcao: funcao.value,
      }),
    });
    salvando = false;
    if (!r.ok) { msg.textContent = r.data?.erro || 'Não foi possível salvar.'; return; }
    mostrarCartao(r.data);
    limpar();
  }

  enterFlow([nome, cpf, telefone, endereco, funcao], salvar,
    { nome: async () => { if (nome.value.trim()) return true; msg.textContent = 'Informe o nome.'; return false; } });
  form.addEventListener('submit', e => { e.preventDefault(); salvar(); });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); salvar(); } });
  document.addEventListener('keydown', e => { if (e.key === 'F2') { e.preventDefault(); limpar(); } });
  nome.focus();
})();
