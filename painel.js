const ARQUIVOS = ['equipes', 'integrantes', 'missoes', 'alimentos', 'arrecadacao', 'resultados'];
const OBRIGATORIOS = ['equipes', 'missoes'];
const INTERVALO_ATUALIZACAO = 30000;

// ---------- Utilidades ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const chaveCabecalho = s => normalizar(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function numero(v) {
  let s = String(v ?? '').trim();
  if (!s) return 0;
  // Aceita "1.234,5" (pt-BR) e "1234.5"
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Parser CSV com suporte a aspas; detecta separador ";" ou ",".
function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = (primeira.split(';').length >= primeira.split(',').length) ? ';' : ',';
  const linhas = [];
  let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  const validas = linhas.filter(l => l.some(v => v.trim() !== ''));
  if (!validas.length) return [];
  const cab = validas[0].map(chaveCabecalho);
  return validas.slice(1).map(l => Object.fromEntries(cab.map((k, i) => [k, (l[i] ?? '').trim()])));
}

// ---------- Carregamento ----------

// O Excel pode salvar CSV em UTF-8 ou em Windows-1252 (ANSI); aceita os dois.
function decodificar(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}

async function buscarDaPasta() {
  const textos = {};
  if (!location.protocol.startsWith('http')) return textos;
  await Promise.all(ARQUIVOS.map(async nome => {
    try {
      const r = await fetch(`dados/${nome}.csv?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) textos[nome] = decodificar(await r.arrayBuffer());
    } catch {}
  }));
  return textos;
}

let ultimo = null;
const ROTA_FINAL = '#resultado-final';
const todasConcluidas = r => r.missoes.length > 0 && r.missoes.every(m => m.concluida);

// Alterna entre o painel e a página "Resultado Final" (só abre com todas as missões concluídas).
function mostrarTela() {
  if (!ultimo) return;
  const final = location.hash === ROTA_FINAL && todasConcluidas(ultimo);
  if (final) document.getElementById('final').innerHTML = paginaFinal(ultimo);
  document.getElementById('painel').classList.toggle('hidden', final);
  document.getElementById('final').classList.toggle('hidden', !final);
}

async function carregar() {
  const textos = await buscarDaPasta();
  const faltando = OBRIGATORIOS.filter(n => !textos[n]);
  document.getElementById('carregar').classList.toggle('hidden', !faltando.length);
  if (faltando.length) {
    ultimo = null;
    document.getElementById('painel').classList.add('hidden');
    document.getElementById('final').classList.add('hidden');
    return;
  }
  const dados = Object.fromEntries(ARQUIVOS.map(n => [n, textos[n] ? lerCSV(textos[n]) : []]));
  ultimo = calcular(dados);
  renderizar(ultimo);
  mostrarTela();
  document.getElementById('atualizado').textContent =
    'Encontro de Adolescentes com Cristo · atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Cálculo ----------

function calcular(d) {
  const avisos = [];
  const equipes = d.equipes.filter(e => e.id).map(e => ({
    id: normalizar(e.id),
    nome: e.nome || e.id,
    cor: e.cor || '',
    hex: e.cor_hex || '#888',
    logo: e.logo || '',
    grito: e.grito_de_guerra || '',
    lider: [], membros: [],
    total: 0,
  }));
  const porId = Object.fromEntries(equipes.map(e => [e.id, e]));
  const equipeDe = (id, origem) => {
    const e = porId[normalizar(id)];
    if (!e) avisos.push(`${origem}: equipe "${id}" não existe em equipes.csv.`);
    return e;
  };

  for (const p of d.integrantes) {
    if (!p.nome) continue;
    const e = equipeDe(p.equipe, 'integrantes.csv');
    if (!e) continue;
    (normalizar(p.funcao).startsWith('lider') ? e.lider : e.membros).push(p.nome);
  }

  const tabelaAlimentos = d.alimentos.filter(a => a.alimento).map(a => ({
    nome: a.alimento, unidade: a.unidade || '', pontos: numero(a.pontos_por_unidade),
  }));
  const alimentoPor = Object.fromEntries(tabelaAlimentos.map(a => [normalizar(a.nome), a]));

  const extrato = [];
  const missoes = d.missoes.filter(m => m.id).map(m => ({
    id: m.id,
    nome: m.nome || `Missão ${m.id}`,
    descricao: m.descricao || '',
    tipo: normalizar(m.tipo) || 'colocacao',
    pontos1: numero(m.pontos_1),
    pontos2: numero(m.pontos_2),
    julgamento: m.julgamento || '',
    pontos: Object.fromEntries(equipes.map(e => [e.id, 0])),
    linhas: [],
    vencedores: [],
    concluida: false,
  }));

  for (const m of missoes) {
    if (m.tipo === 'arrecadacao') {
      // Agrupa por equipe e alimento
      m.alimentos = Object.fromEntries(equipes.map(e => [e.id, {}]));
      for (const r of d.arrecadacao) {
        if (!r.equipe && !r.alimento) continue;
        const e = equipeDe(r.equipe, 'arrecadacao.csv');
        if (!e) continue;
        const qtd = numero(r.quantidade);
        if (Number.isNaN(qtd)) { avisos.push(`arrecadacao.csv: quantidade inválida "${r.quantidade}" (${r.alimento}).`); continue; }
        const ref = alimentoPor[normalizar(r.alimento)];
        if (!ref) avisos.push(`arrecadacao.csv: alimento "${r.alimento}" não está em alimentos.csv — contado com 0 ponto.`);
        const chave = ref ? ref.nome : r.alimento;
        const item = m.alimentos[e.id][chave] ||= {
          alimento: chave, unidade: ref?.unidade || '', ptsUnit: ref ? ref.pontos : 0, qtd: 0, obs: [],
        };
        item.qtd += qtd;
        if (r.observacao) item.obs.push(r.observacao);
      }
      for (const e of equipes) {
        for (const it of Object.values(m.alimentos[e.id])) {
          it.subtotal = it.qtd * it.ptsUnit;
          m.pontos[e.id] += it.subtotal;
          extrato.push({ missao: m, equipe: e, descricao: `${fmt(it.qtd)} × ${it.alimento} (${fmt(it.ptsUnit)} pt/un.)`, pontos: it.subtotal });
        }
      }
      const max = Math.max(...equipes.map(e => m.pontos[e.id]));
      m.concluida = max > 0;
      if (m.concluida) {
        m.vencedores = equipes.filter(e => m.pontos[e.id] === max);
        // Bônus opcional para quem vencer a arrecadação
        if (m.pontos1 > 0) for (const e of m.vencedores) {
          m.pontos[e.id] += m.pontos1;
          extrato.push({ missao: m, equipe: e, descricao: 'Bônus: 1º lugar na arrecadação', pontos: m.pontos1 });
        }
      }
    } else {
      const res = d.resultados.filter(r => String(r.missao).trim() === String(m.id).trim());
      for (const r of res) {
        const e = equipeDe(r.equipe, `resultados.csv (missão ${m.id})`);
        if (!e) continue;
        const col = parseInt(r.colocacao, 10);
        if (!col) continue;
        const pts = col === 1 ? m.pontos1 : col === 2 ? m.pontos2 : 0;
        m.pontos[e.id] += pts;
        m.linhas.push({ equipe: e, colocacao: col, pontos: pts, obs: r.observacao || '' });
        extrato.push({ missao: m, equipe: e, descricao: `${col}º lugar` + (r.observacao ? ` — ${r.observacao}` : ''), pontos: pts });
      }
      m.linhas.sort((a, b) => a.colocacao - b.colocacao);
      m.concluida = m.linhas.length > 0;
      m.vencedores = m.linhas.filter(l => l.colocacao === 1).map(l => l.equipe);
    }
    for (const e of equipes) e.total += m.pontos[e.id];
  }

  const maiorTotal = Math.max(0, ...equipes.map(e => e.total));
  const lideresGerais = maiorTotal > 0 ? equipes.filter(e => e.total === maiorTotal) : [];
  return { equipes, missoes, tabelaAlimentos, extrato, avisos, lideresGerais };
}

// ---------- Renderização ----------

function logo(e, mini = false) {
  const conteudo = e.logo
    ? `<img src="${esc(e.logo)}" alt="${esc(e.nome)}">`
    : esc((e.nome.replace(/^equipe\s+/i, '')[0] || '?').toUpperCase());
  return `<div class="logo${mini ? ' mini' : ''}" style="--c:${esc(e.hex)}">${conteudo}</div>`;
}
const tag = e => `<span class="tag" style="--c:${esc(e.hex)}">${logo(e, true)}${esc(e.nome)}</span>`;
const nomesVencedores = v => v.map(e => e.nome).join(' e ');

function vencedorBox(m) {
  if (!m.concluida) return `<div class="muted small" style="margin-top:10px">Aguardando resultado.</div>`;
  if (m.vencedores.length > 1) return `<div class="vencedor" style="--c:#888">Empate entre ${esc(nomesVencedores(m.vencedores))}</div>`;
  const v = m.vencedores[0];
  if (!v) return '';
  return `<div class="vencedor" style="--c:${esc(v.hex)}">Vencedora da missão: ${esc(v.nome)}</div>`;
}

function renderizar(r) {
  const { equipes, missoes } = r;

  document.getElementById('avisos').innerHTML = r.avisos.length
    ? `<div class="avisos"><strong>Atenção — verifique os CSVs:</strong><ul>${[...new Set(r.avisos)].map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`
    : '';

  // Placar
  const somaTotal = equipes.reduce((s, e) => s + Math.max(0, e.total), 0);
  const cartoes = equipes.map(e => {
    const lidera = r.lideresGerais.includes(e) && r.lideresGerais.length === 1;
    return `<div class="card equipe-placar${lidera ? ' lider-geral' : ''}" style="--c:${esc(e.hex)}">
      ${lidera ? '<span class="coroa">LIDERANDO</span>' : ''}
      ${logo(e)}
      <div class="equipe-nome">${esc(e.nome)}</div>
      <div class="muted small">Líder: ${esc(e.lider.join(', ') || '—')}</div>
      <div class="total">${fmt(e.total)}</div>
      <div class="muted small">pontos</div>
      ${e.grito ? `<div class="grito">“${esc(e.grito)}”</div>` : ''}
    </div>`;
  });
  const barra = `<div class="barra">${equipes.map(e =>
    `<div style="--c:${esc(e.hex)};width:${somaTotal ? (Math.max(0, e.total) / somaTotal * 100) : 100 / equipes.length}%"></div>`).join('')}</div>`;
  document.getElementById('placar').innerHTML = (equipes.length === 2
    ? `<div class="placar">${cartoes[0]}<div class="vs">×</div>${cartoes[1]}</div>`
    : `<div class="grid-equipes">${cartoes.join('')}</div>`) + barra;

  // Resumo por missão
  document.getElementById('resumo').innerHTML = `<table>
    <thead><tr><th>Missão</th><th>Critério</th>${equipes.map(e => `<th class="num">${tag(e)}</th>`).join('')}<th>Vencedora</th></tr></thead>
    <tbody>${missoes.map(m => `<tr>
      <td><strong>${esc(m.id)}.</strong> ${esc(m.nome)}</td>
      <td class="muted small">${esc(m.julgamento)}</td>
      ${equipes.map(e => `<td class="num">${m.concluida ? fmt(m.pontos[e.id]) : '—'}</td>`).join('')}
      <td>${!m.concluida ? '<span class="pill">pendente</span>'
        : m.vencedores.length === 1 ? tag(m.vencedores[0])
        : m.vencedores.length > 1 ? '<span class="pill">empate</span>' : '—'}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">Total geral</td>${equipes.map(e => `<td class="num">${fmt(e.total)}</td>`).join('')}<td></td></tr></tfoot>
  </table>`;

  // Detalhe das missões
  document.getElementById('missoes').innerHTML = missoes.map(m => {
    const cabecalho = `<div class="missao-head">
        <span class="missao-num">Missão ${esc(m.id)}</span>
        <span class="pill">${esc(m.julgamento || (m.tipo === 'arrecadacao' ? 'Contagem' : 'Colocação'))}</span>
      </div>
      <h3>${esc(m.nome)}</h3>
      <div class="regra">${esc(m.descricao)}</div>`;

    if (m.tipo === 'arrecadacao') {
      const porEquipe = equipes.map(e => {
        const itens = Object.values(m.alimentos[e.id]).sort((a, b) => b.subtotal - a.subtotal);
        return `<div class="alimentos-equipe" style="--c:${esc(e.hex)}">
          <h3>${logo(e, true)}${esc(e.nome)}</h3>
          <div class="tabela-scroll"><table>
            <thead><tr><th>Alimento</th><th class="num">Qtd</th><th class="num">Pts/un.</th><th class="num">Pontos</th></tr></thead>
            <tbody>${itens.length ? itens.map(it => `<tr title="${esc(it.obs.join(' | '))}">
              <td>${esc(it.alimento)}${it.unidade ? ` <span class="muted small">(${esc(it.unidade)})</span>` : ''}</td>
              <td class="num">${fmt(it.qtd)}</td><td class="num">${fmt(it.ptsUnit)}</td><td class="num">${fmt(it.subtotal)}</td>
            </tr>`).join('') : '<tr><td colspan="4" class="muted">Nenhum alimento registrado.</td></tr>'}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${fmt(itens.reduce((s, i) => s + i.qtd, 0))}</td><td></td><td class="num">${fmt(itens.reduce((s, i) => s + i.subtotal, 0))}</td></tr></tfoot>
          </table></div>
        </div>`;
      }).join('');
      const tabela = `<details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Tabela de pontos por alimento</summary>
        <div class="tabela-scroll"><table><thead><tr><th>Alimento</th><th>Unidade</th><th class="num">Pontos/un.</th></tr></thead>
        <tbody>${r.tabelaAlimentos.map(a => `<tr><td>${esc(a.nome)}</td><td>${esc(a.unidade)}</td><td class="num">${fmt(a.pontos)}</td></tr>`).join('')}</tbody></table></div>
        ${m.pontos1 > 0 ? `<p class="small muted">Bônus para a equipe vencedora da arrecadação: ${fmt(m.pontos1)} pontos.</p>` : ''}
      </details>`;
      return `<div class="card" style="grid-column:1/-1">${cabecalho}<div class="duas-colunas">${porEquipe}</div>${tabela}${vencedorBox(m)}</div>`;
    }

    const regra = `<p class="small muted">Pontuação: 1º lugar ${fmt(m.pontos1)} pts · 2º lugar ${fmt(m.pontos2)} pts</p>`;
    const linhas = m.linhas.length
      ? `<div class="tabela-scroll"><table><thead><tr><th>Colocação</th><th>Equipe</th><th class="num">Pontos</th><th>Observação</th></tr></thead>
         <tbody>${m.linhas.map(l => `<tr><td>${l.colocacao}º</td><td>${tag(l.equipe)}</td><td class="num">${fmt(l.pontos)}</td><td class="small muted">${esc(l.obs)}</td></tr>`).join('')}</tbody></table></div>`
      : '';
    return `<div class="card">${cabecalho}${regra}${linhas}${vencedorBox(m)}</div>`;
  }).join('');

  // Composição
  document.getElementById('equipes').innerHTML = equipes.map(e => `
    <div class="card composicao" style="--c:${esc(e.hex)}">
      <h3 style="display:flex;align-items:center;gap:8px;color:${esc(e.hex)}">${logo(e, true)}${esc(e.nome)}
        ${e.cor ? `<span class="pill">Cor: ${esc(e.cor)}</span>` : ''}</h3>
      <div class="lider"><span class="muted small">Líder</span><strong>${esc(e.lider.join(', ') || '—')}</strong></div>
      <div class="muted small" style="margin-bottom:6px">Equipe (${e.membros.length} ${e.membros.length === 1 ? 'integrante' : 'integrantes'})</div>
      <ul class="membros">${e.membros.map(n => `<li>${esc(n)}</li>`).join('') || '<li class="muted">Nenhum integrante cadastrado.</li>'}</ul>
    </div>`).join('');

  // Extrato
  document.getElementById('extrato').innerHTML = r.extrato.length ? `<table>
    <thead><tr><th>Missão</th><th>Equipe</th><th>Lançamento</th><th class="num">Pontos</th></tr></thead>
    <tbody>${r.extrato.map(x => `<tr><td>${esc(x.missao.id)}. ${esc(x.missao.nome)}</td><td>${tag(x.equipe)}</td><td>${esc(x.descricao)}</td><td class="num">${fmt(x.pontos)}</td></tr>`).join('')}</tbody>
    <tfoot>${equipes.map(e => `<tr><td colspan="3">Total ${esc(e.nome)}</td><td class="num">${fmt(e.total)}</td></tr>`).join('')}</tfoot>
  </table>` : '<p class="muted">Nenhum ponto lançado ainda.</p>';

  // Botão Resultado Final
  const concluidas = missoes.filter(m => m.concluida).length;
  const liberado = todasConcluidas(r);
  document.getElementById('btn-final').disabled = !liberado;
  document.getElementById('status-final').textContent = liberado
    ? 'Todas as missões foram concluídas.'
    : `Disponível ao concluir todas as missões (${concluidas} de ${missoes.length} concluídas).`;
}

const ICONES = {
  coracao: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4.5 6 4.5c2.2 0 3.5 1.2 4.3 2.4.4.6 1 .6 1.4 0 .8-1.2 2.1-2.4 4.3-2.4 3.7 0 5.6 3.9 4 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  pessoas: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="8.5" r="2.7"/><path d="M1.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6v1h-13v-1zM15 20v-1c0-1.9-.6-3.5-1.7-4.8.9-.5 2-.7 3.2-.7 3.1 0 6 2 6 5.2V20H15z"/></svg>',
  cruz: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.5 2h3v6h5.5v3h-5.5v11h-3V11H5V8h5.5z"/></svg>',
};

function paginaFinal(r) {
  const { equipes, missoes } = r;
  const arrecadacao = missoes.find(m => m.tipo === 'arrecadacao');
  const itens = arrecadacao ? equipes.flatMap(e => Object.values(arrecadacao.alimentos[e.id])) : [];
  const totalItens = itens.reduce((s, i) => s + i.qtd, 0);
  const tiposAlimento = new Set(itens.filter(i => i.qtd > 0).map(i => normalizar(i.alimento))).size;
  const participantes = equipes.reduce((s, e) => s + e.lider.length + e.membros.length, 0);
  const nomesEquipes = equipes.map(e => `<span style="--c:${esc(e.hex)}">${esc(e.nome)}</span>`);
  const listaEquipes = nomesEquipes.length > 1
    ? nomesEquipes.slice(0, -1).join(', ') + ' e ' + nomesEquipes.at(-1) : nomesEquipes.join('');

  return `
    <section class="final-hero">
      <div class="eyebrow">Resultado Final</div>
      <h2>E quem venceu esta gincana foi…</h2>
      <p>Depois de ${missoes.length} missões, muita animação e muito trabalho em equipe, o resultado mais importante não cabe em um placar.</p>
    </section>

    <div class="vitoriosos">
      <div class="card vitorioso">
        <div class="icone">${ICONES.cruz}</div>
        <h3>Cristo</h3>
        <div class="muted small" style="margin-top:4px">“Onde dois ou três estão reunidos em meu nome, eu estou ali, no meio deles.” <strong>(Mt 18,20)</strong></div>
        <p>Ele esteve no meio de nós em cada grito, cada abraço e cada alimento entregue.</p>
      </div>
      <div class="card vitorioso">
        <div class="icone">${ICONES.pessoas}</div>
        <h3>Todos os participantes</h3>
        ${participantes > 0 ? `<div class="destaque">${fmt(participantes)}</div>
        <div class="muted small">adolescentes em ação</div>` : ''}
        <p>Quem criou, torceu, gritou, correu e se doou pela sua equipe. Aqui ninguém perdeu: todos cresceram juntos.</p>
      </div>
      <div class="card vitorioso">
        <div class="icone">${ICONES.coracao}</div>
        <h3>A Solidariedade</h3>
        ${totalItens > 0 ? `<div class="destaque">${fmt(totalItens)}</div>
        <div class="muted small">itens arrecadados${tiposAlimento ? ` · ${tiposAlimento} tipos de alimento` : ''}</div>` : ''}
        <p>Cada pacote arrecadado vai chegar à mesa de uma família. Foi amor que virou gesto concreto.</p>
      </div>
    </div>

    <blockquote class="versiculo">
      <p>“Ninguém despreze a tua juventude. Ao contrário, sê para os fiéis um modelo na palavra, na conduta, na caridade, na fé e na pureza.”</p>
      <cite>1 TIMÓTEO 4,12</cite>
    </blockquote>

    <div class="mensagem">
      <p>Vocês não são apenas o futuro da Igreja: <strong>vocês são o presente dela.</strong> Deus não espera vocês crescerem para chamá-los. Ele conta com vocês agora, do jeito que vocês são, para levar o Evangelho aonde muitas vezes ninguém mais chega: à escola, ao grupo de amigos, à família, às redes sociais.</p>
      <p>O adolescente que vive a fé com alegria evangeliza outro adolescente. Nesta gincana vocês mostraram isso: a fé que se transforma em ação, em partilha e em união. E Jesus deixou claro que nenhum gesto de amor passa despercebido aos olhos d’Ele.</p>
    </div>

    <div class="versiculos-menores">
      <blockquote class="card">
        <p>“Em verdade eu vos digo: todas as vezes que fizestes isso a um destes mais pequenos, que são meus irmãos, foi a mim que o fizestes.”</p>
        <cite>Mateus 25,40</cite>
      </blockquote>
      <blockquote class="card">
        <p>“Assim brilhe a vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem o vosso Pai que está nos céus.”</p>
        <cite>Mateus 5,16</cite>
      </blockquote>
    </div>

    <div class="agradecimento">Obrigado, ${listaEquipes}!<br>Continuem sendo luz.</div>
    <p class="placar-oficial">Para registro, o placar oficial ficou:
      ${equipes.map(e => `${esc(e.nome)} ${fmt(e.total)} pts`).join(' · ')}. O detalhamento está no painel.</p>
    <div class="final-acoes"><button type="button" id="voltar-painel">Voltar ao painel</button></div>`;
}

// ---------- Eventos ----------

document.getElementById('recarregar').addEventListener('click', carregar);
document.getElementById('telao').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
document.getElementById('btn-final').addEventListener('click', () => { location.hash = ROTA_FINAL; scrollTo(0, 0); });
document.getElementById('final').addEventListener('click', ev => {
  if (ev.target.id === 'voltar-painel') { history.pushState('', '', location.pathname + location.search); mostrarTela(); scrollTo(0, 0); }
});
window.addEventListener('hashchange', mostrarTela);

carregar();
// Relê os CSVs publicados periodicamente (útil no telão).
setInterval(carregar, INTERVALO_ATUALIZACAO);
