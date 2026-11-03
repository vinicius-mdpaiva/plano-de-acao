/* Plano de Ação WBC · interface.
   Os dados vêm de /api/dados e toda alteração vai para /api/acao (o servidor confere as permissões). */
(() => {
'use strict';

const PRODUTOS = ['Membership','Mídia','Patrocínio','Mídia + Membership','Mídia + Patrocínio','Membership + Patrocínio','Combo 360 (Mídia + Patrocínio + Membership)'];
const PROB = {Quente:.9, Morno:.6, Frio:.3};
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS = ['dom','seg','ter','qua','qui','sex','sáb'];

/* ---------- estado ---------- */
let D = null;                 // resposta de /api/dados
let TIME = [], ITENS = [], FOTOS = {}, CLINT = {}, SEMANAS = [], MES = null, HOJE = '', ATUAL = '';
const state = {semana:null, tab:null, editing:null, verPessoa:'Todos', verDia:'', verMes:'Todos', confirmar:false, editAcesso:null, senhaGerada:null};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fd = d => { if(!d) return '—'; const x=new Date(d+'T12:00:00Z'); return `${DIAS[x.getUTCDay()]} ${d.slice(8,10)}/${d.slice(5,7)}`; };
const dm = d => `${d.slice(8,10)}/${d.slice(5,7)}`;
const addDias = (iso,n) => { const d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const segunda = iso => { const g=new Date(iso+'T12:00:00Z').getUTCDay(); return addDias(iso, g===0?-6:1-g); };
function semanaIso(iso){ const d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7)); const a=new Date(Date.UTC(d.getUTCFullYear(),0,4)); return 1+Math.round(((d-a)/864e5-3+((a.getUTCDay()+6)%7))/7); }
const wk = w => 'S'+semanaIso(w);
const sem = w => ({id:w, ini:w, fim:addDias(w,4), label:`${wk(w)} · ${dm(w)} a ${dm(addDias(w,4))}`});
const nextWeek = w => addDias(w,7);
const pessoa = n => TIME.find(p=>p.nome===n) || {nome:n, esteira:'vd'};
const esteiraDe = n => pessoa(n).esteira;
const membros = () => TIME.filter(p=>p.esteira!=='gs' && p.ativo);
const negocioDe = i => (i.deal_id && CLINT.porId[i.deal_id]) || null;
const etapa = i => (i.deal_id && (D.etapas[i.deal_id] || negocioDe(i)?.etapa)) || (i.deal_id ? 'Clint' : 'Fora do Clint');
const prev = i => i.previsao || (esteiraDe(i.dono)==='pv' ? (negocioDe(i)?.data_reuniao || '') : '');
const prodOptions = sel => `<option value="">Selecione…</option>` + PRODUTOS.map(p=>`<option ${p===sel?'selected':''}>${esc(p)}</option>`).join('');
const tempOptions = sel => ['Quente','Morno','Frio'].map(t=>`<option ${t===sel?'selected':''}>${t}</option>`).join('');
const mesmaConta = (a,b) => (a.deal_id && b.deal_id) ? a.deal_id===b.deal_id : String(a.empresa).trim().toLowerCase()===String(b.empresa).trim().toLowerCase();
const souGestor = () => D.usuario.papel==='admin';
const me = () => D.usuario.nome;

function toast(m){ const t=$('#toast'); t.textContent=m; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,3200); }

async function api(tipo, params){
  let r;
  try {
    r = await fetch('/api/acao',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tipo,params})});
  } catch { toast('Sem conexão. Tente de novo.'); return null; }
  if(r.status===401){ location.href='/login'; return null; }
  const j = await r.json().catch(()=>({ok:false,erro:'Resposta inválida do servidor.'}));
  if(!j.ok){ toast(j.erro || 'Não foi possível salvar.'); return null; }
  return j;
}
async function salvar(tipo, params, msg){
  const j = await api(tipo, params);
  if(!j) return null;
  await carregar();
  render();
  if(j.aviso || msg) toast(j.aviso || msg);
  return j;
}

/* ---------- carga ---------- */
async function carregar(){
  const r = await fetch('/api/dados',{cache:'no-store'});
  if(r.status===401){ location.href='/login'; return; }
  const j = await r.json();
  if(!j.ok) throw new Error(j.erro || 'Erro ao carregar.');
  D = j; HOJE = j.hoje; ATUAL = segunda(HOJE);
  TIME = j.time;
  const nome = Object.fromEntries(TIME.map(p=>[p.id,p.nome]));
  ITENS = j.itens.map(i=>({...i, dono:nome[i.dono_id]||'?', destino:i.destino_id?nome[i.destino_id]:null, de:i.de_id}));
  SEMANAS = []; for(let k=-12;k<=12;k++) SEMANAS.push(sem(addDias(ATUAL,7*k)));
  if(!state.semana) state.semana = ATUAL;
  if(!state.verDia) state.verDia = HOJE;
  // negócios do Clint para a busca
  const porId = {}, porRotulo = {}, rot = {};
  for(const n of j.negocios){
    porId[n.deal_id]=n;
    let r0 = (n.empresa||n.contato_nome||'Sem nome').trim();
    if(rot[r0]) r0 = `${r0} · ${n.contato_nome||n.deal_id.slice(0,6)}`;
    rot[r0]=1; n.rotulo=r0; porRotulo[r0]=n;
  }
  CLINT = {porId, porRotulo};
  montarMes();
}
function montarMes(){
  const ini = sem(state.semana).ini, mes = ini.slice(0,7);
  const semanas=[]; let d=segunda(mes+'-01'); if(d.slice(0,7)!==mes) d=addDias(d,7);
  for(; d.slice(0,7)===mes; d=addDias(d,7)) semanas.push(d);
  MES = {id:mes, label:`${MESES[Number(mes.slice(5,7))-1]}/${mes.slice(0,4)}`, semanas, prazo:addDias(semanas[0],4)};
  const nome = Object.fromEntries(TIME.map(p=>[p.id,p.nome]));
  FOTOS = {};
  for(const f of D.fotos.filter(f=>f.mes===mes)){
    FOTOS[nome[f.dono_id]] = {id:f.id, congelado:f.congelado_em?String(f.congelado_em).slice(0,10):null, itens:f.itens};
  }
}

/* ---------- plano do mês (fotografia) ---------- */
function desfecho(f, dono){
  const its = ITENS.filter(i=>i.dono===dono && MES.semanas.includes(i.semana) && mesmaConta(i,f));
  const g=its.find(i=>i.resultado==='ganhou'); if(g) return {t:'Ganhou na '+wk(g.semana), c:'p-good', fim:true, ganho:g.valor};
  const r=its.find(i=>i.resultado==='realizada'); if(r) return {t:'Reunião realizada na '+wk(r.semana), c:'p-good', fim:true, ganho:0, real:true};
  const l=its.find(i=>i.resultado==='perdeu'||i.resultado==='noshow'); if(l) return {t:(l.resultado==='perdeu'?'Perdeu':'No-show')+' na '+wk(l.semana), c:'p-bad', fim:true, perdido:true};
  const a=its.find(i=>!i.resultado); if(a) return {t:'No plano da '+wk(a.semana), c:'p-vd'};
  if(f.semana < ATUAL) return {t:'Atrasado · era para a '+wk(f.semana), c:'p-warn'};
  return {t:'Ainda não entrou no plano semanal', c:'p-open'};
}
function resumoFoto(donos){
  const linhas=[]; donos.forEach(d=>(FOTOS[d]?.itens||[]).forEach(f=>linhas.push({...f,dono:d,des:desfecho(f,d)})));
  const vd=linhas.filter(l=>esteiraDe(l.dono)==='vd'), pv=linhas.filter(l=>esteiraDe(l.dono)==='pv');
  const fora=ITENS.filter(i=>donos.includes(i.dono) && MES.semanas.includes(i.semana) && i.resultado==='ganhou'
    && !linhas.some(l=>l.dono===i.dono && mesmaConta(l,i)));
  return {linhas,vd,pv,fora,
    total:vd.reduce((a,l)=>a+l.valor,0),
    ganho:vd.filter(l=>l.des.ganho).reduce((a,l)=>a+l.des.ganho,0),
    perdido:vd.filter(l=>l.des.perdido).reduce((a,l)=>a+l.valor,0),
    foraV:fora.reduce((a,i)=>a+i.valor,0),
    realPV:pv.filter(l=>l.des.real).length};
}
function gradeSemanas(linhas){
  return `<div class="kpis">${MES.semanas.map(w=>{
    const L=linhas.filter(l=>l.semana===w), v=L.filter(l=>esteiraDe(l.dono)==='vd'), p=L.filter(l=>esteiraDe(l.dono)==='pv');
    return `<div class="kpi"><span class="k">${sem(w).label}</span><span class="v">${v.length?brl(v.reduce((a,l)=>a+l.valor,0)):p.length+' reun.'}</span><span class="d">${v.length?v.length+' negócios':''}${v.length&&p.length?' · ':''}${p.length?p.length+' reuniões PV':''}${!L.length?'nada previsto':''}</span></div>`;}).join('')}</div>`;
}
function tabelaFoto(linhas, mostrarDono, editavel){
  const rows=[...linhas].sort((a,b)=>a.semana.localeCompare(b.semana)).map(l=>{
    const pv=esteiraDe(l.dono)==='pv';
    return `<tr>${mostrarDono?`<td><span class="pill ${pv?'p-pv':'p-vd'}">${esc(l.dono)}</span></td>`:''}
      <td><div class="stack"><b>${esc(l.empresa)}</b><span class="pill p-prod">${esc(l.produto)}</span></div></td>
      <td class="num">${pv?'—':brl(l.valor)}</td><td>${esc(l.temp)}</td><td class="when">${wk(l.semana)}<span class="tag">${dm(l.semana)} a ${dm(addDias(l.semana,4))}</span></td>
      <td>${editavel?'<span class="tag">Rascunho</span>':`<span class="pill ${l.des.c}">${l.des.t}</span>`}</td>
      <td>${editavel?`<button class="btn sm ghost" data-rm="${l.id}">Remover</button>`:''}</td></tr>`;}).join('');
  return `<div class="tbl"><table><thead><tr>${mostrarDono?'<th>Dono</th>':''}<th>Negócio / lead</th><th class="num">Valor</th><th>Temp.</th><th>Semana prevista</th><th>O que aconteceu</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td colspan="7" class="empty">Nenhum negócio na fotografia ainda.</td></tr>`}</tbody></table></div>`;
}
function painelRevisao(r, pv){
  return pv ? `<div class="kpis">
      <div class="kpi"><span class="k">Contas na fotografia</span><span class="v">${r.pv.length}</span><span class="d">reuniões previstas no mês</span></div>
      <div class="kpi"><span class="k">Realizadas</span><span class="v">${r.realPV}</span><span class="d">da fotografia</span></div>
      <div class="kpi"><span class="k">Atrasadas</span><span class="v">${r.pv.filter(l=>l.des.c==='p-warn').length}</span><span class="d">semana prevista já passou</span></div></div>`
  : `<div class="kpis">
      <div class="kpi"><span class="k">Fotografia</span><span class="v">${brl(r.total)}</span><span class="d">${r.vd.length} negócios no início do mês</span></div>
      <div class="kpi"><span class="k">Convertido</span><span class="v">${brl(r.ganho)}</span><span class="d">${r.total?Math.round(r.ganho/r.total*100):0}% da fotografia</span></div>
      <div class="kpi"><span class="k">Perdido</span><span class="v">${brl(r.perdido)}</span><span class="d">da fotografia</span></div>
      <div class="kpi"><span class="k">Ganho fora da fotografia</span><span class="v">${brl(r.foraV)}</span><span class="d">${r.fora.length} negócios que surgiram no mês</span></div></div>`;
}
function datalistClint(id){
  return `<datalist id="${id}">${Object.keys(CLINT.porRotulo).sort((a,b)=>a.localeCompare(b,'pt-BR')).map(c=>`<option value="${esc(c)}">`).join('')}</datalist>`;
}
function infoClint(n, pv){
  if(!n) return 'Empresa fora do Clint: ela entra no plano mesmo assim.';
  return `No Clint: etapa <b>${esc(n.etapa||'—')}</b>${n.valor?` · valor <b>${brl(n.valor)}</b>`:''}${pv&&n.data_reuniao?` · reunião <b>${fd(n.data_reuniao)}</b>`:''}`;
}
function viewMes(){
  const eu=me(), pv=esteiraDe(eu)==='pv', F=FOTOS[eu] || {congelado:null,itens:[]};
  const r=resumoFoto([eu]);
  if(F.congelado){
    $('#view').innerHTML=`
    <div class="panel"><h2>Plano de ${MES.label} · fotografia de ${fd(F.congelado)}</h2>
      <p class="hint">Esta é a foto do seu funil no início do mês. Ela não muda mais. A coluna "O que aconteceu" acompanha o plano semanal sozinha, para a revisão no fim do mês.</p>
      ${painelRevisao(r,pv)}</div>
    <div class="panel"><h2>Distribuição por semana</h2>${gradeSemanas(r.linhas)}</div>
    <div class="panel"><h2>Negócios da fotografia</h2>${tabelaFoto(r.linhas,false,false)}</div>`;
    return;
  }
  $('#view').innerHTML=`
  <div class="panel"><h2>Montar o plano de ${MES.label}</h2>
    <p class="hint">Liste todo o funil que você vai trabalhar no mês e a semana em que espera ${pv?'a reunião':'o fechamento'}. Prazo: ${fd(MES.prazo)}. Depois de congelar, a fotografia não muda. Toda semana, o que estiver previsto aparece no seu plano semanal para você puxar com um clique.</p>
    <form id="addM" class="form">
      <label class="f wide" for="mEmp">Empresa (busca no Clint)<input id="mEmp" list="clintM" autocomplete="off" placeholder="Digite o nome"></label>
      <label class="f wide" for="mProd">${pv?'Produto de interesse':'Produto'}<select id="mProd">${prodOptions('')}</select></label>
      ${pv?'':`<label class="f" for="mVal">Valor (R$)<input id="mVal" type="number" min="0" step="500" placeholder="20000"></label>`}
      <label class="f" for="mTemp">Temperatura<select id="mTemp">${tempOptions('Morno')}</select></label>
      <label class="f" for="mSem">Semana prevista<select id="mSem">${MES.semanas.map(w=>`<option value="${w}">${sem(w).label}</option>`).join('')}</select></label>
      <p class="clint" id="mInfo">Busque a empresa pelo nome. Se não estiver no Clint, digite o nome mesmo assim.</p>
      <div class="actions"><button class="btn primary" type="submit">Adicionar à fotografia</button></div>
    </form>
    ${datalistClint('clintM')}</div>
  <div class="panel"><h2>Distribuição por semana</h2>${gradeSemanas(r.linhas)}</div>
  <div class="panel"><h2>Rascunho da fotografia</h2>${tabelaFoto(r.linhas,false,true)}
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      ${state.confirmar
        ? `<span>Congelar agora? Depois disso a fotografia não pode ser editada.</span><button class="btn primary" id="congSim">Sim, congelar</button><button class="btn ghost" id="congNao">Voltar</button>`
        : `<button class="btn primary" id="congelar" ${F.itens.length?'':'disabled'}>Congelar fotografia do mês</button>`}
    </div></div>`;
  $('#mEmp').addEventListener('input',()=>{
    const n=CLINT.porRotulo[$('#mEmp').value.trim()];
    $('#mInfo').innerHTML = n ? infoClint(n,pv) : 'Busque a empresa pelo nome. Se não estiver no Clint, digite o nome mesmo assim.';
    if(n && n.valor && $('#mVal') && !$('#mVal').value) $('#mVal').value=n.valor;
  });
  $('#addM').addEventListener('submit',async e=>{e.preventDefault();
    const rot=$('#mEmp').value.trim(), n=CLINT.porRotulo[rot];
    const emp=n?(n.empresa||n.contato_nome||rot):rot, pr=$('#mProd').value, val=pv?0:Number($('#mVal').value||0);
    if(!emp) return toast('Informe a empresa'); if(!pr) return toast('Escolha o produto'); if(!pv&&!val) return toast('Informe o valor');
    await salvar('fotoAdicionar',{mes:MES.id, empresa:emp, deal_id:n?.deal_id||null, produto:pr, valor:val, temp:$('#mTemp').value, semana:$('#mSem').value}, `${emp} entrou na fotografia`);
  });
  $('#view').querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>salvar('fotoRemover',{id:Number(b.dataset.rm)},'Removido da fotografia')));
  if($('#congelar')) $('#congelar').addEventListener('click',()=>{state.confirmar=true; render();});
  if($('#congSim')) $('#congSim').addEventListener('click',async()=>{state.confirmar=false; await salvar('fotoCongelar',{mes:MES.id},'Fotografia congelada');});
  if($('#congNao')) $('#congNao').addEventListener('click',()=>{state.confirmar=false; render();});
}
function viewMesGestor(){
  const nomes=membros().map(p=>p.nome);
  if(state.verMes!=='Todos' && !nomes.includes(state.verMes)) state.verMes='Todos';
  const donos=state.verMes==='Todos'?nomes:[state.verMes];
  const r=resumoFoto(donos), soPv=donos.every(d=>esteiraDe(d)==='pv');
  const st=nomes.map(n=>{const F=FOTOS[n]; return `<span class="pill ${F&&F.congelado?'p-good':'p-warn'}">${esc(n)} · ${F&&F.congelado?'congelado em '+fd(F.congelado):F?'em rascunho':'não começou'}</span>`;}).join(' ');
  $('#view').innerHTML=`
  <div class="panel"><h2>Planos de ${MES.label}</h2>
    <div class="form" style="grid-template-columns:minmax(0,220px)"><label class="f" for="verM">Plano de<select id="verM">${['Todos',...nomes].map(n=>`<option ${n===state.verMes?'selected':''}>${esc(n)}</option>`).join('')}</select></label></div>
    <div class="result">${st}</div>
    <p class="hint">Rascunhos aparecem na soma para você acompanhar a montagem. A revisão vale a partir do congelamento. O mês segue a semana escolhida no topo.</p>
    ${soPv?'':painelRevisao(r,false)}
    ${donos.some(d=>esteiraDe(d)==='pv')?painelRevisao(r,true):''}</div>
  <div class="panel"><h2>Distribuição por semana</h2>${gradeSemanas(r.linhas)}</div>
  <div class="panel"><h2>Negócios da fotografia</h2>${tabelaFoto(r.linhas,state.verMes==='Todos',false)}</div>
  ${r.fora.length?`<div class="panel"><h2>Ganhos fora da fotografia</h2><p class="hint">Negócios que ninguém previu no início do mês e viraram venda.</p><ul style="margin:0;padding-left:18px">${r.fora.map(i=>`<li><b>${esc(i.empresa)}</b> · ${esc(i.dono)} · ${brl(i.valor)} · ${wk(i.semana)}</li>`).join('')}</ul></div>`:''}`;
  $('#verM').addEventListener('change',e=>{state.verMes=e.target.value; render();});
}
function sugestoesDoMes(eu){
  const F=FOTOS[eu]; if(!F || !F.congelado || !MES.semanas.includes(state.semana)) return [];
  return F.itens.filter(f=> f.semana<=state.semana && !desfecho(f,eu).fim
    && !ITENS.some(i=>i.dono===eu && i.semana===state.semana && mesmaConta(i,f)));
}

/* ---------- itens ---------- */
const RES = {ganhou:['Ganhou','p-good'], perdeu:['Perdeu','p-bad'], rolou:['Rolou','p-warn'], realizada:['Reunião realizada','p-good'], noshow:['No-show','p-bad']};
const statusPill = i => i.resultado ? `<span class="pill ${RES[i.resultado][1]}">${RES[i.resultado][0]}</span>` : '<span class="pill p-open">Aberto</span>';
function origemPill(i){
  if(i.origem==='fora') return '<span class="pill p-warn">Fora do plano</span>';
  if(i.origem==='pv') return '<span class="pill p-pv">Veio da pré-vendas</span>';
  if(i.de) return '<span class="pill p-open">Rolou da semana anterior</span>';
  return '<span class="pill p-vd">Plano</span>';
}
const semPasso = i => !i.resultado && (!i.acao || !i.quando);

function planoTabela(dono, editavel){
  const itens = ITENS.filter(i=>i.dono===dono && i.semana===state.semana).sort((a,b)=>(a.quando||'9').localeCompare(b.quando||'9'));
  return tabelaItens(itens, editavel, false, esteiraDe(dono)==='pv');
}
function tabelaItens(itens, editavel, mostrarDono, soPv){
  const cols = mostrarDono ? 7 : 6, s = sem(state.semana);
  const rows = itens.map(i=>{
    const pv = esteiraDe(i.dono)==='pv';
    const semDiaPill = '<span class="pill p-warn">Sem dia definido</span>';
    const passo = i.resultado ? (i.acao?`<span>${esc(i.acao)}</span><span class="tag">${fd(i.quando)}</span>`:'<span class="tag">—</span>') :
      !i.acao ? `<div class="stack"><span class="pill p-warn">Sem ação definida</span>${i.quando?'':semDiaPill}</div>` :
      `<div class="stack"><span>${esc(i.acao)}</span>${i.quando?`<span class="tag">${fd(i.quando)}</span>`:semDiaPill}</div>`;
    const main = `<tr class="${!i.resultado&&!i.quando?'nodate':''}">
      ${mostrarDono?`<td><span class="pill ${pv?'p-pv':'p-vd'}">${esc(i.dono)}</span></td>`:''}
      <td><div class="stack"><b>${esc(i.empresa)}</b>${i.produto?`<span class="pill p-prod">${esc(i.produto)}</span>`:'<span class="tag">Sem produto</span>'}${origemPill(i)}${pv?`<span class="tag">${esc(i.temp)}</span>`:`<span class="tag">${brl(i.valor)} · ${esc(i.temp)}</span>`}${pv&&i.destino?`<span class="tag">Passou para ${esc(i.destino)}</span>`:''}</div></td>
      <td class="txt">${i.status?esc(i.status):'<span class="tag">Sem status</span>'}<span class="tag">Clint: ${esc(etapa(i))}</span></td>
      <td class="txt">${passo}</td>
      <td class="when">${fd(prev(i))}</td>
      <td>${statusPill(i)}</td>
      <td>${editavel && !i.resultado ? `<button class="btn sm" data-edit="${i.id}">${state.editing===i.id?'Fechar':'Atualizar'}</button>`:''}</td>
    </tr>`;
    if(state.editing!==i.id || !editavel) return main;
    return main + `<tr class="edit"><td colspan="${cols}">
      <form class="form" data-save="${i.id}">
        <label class="f wide" for="e-status-${i.id}">Em que pé está
          <input id="e-status-${i.id}" value="${esc(i.status)}" placeholder="Ex.: proposta enviada, aguardando o sócio"></label>
        <label class="f wide" for="e-acao-${i.id}">Ação desta semana
          <input id="e-acao-${i.id}" value="${esc(i.acao)}" placeholder="Ex.: reunião com o decisor"></label>
        <label class="f" for="e-quando-${i.id}">Quando
          <input id="e-quando-${i.id}" type="date" value="${i.quando||''}" min="${s.ini}" max="${s.fim}"></label>
        <label class="f" for="e-prev-${i.id}">${pv?'Data da reunião':'Previsão de fechamento'}
          <input id="e-prev-${i.id}" type="date" value="${i.previsao||''}"></label>
        <label class="f" for="e-temp-${i.id}">Temperatura
          <select id="e-temp-${i.id}">${tempOptions(i.temp)}</select></label>
        <label class="f" for="e-prod-${i.id}">Produto
          <select id="e-prod-${i.id}">${prodOptions(i.produto)}</select></label>
        ${pv?'':`<label class="f" for="e-val-${i.id}">Valor (R$)<input id="e-val-${i.id}" type="number" min="0" step="500" value="${i.valor||''}"></label>`}
        <div class="actions"><button class="btn primary" type="submit">Salvar</button>${i.de?'':`<button class="btn ghost danger" type="button" data-del="${i.id}">Excluir item</button>`}</div>
      </form></td></tr>`;
  }).join('');
  const colData = mostrarDono ? 'Reunião / previsão' : soPv ? 'Data da reunião' : 'Previsão de fechamento';
  return `<div class="tbl"><table>
    <thead><tr>${mostrarDono?'<th>Dono</th>':''}<th>${mostrarDono?'Lead / negócio':soPv?'Lead':'Negócio'}</th><th>Em que pé está</th><th>Ação da semana · quando</th><th>${colData}</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${cols}" class="empty">Nenhum compromisso nesta semana ainda.</td></tr>`}</tbody></table></div>`;
}
function ligarTabela(root){
  root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
    const id=Number(b.dataset.edit); state.editing = state.editing===id?null:id; render();
  }));
  root.querySelectorAll('form[data-save]').forEach(f=>f.addEventListener('submit',async e=>{
    e.preventDefault(); const id=Number(f.dataset.save), i=ITENS.find(x=>x.id===id);
    const p={id, status:$('#e-status-'+id).value.trim(), acao:$('#e-acao-'+id).value.trim(), quando:$('#e-quando-'+id).value,
      previsao:$('#e-prev-'+id).value, temp:$('#e-temp-'+id).value, produto:$('#e-prod-'+id).value,
      valor:$('#e-val-'+id)?Number($('#e-val-'+id).value||0):0};
    if(!p.produto) return toast('Escolha o produto');
    const ok = await api('atualizarItem',p);
    if(ok){ state.editing=null; await carregar(); render(); toast(`${i.empresa} atualizado`); }
  }));
  root.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
    const ok = await api('excluirItem',{id:Number(b.dataset.del)});
    if(ok){ state.editing=null; await carregar(); render(); toast('Item excluído'); }
  }));
}

/* ---------- MEU PLANO ---------- */
function viewPlano(){
  const eu=me(), pv=esteiraDe(eu)==='pv', s=sem(state.semana);
  const pend = ITENS.filter(i=>i.dono===eu && i.semana===state.semana && semPasso(i)).length;
  const sug = sugestoesDoMes(eu);
  $('#view').innerHTML = `
  ${sug.length?`<div class="panel">
    <h2>Do seu plano do mês para a ${wk(state.semana)}</h2>
    <p class="hint">Negócios da fotografia de ${MES.label} previstos para esta semana ou atrasados. Puxe para o plano e complete o status, a ação e o dia.</p>
    <div class="tbl"><table><thead><tr><th>Negócio / lead</th><th class="num">Valor</th><th>Semana prevista</th><th></th></tr></thead><tbody>
    ${sug.map((f,k)=>`<tr><td><div class="stack"><b>${esc(f.empresa)}</b><span class="pill p-prod">${esc(f.produto)}</span></div></td>
      <td class="num">${pv?'—':brl(f.valor)}</td>
      <td>${f.semana<state.semana?`<span class="pill p-warn">Atrasado · ${wk(f.semana)}</span>`:wk(f.semana)}</td>
      <td><button class="btn sm" data-puxar="${k}">Trazer para a semana</button></td></tr>`).join('')}
    </tbody></table></div></div>`:''}
  <div class="panel">
    <h2>Novo compromisso na ${wk(state.semana)}</h2>
    <p class="hint">${pv?'Cada linha é uma reunião que você se compromete a realizar.':'Cada linha é um negócio que você se compromete a fechar.'} Registre em que pé está, o que você vai fazer e em que dia.</p>
    <form id="add" class="form">
      <label class="f wide" for="emp">Empresa (busca no Clint)
        <input id="emp" list="clint" placeholder="Digite o nome" autocomplete="off"></label>
      ${pv?'':`<label class="f" for="val">Valor (R$)<input id="val" type="number" min="0" step="500" placeholder="15000"></label>`}
      <label class="f" for="temp">Temperatura
        <select id="temp">${tempOptions('Morno')}</select></label>
      <label class="f wide" for="prod">${pv?'Produto de interesse':'Produto'}
        <select id="prod">${prodOptions('')}</select></label>
      <p class="clint" id="clintInfo">Busque a empresa pelo nome. Se não estiver no Clint, digite o nome mesmo assim.</p>
      <label class="f wide" for="st">Em que pé está
        <input id="st" placeholder="${pv?'Ex.: respondeu o 3º toque, quer entender preço':'Ex.: proposta enviada, aguardando o sócio'}"></label>
      <label class="f wide" for="ac">Ação desta semana
        <input id="ac" placeholder="${pv?'Ex.: ligação para agendar com o decisor':'Ex.: reunião de fechamento com o sócio'}"></label>
      <label class="f" for="qd">Quando
        <input id="qd" type="date" min="${s.ini}" max="${s.fim}"></label>
      <label class="f" for="pv">${pv?'Data da reunião':'Previsão de fechamento'}
        <input id="pv" type="date"></label>
      <div class="actions">
        <button class="btn primary" type="submit">Adicionar ao plano</button>
        <button class="btn ghost" type="button" id="addFora">Registrar fora do plano</button>
      </div>
    </form>
    ${datalistClint('clint')}
  </div>
  <div class="panel">
    <h2>Meu plano · ${s.label}</h2>
    ${pend?`<p class="hint"><span class="pill p-warn">${pend} sem próximo passo</span> Clique em Atualizar para definir a ação e o dia.</p>`:''}
    ${planoTabela(eu,true)}
  </div>`;
  $('#emp').addEventListener('input',()=>{
    const n=CLINT.porRotulo[$('#emp').value.trim()];
    $('#clintInfo').innerHTML = n ? infoClint(n,pv) : 'Busque a empresa pelo nome. Se não estiver no Clint, digite o nome mesmo assim.';
    if(n){ if($('#val') && !$('#val').value && n.valor) $('#val').value=n.valor; if(pv && n.data_reuniao && !$('#pv').value) $('#pv').value=n.data_reuniao; }
  });
  const add = async orig => {
    const rot=$('#emp').value.trim(), n=CLINT.porRotulo[rot] || (state.puxado && state.puxado.empresa===rot ? state.puxado : null);
    const emp=n?(n.empresa||n.contato_nome||rot):rot, val=pv?0:Number($('#val').value||0);
    const st=$('#st').value.trim(), ac=$('#ac').value.trim(), qd=$('#qd').value, pr=$('#prod').value;
    if(!emp){ toast('Informe a empresa'); return $('#emp').focus(); }
    if(!pv && !val){ toast('Informe o valor'); return $('#val').focus(); }
    if(!pr){ toast('Escolha o produto'); return $('#prod').focus(); }
    if(orig==='plano' && (!st||!ac||!qd)) return toast('Preencha em que pé está, a ação e o dia');
    const ok = await salvar('criarItem',{semana:state.semana, empresa:emp, deal_id:n?.deal_id||null, valor:val, temp:$('#temp').value,
      origem:orig, status:st, acao:ac, quando:qd, previsao:$('#pv').value, produto:pr},
      orig==='fora'?`${emp} registrado fora do plano`:`${emp} adicionado ao plano`);
    if(ok) state.puxado=null;
  };
  $('#add').addEventListener('submit',e=>{e.preventDefault(); add('plano');});
  $('#addFora').addEventListener('click',()=>add('fora'));
  $('#view').querySelectorAll('[data-puxar]').forEach(b=>b.addEventListener('click',()=>{
    const f=sug[Number(b.dataset.puxar)];
    state.puxado={empresa:f.empresa, deal_id:f.deal_id};
    $('#emp').value=f.empresa; if($('#val')) $('#val').value=f.valor||''; $('#temp').value=f.temp; $('#prod').value=f.produto;
    $('#emp').dispatchEvent(new Event('input'));
    $('#st').focus(); toast(`${f.empresa} no formulário: complete status, ação e dia`);
  }));
  ligarTabela($('#view'));
}

/* ---------- FECHAMENTO ---------- */
function viewFechamento(){
  const eu=me(), pv=esteiraDe(eu)==='pv', nw=wk(nextWeek(state.semana));
  const abertos=ITENS.filter(i=>i.dono===eu && i.semana===state.semana && !i.resultado);
  const vend=TIME.filter(p=>p.esteira==='vd'&&p.ativo).map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  const rows=abertos.map(i=>`<tr data-id="${i.id}">
    <td><b>${esc(i.empresa)}</b><span class="tag">${pv?'':brl(i.valor)+' · '}${esc(i.temp)}</span></td>
    <td class="txt">${i.acao?esc(i.acao)+`<span class="tag">${fd(i.quando)}</span>`:'<span class="tag">Sem ação definida</span>'}</td>
    <td><div class="result">${pv?`
      <select aria-label="Vendedor de destino" class="dest" style="width:auto"><option value="">Passar para…</option>${vend}</select>
      <button class="btn sm" data-r="realizada">Realizada</button>
      <button class="btn sm" data-r="noshow">No-show</button>
      <button class="btn sm" data-r="rolou">Remarcar p/ ${nw}</button>`:`
      <button class="btn sm" data-r="ganhou">Ganhou</button>
      <button class="btn sm" data-r="perdeu">Perdeu</button>
      <button class="btn sm" data-r="rolou">Rolar p/ ${nw}</button>`}</div></td></tr>`).join('');
  $('#view').innerHTML=`<div class="panel">
    <h2>Fechar a ${sem(state.semana).label}</h2>
    <p class="hint">Só aparece o que ainda está aberto. ${pv?'Reunião realizada pede o vendedor: a negociação entra no plano dele na semana seguinte, para ele completar o próximo passo.':'Rolar leva o item para a próxima semana com o status atual. Você só precisa redefinir a ação.'}</p>
    <div class="tbl"><table><thead><tr><th>Item</th><th>Ação planejada</th><th>Resultado</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="3" class="empty">Tudo fechado na ${wk(state.semana)}.</td></tr>`}</tbody></table></div></div>`;
  $('#view').querySelectorAll('tr[data-id] button').forEach(b=>b.addEventListener('click',async()=>{
    const tr=b.closest('tr'), i=ITENS.find(x=>x.id==tr.dataset.id), r=b.dataset.r;
    const p={id:i.id, resultado:r};
    if(r==='realizada'){
      p.destinoId=Number(tr.querySelector('.dest').value)||null;
      if(!p.destinoId){ toast('Escolha para qual vendedor a reunião foi passada'); tr.querySelector('.dest').focus(); return; }
    }
    b.disabled=true;
    await salvar('fecharItem',p, r==='rolou'?`${i.empresa} foi para a ${nw}`:`${i.empresa}: ${RES[r][0]}`);
  }));
}

/* ---------- números ---------- */
function calcPessoa(n,w){
  const S=ITENS.filter(i=>i.semana===w&&i.dono===n), plano=S.filter(i=>i.origem!=='fora');
  if(esteiraDe(n)==='pv'){
    const real=S.filter(i=>i.resultado==='realizada'), ns=S.filter(i=>i.resultado==='noshow').length;
    const filhos=ITENS.filter(x=>x.origem==='pv' && real.some(r=>r.id===x.de));
    return {S,comp:plano.length,real:real.length,ns,show:(real.length+ns)?Math.round(real.length/(real.length+ns)*100):null,
      handoffs:real.length,fora:S.filter(i=>i.origem==='fora').length,aberto:S.filter(i=>!i.resultado).length,
      ganhosGerados:filhos.filter(x=>x.resultado==='ganhou').length,emNeg:filhos.filter(x=>!x.resultado).length};
  }
  const comp=plano.reduce((a,i)=>a+i.valor,0), pond=plano.filter(i=>!i.resultado).reduce((a,i)=>a+i.valor*(PROB[i.temp]||.6),0);
  const ganho=plano.filter(i=>i.resultado==='ganhou').reduce((a,i)=>a+i.valor,0);
  const fora=S.filter(i=>i.origem==='fora'&&i.resultado==='ganhou').reduce((a,i)=>a+i.valor,0);
  const s=sem(w), prevSem=S.filter(i=>!i.resultado && prev(i)>=s.ini && prev(i)<=addDias(s.ini,6)).reduce((a,i)=>a+i.valor,0);
  return {S,comp,pond,ganho,fora,prevSem,ass:comp?Math.round(ganho/comp*100):0,aberto:S.filter(i=>!i.resultado).length,
    pv:S.filter(i=>i.origem==='pv').length};
}
function diasDaSemana(w){ const d=[]; for(let k=0;k<5;k++) d.push(addDias(w,k)); return d; }
function agenda(itens, mostrarDono){
  return `<div class="agenda">${diasDaSemana(state.semana).map(d=>{
    const l=itens.filter(i=>i.quando===d && !i.resultado);
    return `<div class="day"><span class="d ${d===HOJE?'today':''}">${fd(d)}${d===HOJE?'<br>hoje':''}</span><ul>${
      l.length?l.map(i=>`<li>${mostrarDono?`<span class="pill ${esteiraDe(i.dono)==='pv'?'p-pv':'p-vd'}">${esc(i.dono)}</span>`:''}<b>${esc(i.empresa)}</b><span>${esc(i.acao)}</span></li>`).join(''):'<li class="tag">Nada planejado</li>'}</ul></div>`;
  }).join('')}</div>`;
}

/* ---------- MEU DASH ---------- */
function viewMeuDash(){
  const eu=me(), w=state.semana, c=calcPessoa(eu,w), pv=esteiraDe(eu)==='pv';
  const k = pv ? `
    <div class="kpi"><span class="k">Reuniões no plano</span><span class="v">${c.comp}</span><span class="d">meu compromisso</span></div>
    <div class="kpi"><span class="k">Realizadas</span><span class="v">${c.real}</span><span class="d">show rate ${c.show===null?'—':c.show+'%'}</span></div>
    <div class="kpi"><span class="k">Passadas a vendas</span><span class="v">${c.handoffs}</span><span class="d">entram na ${wk(nextWeek(w))}</span></div>
    <div class="kpi"><span class="k">Viraram venda</span><span class="v">${c.ganhosGerados}</span><span class="d">${c.emNeg} ainda em negociação</span></div>` : `
    <div class="kpi"><span class="k">Compromisso</span><span class="v">${brl(c.comp)}</span><span class="d">ponderado aberto ${brl(Math.round(c.pond))}</span></div>
    <div class="kpi"><span class="k">Ganho no plano</span><span class="v">${brl(c.ganho)}</span><span class="d">assertividade ${c.ass}%</span></div>
    <div class="kpi"><span class="k">Fora do plano</span><span class="v">${brl(c.fora)}</span><span class="d">entra no realizado</span></div>
    <div class="kpi"><span class="k">Previsto na semana</span><span class="v">${brl(c.prevSem)}</span><span class="d">aberto com previsão nesta semana</span></div>`;
  $('#view').innerHTML=`<div class="grid2">
    <div class="panel"><h2>Meus números · ${wk(w)}</h2><div class="kpis">${k}</div></div>
    <div class="panel"><h2>Minha semana, dia a dia</h2>${agenda(c.S,false)}</div></div>`;
}

/* ---------- GESTOR: VISÃO GERAL ---------- */
function viewGeral(){
  const w=state.semana, vds=TIME.filter(p=>p.esteira==='vd'), pvs=TIME.filter(p=>p.esteira==='pv');
  const V=vds.map(p=>calcPessoa(p.nome,w)), P=pvs.map(p=>calcPessoa(p.nome,w));
  const sum=(a,k)=>a.reduce((x,y)=>x+(y[k]||0),0);
  const comp=sum(V,'comp'), ganho=sum(V,'ganho'), fora=sum(V,'fora');
  const real=sum(P,'real'), ns=sum(P,'ns'), show=(real+ns)?Math.round(real/(real+ns)*100):null;
  const semAcao=ITENS.filter(i=>i.semana===w && semPasso(i));
  const doTime=ITENS.filter(i=>i.semana===w);
  const linhas=membros().map(p=>{ const c=calcPessoa(p.nome,w);
    return p.esteira==='pv'
      ? `<tr><td><span class="pill p-pv">Pré-vendas</span> ${esc(p.nome)}</td><td class="num">${c.comp} reuniões</td><td class="num">${c.real} realizadas</td><td class="num">${c.fora}</td><td class="num">${c.aberto}</td><td class="num">${c.S.filter(semPasso).length}</td></tr>`
      : `<tr><td><span class="pill p-vd">Vendas</span> ${esc(p.nome)}</td><td class="num">${brl(c.comp)}</td><td class="num">${brl(c.ganho+c.fora)}</td><td class="num">${c.S.filter(i=>i.origem==='fora').length}</td><td class="num">${c.aberto}</td><td class="num">${c.S.filter(semPasso).length}</td></tr>`;}).join('');
  $('#view').innerHTML=`
  <div class="panel">
    <h2>Esteira conectada · ${wk(w)}</h2>
    <div class="flow">
      <div class="step pv"><span class="k">Reuniões no plano</span><span class="v">${sum(P,'comp')}</span><span class="c">compromisso da pré-vendas</span></div>
      <div class="step pv"><span class="k">Realizadas</span><span class="v">${real}</span><span class="c">show rate ${show===null?'—':show+'%'}</span></div>
      <div class="step pv"><span class="k">Passadas a vendas</span><span class="v">${sum(P,'handoffs')}</span><span class="c">entram na ${wk(nextWeek(w))}</span></div>
      <div class="step vd"><span class="k">Negociações da PV</span><span class="v">${sum(V,'pv')}</span><span class="c">no plano dos vendedores</span></div>
      <div class="step vd"><span class="k">Ganhos da PV</span><span class="v">${sum(P,'ganhosGerados')}</span><span class="c">originados na pré-vendas</span></div>
    </div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="esteira-h"><span class="dot" style="background:var(--vd)"></span><h2>Vendas</h2></div><div class="kpis">
      <div class="kpi"><span class="k">Compromisso</span><span class="v">${brl(comp)}</span><span class="d">ponderado aberto ${brl(Math.round(sum(V,'pond')))}</span></div>
      <div class="kpi"><span class="k">Ganho no plano</span><span class="v">${brl(ganho)}</span><span class="d">assertividade ${comp?Math.round(ganho/comp*100):0}%</span></div>
      <div class="kpi"><span class="k">Fora do plano</span><span class="v">${brl(fora)}</span><span class="d">entra no realizado</span></div>
      <div class="kpi"><span class="k">Previsto na semana</span><span class="v">${brl(sum(V,'prevSem'))}</span><span class="d">aberto com previsão nesta semana</span></div></div></div>
    <div class="panel"><div class="esteira-h"><span class="dot" style="background:var(--pv)"></span><h2>Pré-vendas</h2></div><div class="kpis">
      <div class="kpi"><span class="k">Reuniões no plano</span><span class="v">${sum(P,'comp')}</span><span class="d">compromisso</span></div>
      <div class="kpi"><span class="k">Realizadas</span><span class="v">${real}</span><span class="d">show rate ${show===null?'—':show+'%'}</span></div>
      <div class="kpi"><span class="k">No-show</span><span class="v">${ns}</span><span class="d">na semana</span></div>
      <div class="kpi"><span class="k">Viraram venda</span><span class="v">${sum(P,'ganhosGerados')}</span><span class="d">${sum(P,'emNeg')} em negociação</span></div></div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>Agenda do time · ${wk(w)}</h2>${agenda(doTime,true)}</div>
    <div class="panel"><h2>Sem próximo passo</h2>
      ${semAcao.length?`<p class="hint">Itens abertos sem ação ou sem dia. Bom assunto para a daily.</p><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${semAcao.map(i=>`<li><b>${esc(i.empresa)}</b> · ${esc(i.dono)}${i.origem==='pv'?' <span class="pill p-pv">veio da pré-vendas</span>':''}</li>`).join('')}</ul>`:'<p class="hint">Todo item aberto tem ação e dia definidos.</p>'}
    </div>
  </div>
  <div class="panel"><h2>Por produto · ${wk(w)}</h2><div class="tbl"><table>
    <thead><tr><th>Produto</th><th class="num">Reuniões PV</th><th class="num">Negócios</th><th class="num">Compromisso</th><th class="num">Ganho</th></tr></thead>
    <tbody>${[...PRODUTOS,''].map(pr=>{
      const S=doTime.filter(i=>(i.produto||'')===pr), Vv=S.filter(i=>esteiraDe(i.dono)==='vd'), Pp=S.filter(i=>esteiraDe(i.dono)==='pv');
      if(!S.length) return '';
      return `<tr><td>${pr?`<span class="pill p-prod">${esc(pr)}</span>`:'<span class="tag">Sem produto</span>'}</td><td class="num">${Pp.length}</td><td class="num">${Vv.length}</td><td class="num">${brl(Vv.filter(i=>i.origem!=='fora').reduce((a,i)=>a+i.valor,0))}</td><td class="num">${brl(Vv.filter(i=>i.resultado==='ganhou').reduce((a,i)=>a+i.valor,0))}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Nada no plano desta semana ainda.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><h2>Por pessoa · ${wk(w)}</h2><div class="tbl"><table>
    <thead><tr><th>Pessoa</th><th class="num">Compromisso</th><th class="num">Realizado</th><th class="num">Fora do plano</th><th class="num">Em aberto</th><th class="num">Sem próximo passo</th></tr></thead>
    <tbody>${linhas}</tbody></table></div></div>`;
}

/* ---------- GESTOR: PLANOS DO TIME ---------- */
function viewTime(){
  const dias=diasDaSemana(state.semana);
  if(state.verDia && !dias.includes(state.verDia)) state.verDia='';
  const nomes=membros().map(p=>p.nome);
  if(state.verPessoa!=='Todos' && !nomes.includes(state.verPessoa)) state.verPessoa='Todos';
  const ops=['Todos',...nomes].map(n=>`<option ${n===state.verPessoa?'selected':''}>${esc(n)}</option>`).join('');
  const opsDia=[['','Todos os dias'],...dias.map(d=>[d,fd(d)+(d===HOJE?' (hoje)':'')])].map(([v,l])=>`<option value="${v}" ${v===state.verDia?'selected':''}>${l}</option>`).join('');
  const todos=state.verPessoa==='Todos';
  let itens=ITENS.filter(i=>i.semana===state.semana && (todos || i.dono===state.verPessoa));
  if(state.verDia) itens=itens.filter(i=>i.quando===state.verDia || (!i.resultado && !i.quando));
  const ordemDono=n=>TIME.findIndex(p=>p.nome===n);
  itens.sort((a,b)=>(a.quando||'9').localeCompare(b.quando||'9') || ordemDono(a.dono)-ordemDono(b.dono));
  const soPv=!todos && esteiraDe(state.verPessoa)==='pv';
  const modo = todos && state.verDia ? `Daily de ${fd(state.verDia)}: o que o time planejou para o dia.` :
               todos ? 'O time todo na semana, ordenado por dia.' :
               state.verDia ? `${esc(state.verPessoa)} em ${fd(state.verDia)}.` : `Plano completo de ${esc(state.verPessoa)}, bom para a RTC.`;
  $('#view').innerHTML=`<div class="panel">
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,220px))">
      <label class="f" for="verP">Plano de<select id="verP">${ops}</select></label>
      <label class="f" for="verD">Dia<select id="verD">${opsDia}</select></label>
      <div class="actions" style="grid-column:auto"><button class="btn sm" id="hoje" type="button">Daily de hoje</button></div>
    </div>
    <p class="hint">${modo} Somente leitura: quem atualiza é o dono do plano.</p>
    ${tabelaItens(itens,false,todos,soPv)}</div>`;
  $('#verP').addEventListener('change',e=>{state.verPessoa=e.target.value; render();});
  $('#verD').addEventListener('change',e=>{state.verDia=e.target.value; render();});
  $('#hoje').addEventListener('click',()=>{state.verPessoa='Todos'; state.semana=ATUAL; state.verDia=HOJE; montarMes(); render();});
}

/* ---------- GESTOR: ACESSOS ---------- */
const ESTEIRA_NOME = {pv:'Pré-vendas', vd:'Vendas', gs:'Gestor'};
function viewAcessos(){
  const A = D.acessos || [];
  const g = state.senhaGerada;
  const form = (a={}) => `
    <form class="form" id="${a.id?'fAc-'+a.id:'fAcNovo'}" data-id="${a.id||''}">
      <label class="f wide" for="acNome-${a.id||'n'}">Nome<input id="acNome-${a.id||'n'}" value="${esc(a.nome||'')}" placeholder="Ex.: Gabriel Marques"></label>
      <label class="f wide" for="acLogin-${a.id||'n'}">Usuário (e-mail)<input id="acLogin-${a.id||'n'}" value="${esc(a.login||'')}" autocapitalize="none" placeholder="nome@empresa.com"></label>
      <label class="f" for="acEst-${a.id||'n'}">Função<select id="acEst-${a.id||'n'}">${['vd','pv','gs'].map(e=>`<option value="${e}" ${e===(a.esteira||'vd')?'selected':''}>${ESTEIRA_NOME[e]}</option>`).join('')}</select></label>
      <label class="f wide" for="acClint-${a.id||'n'}">E-mail no Clint<input id="acClint-${a.id||'n'}" value="${esc(a.email_clint||'')}" autocapitalize="none" placeholder="o e-mail que aparece como dono no Clint"></label>
      <div class="actions"><button class="btn primary" type="submit">${a.id?'Salvar':'Criar acesso'}</button>${a.id?'<button class="btn ghost" type="button" data-cancel>Cancelar</button>':''}</div>
    </form>`;
  const situacao = a => !a.ativo ? '<span class="pill p-bad">Desativado</span>' : !a.tem_senha ? '<span class="pill p-warn">Sem senha</span>' : a.trocar_senha ? '<span class="pill p-warn">Senha provisória</span>' : '<span class="pill p-good">Ativo</span>';
  const linhas = A.map(a=>`<tr>
      <td><b>${esc(a.nome)}</b><span class="tag">${esc(a.login)}</span></td>
      <td><span class="pill ${a.esteira==='pv'?'p-pv':a.esteira==='vd'?'p-vd':'p-open'}">${ESTEIRA_NOME[a.esteira]}</span></td>
      <td class="txt">${a.email_clint?esc(a.email_clint):'<span class="tag">—</span>'}</td>
      <td>${situacao(a)}<span class="tag">${a.ultimo_acesso?'Último acesso '+new Date(a.ultimo_acesso).toLocaleDateString('pt-BR'):'Nunca entrou'}</span></td>
      <td><div class="result" style="flex-wrap:nowrap">
        <button class="btn sm" data-acedit="${a.id}">Editar</button>
        <button class="btn sm" data-acsenha="${a.id}">${a.tem_senha?'Nova senha':'Gerar senha'}</button>
        ${a.id===D.usuario.id?'':`<button class="btn sm ghost" data-acativo="${a.id}">${a.ativo?'Desativar':'Reativar'}</button>`}
      </div></td></tr>
      ${state.editAcesso===a.id?`<tr class="edit"><td colspan="5">${form(a)}</td></tr>`:''}`).join('');
  $('#view').innerHTML=`
  ${g?`<div class="panel"><h2>Senha provisória</h2><div class="ok-senha">
      <span>${esc(g.aviso)} Ela aparece só agora. Mande para a pessoa:</span>
      <code id="msgSenha">Acesse ${esc(location.origin)} com o usuário ${esc(g.login)} e a senha provisória ${esc(g.senha)}. No primeiro acesso você cria a sua senha.</code>
      <div class="result"><button class="btn sm" id="copiarSenha">Copiar mensagem</button><button class="btn sm ghost" id="fecharSenha">Fechar</button></div></div></div>`:''}
  <div class="panel"><h2>Acessos</h2>
    <p class="hint">Cada pessoa vê só o próprio plano. O e-mail no Clint liga a pessoa aos negócios que ela tem como dona, para a busca de empresas.</p>
    <div class="tbl"><table><thead><tr><th>Pessoa</th><th>Função</th><th>E-mail no Clint</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></div>
  <div class="panel"><h2>Novo acesso</h2>${form()}</div>`;
  const ler = (f) => { const id=f.dataset.id, k=id||'n'; return {id:id?Number(id):null, nome:$('#acNome-'+k).value, login:$('#acLogin-'+k).value, esteira:$('#acEst-'+k).value, email_clint:$('#acClint-'+k).value}; };
  $('#view').querySelectorAll('form').forEach(f=>f.addEventListener('submit',async e=>{
    e.preventDefault(); const j=await api('usuarioSalvar', ler(f)); if(!j) return;
    state.editAcesso=null; state.senhaGerada=j.senha?{aviso:j.aviso, login:j.login, senha:j.senha}:null;
    await carregar(); render(); toast(j.aviso);
  }));
  $('#view').querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click',()=>{state.editAcesso=null; render();}));
  $('#view').querySelectorAll('[data-acedit]').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.acedit); state.editAcesso=state.editAcesso===id?null:id; render();}));
  $('#view').querySelectorAll('[data-acsenha]').forEach(b=>b.addEventListener('click',async()=>{
    const j=await api('usuarioSenha',{id:Number(b.dataset.acsenha)}); if(!j) return;
    state.senhaGerada={aviso:j.aviso, login:j.login, senha:j.senha}; await carregar(); render(); window.scrollTo(0,0);
  }));
  $('#view').querySelectorAll('[data-acativo]').forEach(b=>b.addEventListener('click',()=>salvar('usuarioAtivo',{id:Number(b.dataset.acativo)})));
  if($('#copiarSenha')) $('#copiarSenha').addEventListener('click',()=>{
    const t=$('#msgSenha').textContent;
    navigator.clipboard?.writeText(t).then(()=>toast('Mensagem copiada'),()=>toast('Selecione o texto e copie'));
  });
  if($('#fecharSenha')) $('#fecharSenha').addEventListener('click',()=>{state.senhaGerada=null; render();});
}

/* ---------- GESTOR: DADOS DO CLINT ---------- */
function viewClint(){
  const s=D.saude||{}, base=location.origin+'/api/webhook/clint?token=SEU_WEBHOOK_SECRET';
  const url=(f,g)=>`${base}&funil=${f}&gatilho=${g}`;
  const gat=[['criado','O negócio for criado'],['etapa','Qualquer mudança de etapa'],['ganho','Status mudou para Ganho'],['perdido','Status mudou para Perdido']];
  $('#view').innerHTML=`
  <div class="panel"><h2>Saúde da integração</h2><div class="kpis">
    <div class="kpi"><span class="k">Último evento do Clint</span><span class="v" style="font-size:16px">${s.ultimo_evento?new Date(s.ultimo_evento).toLocaleString('pt-BR'):'Nenhum ainda'}</span><span class="d">webhooks</span></div>
    <div class="kpi"><span class="k">Eventos em 24h</span><span class="v">${s.eventos_24h??0}</span><span class="d">criação, etapa e status</span></div>
    <div class="kpi"><span class="k">Com erro em 7 dias</span><span class="v">${s.erros_7d??0}</span><span class="d">ver tabela clint_eventos</span></div>
    <div class="kpi"><span class="k">Negócios no banco</span><span class="v">${s.negocios_total??0}</span><span class="d">${D.negocios.length} ativos com dono</span></div></div></div>
  <div class="panel"><h2>Importar exportação do Clint</h2>
    <p class="hint">Use para a carga inicial e sempre que quiser reconciliar. Exporte os negócios de cada funil no Clint (CSV) e envie aqui. O funil é detectado pela origem. Importar de novo atualiza sem duplicar.</p>
    <div class="form"><label class="f wide" for="csvs">Arquivos CSV<input id="csvs" type="file" accept=".csv,text/csv" multiple></label>
    <div class="actions"><button class="btn primary" id="importar" type="button">Importar</button></div></div>
    <p class="hint" id="impRes"></p></div>
  <div class="panel"><h2>Webhooks no Clint</h2>
    <p class="hint">Crie estes 4 webhooks (método POST) em cada origem: <b>Pipeline de Vendas</b> (WBC) com <code>funil=wbc</code> e <b>Inserção (Inbound)</b> (FitFeed) com <code>funil=fitfeed</code>. Troque SEU_WEBHOOK_SECRET pela senha definida na Vercel.</p>
    <div class="tbl"><table><thead><tr><th>Gatilho no Clint</th><th>URL (WBC)</th></tr></thead><tbody>
      ${gat.map(([g,l])=>`<tr><td class="nowrap">${l}</td><td><code style="word-break:break-all;font-size:12px">${esc(url('wbc',g))}</code></td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#importar').addEventListener('click',async()=>{
    const fs=[...$('#csvs').files]; if(!fs.length) return toast('Escolha pelo menos um arquivo');
    const b=$('#importar'); b.disabled=true; b.textContent='Importando…';
    const res=[];
    for(const f of fs){
      const csv=await f.text();
      const j=await api('importar',{csv});
      res.push(j?`${f.name}: ${j.gravados} negócios${j.semFunil?` (${j.semFunil} sem funil identificado)`:''}`:`${f.name}: não importado`);
    }
    await carregar(); render(); $('#impRes') && ($('#impRes').textContent=res.join(' · ')); toast('Importação concluída');
  });
}

/* ---------- conta ---------- */
function viewConta(obrigatorio){
  $('#view').innerHTML=`<div class="panel" style="max-width:560px">
    <h2>${obrigatorio?'Crie a sua senha':'Trocar senha'}</h2>
    <p class="hint">${obrigatorio?'Você entrou com uma senha provisória. Antes de continuar, crie uma só sua. ':''}Pelo menos 8 caracteres, com letras e números.</p>
    <form class="form" id="fSenha" style="grid-template-columns:minmax(0,1fr)">
      <label class="f" for="sAtual">${obrigatorio?'Senha provisória':'Senha atual'}<input id="sAtual" type="password" autocomplete="current-password"></label>
      <label class="f" for="sNova">Nova senha<input id="sNova" type="password" autocomplete="new-password"></label>
      <label class="f" for="sConf">Repita a nova senha<input id="sConf" type="password" autocomplete="new-password"></label>
      <div class="actions"><button class="btn primary" type="submit">Salvar senha</button></div>
    </form></div>`;
  $('#fSenha').addEventListener('submit',async e=>{e.preventDefault();
    const j=await api('trocarSenha',{atual:$('#sAtual').value, nova:$('#sNova').value, confirmacao:$('#sConf').value});
    if(j){ await carregar(); state.tab=null; render(); toast('Senha salva'); }
  });
}

function viewComo(){
  $('#view').innerHTML=`<div class="panel how"><h2>Como funciona</h2><ol>
    <li><b>Cada um entra e vê só o próprio plano.</b> O gestor vê a visão geral e o plano de cada pessoa, sem editar.</li>
    <li><b>Cada compromisso tem a semana carimbada.</b> Os números contam por semana, então nada da semana anterior entra de novo.</li>
    <li><b>Três campos tornam o plano acionável:</b> em que pé está, a ação desta semana e o dia dessa ação. A previsão de fechamento (ou a data da reunião, na pré-vendas) fica ao lado, como forecast.</li>
    <li><b>Durante a semana, Atualizar.</b> Mudou o status ou a ação, edite a linha. O item continua o mesmo.</li>
    <li><b>Sexta é fechamento.</b> Ganhou, Perdeu ou Rolar. Rolar leva o status junto para a próxima semana.</li>
    <li><b>Pré-vendas alimenta vendas.</b> Reunião realizada com vendedor escolhido vira item no plano dele, marcado para definir o próximo passo.</li>
    <li><b>Fora do plano é um botão.</b> Entra no realizado, fica fora da assertividade.</li>
    <li><b>Plano do mês é uma fotografia.</b> Na primeira semana, cada pessoa lista o funil do mês com a semana prevista e congela. Toda semana, o que estava previsto aparece no plano semanal para puxar com um clique. No fim do mês, "O que aconteceu" mostra o que converteu, perdeu, atrasou e o que veio de fora da foto.</li>
    <li><b>A busca de empresas vem do Clint.</b> Aparecem os negócios ativos em que você é dono. Empresa fora do Clint também pode entrar no plano.</li></ol></div>`;
}

/* ---------- casca ---------- */
const IC = {
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M15 8l2 2"/>',
  db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const NAV_MEMBRO=()=>[['Plano',[['plano','Meu plano','list',viewPlano],['mes','Plano do mês','cal',viewMes],['fechamento','Fechamento de sexta','check',viewFechamento]]],
  ['Resultados',[['meudash','Meu dash','grid',viewMeuDash]]],['Ajuda e conta',[['como','Como funciona','help',viewComo],['conta','Minha senha','user',()=>viewConta(false)]]]];
const NAV_GESTOR=()=>[['Acompanhamento',[['time','Planos do time','users',viewTime],['mesgs','Planos do mês','cal',viewMesGestor]]],
  ['Resultados',[['geral','Visão geral','grid',viewGeral]]],
  ['Administração',[['acessos','Acessos','key',viewAcessos],['clint','Dados do Clint','db',viewClint]]],
  ['Ajuda e conta',[['como','Como funciona','help',viewComo],['conta','Minha senha','user',()=>viewConta(false)]]]];
function badge(id){
  const eu=me(), w=state.semana;
  if(id==='plano'){ const n=ITENS.filter(i=>i.dono===eu&&i.semana===w&&semPasso(i)).length; return n?`<span class="badge red">${n}</span>`:''; }
  if(id==='fechamento'){ const n=ITENS.filter(i=>i.dono===eu&&i.semana===w&&!i.resultado).length; return n?`<span class="badge">${n}</span>`:''; }
  if(id==='mes'){ return !FOTOS[eu]?.congelado?'<span class="badge">!</span>':''; }
  if(id==='time'){ const n=ITENS.filter(i=>i.semana===w&&semPasso(i)).length; return n?`<span class="badge red">${n}</span>`:''; }
  if(id==='mesgs'){ const n=membros().filter(p=>!FOTOS[p.nome]?.congelado).length; return n?`<span class="badge">${n}</span>`:''; }
  if(id==='acessos'){ const n=(D.acessos||[]).filter(a=>a.ativo&&!a.tem_senha).length; return n?`<span class="badge">${n}</span>`:''; }
  return '';
}
function montarCasca(){
  $('#raiz').innerHTML=`
  <div class="shell">
    <aside class="side">
      <div class="mark">Wellness Builders Club<sup>™</sup></div>
      <div class="plat">Plano de ação</div>
      <nav class="navwrap" id="nav" aria-label="Seções"></nav>
      <div class="grow"></div>
      <div class="userbox">
        <span class="avatar" id="av"></span>
        <div class="info"><div class="nm" id="uNome"></div><div class="rl" id="uPapel"></div></div>
        <button class="iconbtn" id="tema" aria-label="Alternar tema claro e escuro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
        <button class="iconbtn" id="sair" aria-label="Sair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg></button>
      </div>
    </aside>
    <main class="main"><div class="inner">
      <div class="pagehead">
        <div><div class="eyebrow" id="pgEyebrow"></div><h1 id="pgTitle"></h1><p class="sub" id="pgSub"></p></div>
        <div class="ctx" id="ctxSemana"><label class="f" for="semana" style="width:230px">Semana<select id="semana"></select></label></div>
      </div>
      <section id="view"></section>
    </div></main>
  </div>`;
  $('#semana').addEventListener('change',e=>{state.semana=e.target.value; state.editing=null; state.confirmar=false; montarMes(); render();});
  $('#sair').addEventListener('click',async()=>{ await api('sair'); location.href='/login'; });
  $('#tema').addEventListener('click',()=>{
    const r=document.documentElement, novo=r.getAttribute('data-theme')==='light'?'dark':'light';
    r.setAttribute('data-theme',novo); try{localStorage.setItem('wbc-plano-tema',novo);}catch(e){}
  });
}
function render(){
  const u=D.usuario, gestor=souGestor(), p=pessoa(u.nome);
  $('#av').textContent=u.nome.slice(0,1); $('#av').className='avatar av-'+(u.esteira||'vd');
  $('#uNome').textContent=u.nome; $('#uPapel').textContent=gestor?'Head Comercial':ESTEIRA_NOME[u.esteira];
  $('#semana').innerHTML=SEMANAS.map(s=>`<option value="${s.id}" ${s.id===state.semana?'selected':''}>${s.label}${s.id===ATUAL?' (atual)':''}</option>`).join('');
  if(u.trocarSenha){
    $('#nav').innerHTML=''; $('#pgEyebrow').textContent='Primeiro acesso'; $('#pgTitle').textContent='Sua senha'; $('#pgSub').textContent='';
    $('#ctxSemana').hidden=true; viewConta(true); return;
  }
  const nav=gestor?NAV_GESTOR():NAV_MEMBRO(), flat=nav.flatMap(g=>g[1].map(x=>[...x,g[0]]));
  if(!flat.some(t=>t[0]===state.tab)) state.tab=flat[0][0];
  const cur=flat.find(t=>t[0]===state.tab);
  $('#nav').innerHTML=nav.map(([g,its])=>`<div class="navgroup"><h3>${g}</h3>${its.map(([id,l,ic])=>
    `<button class="nav" data-tab="${id}" ${id===state.tab?'aria-current="page"':''}>${svg(ic)}<span class="lbl">${l}</span>${badge(id)}</button>`).join('')}</div>`).join('');
  $('#nav').querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab; state.editing=null; state.confirmar=false; state.senhaGerada=null; render(); window.scrollTo(0,0);}));
  $('#pgEyebrow').textContent=cur[4]; $('#pgTitle').textContent=cur[1];
  $('#pgSub').textContent = gestor ? 'Pré-vendas e vendas na mesma esteira.' : `${ESTEIRA_NOME[p.esteira]} · só você vê e edita este plano.`;
  $('#ctxSemana').hidden = ['acessos','clint','como','conta'].includes(state.tab);
  cur[3]();
}

/* ---------- início ---------- */
(async () => {
  try {
    await carregar();
    montarCasca();
    render();
  } catch (e) {
    $('#raiz').innerHTML=`<div class="erro-tela"><h1 style="font-size:28px">Não foi possível carregar</h1><p>${esc(e.message)}</p><p><a href="/" style="color:inherit">Tentar de novo</a></p></div>`;
  }
})();
})();
