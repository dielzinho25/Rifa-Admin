(function(){'use strict';
let PRECO=20,TOTAL=100,VENDAS_ABERTAS=true,configRifa={},configAfiliados={ativo:true,valorPorNumero:0.20,minimoSaque:10};let selecionados=[],ultimosNumeros=[],reservaAtualId='',mapaNumeros={},pagamentos={};let codigoIndicacaoAtivo='',cpfIndicadorAtivo='',nomeIndicadorAtivo='';
const $=id=>document.getElementById(id), moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), digs=v=>String(v||'').replace(/\D/g,''), esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function codigo(){return 'RIFA-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();}
function resumo(){selecionados.sort((a,b)=>a-b);$('quantidade').textContent=selecionados.length;$('numerosEscolhidos').textContent=selecionados.length?selecionados.join(', '):'Nenhum';$('total').textContent=moeda(selecionados.length*PRECO);}
function atualizarEstatisticas(){let reservados=0,confirmados=0;Object.values(mapaNumeros||{}).forEach(x=>{if(x&&x.status==='reservado')reservados++;else if(x&&x.status==='confirmado')confirmados++;});const livres=Math.max(0,TOTAL-reservados-confirmados);if($('pubLivres'))$('pubLivres').textContent=String(livres);if($('pubReservados'))$('pubReservados').textContent=String(reservados);if($('pubConfirmados'))$('pubConfirmados').textContent=String(confirmados);if($('barraProgresso'))$('barraProgresso').style.width=Math.min(100,confirmados/TOTAL*100)+'%';if($('textoProgresso'))$('textoProgresso').textContent=confirmados+' de '+TOTAL+' números confirmados.';}
function desenhar(){const grade=$('gradeNumeros');grade.innerHTML='';for(let n=1;n<=TOTAL;n++){const info=mapaNumeros[n]||{status:'livre'},b=document.createElement('button');b.type='button';b.className='numero';b.textContent=String(n).padStart(2,'0');if(info.status==='confirmado')b.className+=' confirmado';else if(info.status==='reservado')b.className+=' reservado';else if(selecionados.includes(n))b.className+=' selecionado';b.disabled=info.status==='reservado'||info.status==='confirmado';b.onclick=()=>{const i=selecionados.indexOf(n);i>=0?selecionados.splice(i,1):selecionados.push(n);desenhar();resumo();};grade.appendChild(b);}atualizarEstatisticas(); }
function carregarPagamento(qtd,valor){const link=(pagamentos.links||{})[String(qtd)]||'',pix=pagamentos.pix||{},bp=$('btnPagarMercadoPago'),box=$('pixBox'),av=$('avisoPagamento');if(link){bp.href=link;bp.className='botao pagamento';}else bp.className='botao pagamento oculto';if(pix.chave){$('pixChave').textContent=pix.chave;$('pixRecebedor').textContent=(pix.nome?'Recebedor: '+pix.nome+' • ':'')+'Valor: '+moeda(valor);box.className='pix-box';}else box.className='pix-box oculto';if(!link&&!pix.chave){av.textContent='O administrador ainda não cadastrou uma forma de pagamento.';av.className='aviso-pagamento';}else av.className='aviso-pagamento oculto';}
async function reservar(e){
  e.preventDefault();
  if(!VENDAS_ABERTAS)return alert('As vendas desta rifa estão fechadas no momento.');
  if(!selecionados.length)return alert('Escolha pelo menos um número.');
  const u=auth.currentUser;
  if(!u)return alert('Aguarde a conexão com o Firebase.');
  const nome=$('nome').value.trim(),telefone=digs($('telefone').value),cpf=digs($('cpf').value),email=$('email').value.trim();
  if(nome.length<3)return alert('Digite seu nome completo.');
  if(telefone.length<10)return alert('Digite um telefone válido.');
  if(cpf.length!==11)return alert('Digite um CPF com 11 números.');
  if(!$('aceite').checked)return alert('Confirme os dados.');
  const nums=[...selecionados].sort((a,b)=>a-b),rid=codigo(),agora=Date.now();
  let indicadorCodigo=codigoIndicacaoAtivo||'';
  let indicadorCpf=cpfIndicadorAtivo||'';
  let indicadorNome=nomeIndicadorAtivo||'';
  if(indicadorCpf===cpf){indicadorCodigo='';indicadorCpf='';indicadorNome='';}
  const r={reservaId:rid,ownerUid:u.uid,nome,telefone,cpf,email,numeros:nums,valor:nums.length*PRECO,status:'processando',criadoEm:agora,indicadorCodigo,indicadorCpf,indicadorNome};
  $('btnReservar').disabled=true;$('btnReservar').textContent='Salvando no Firebase…';
  localStorage.setItem('rifaReservaPendente',JSON.stringify(r));
  try{
    // Primeiro salva os dados da reserva no Firebase. Depois bloqueia os números.
    await db.ref('rifa/reservas/'+rid).set(r);
    const tx=await db.ref('rifa/numeros').transaction(atual=>{
      atual=atual||{};
      for(const n of nums){if(atual[n]&&atual[n].status!=='livre')return;}
      for(const n of nums)atual[n]={status:'reservado',reservaId:rid,ownerUid:u.uid,atualizadoEm:agora};
      return atual;
    },undefined,false);
    if(!tx.committed){
      await db.ref('rifa/reservas/'+rid).remove().catch(()=>{});
      throw new Error('Um dos números acabou de ser reservado por outra pessoa. Escolha outro número.');
    }
    const resumoCpf={reservaId:rid,nome,numeros:nums,valor:r.valor,status:'aguardando_confirmacao',criadoEm:agora,indicadorCodigo,atualizadoEm:firebase.database.ServerValue.TIMESTAMP};
    const updatesCpf={};updatesCpf['rifa/reservas/'+rid+'/status']='aguardando_confirmacao';updatesCpf['rifa/reservas/'+rid+'/salvoEm']=firebase.database.ServerValue.TIMESTAMP;updatesCpf['rifa/reservasPorCpf/'+cpf+'/'+rid]=resumoCpf;await db.ref().update(updatesCpf);
    localStorage.removeItem('rifaReservaPendente');
    ultimosNumeros=[...nums];reservaAtualId=rid;
    $('codigoReserva').textContent=rid;$('numerosReserva').textContent=nums.join(', ');$('valorReserva').textContent=moeda(r.valor);$('statusReserva').textContent='Aguardando confirmação';$('nomePagador').value='';$('btnInformarPagamento').disabled=false;$('btnInformarPagamento').textContent='✅ Já fiz o pagamento';
    carregarPagamento(nums.length,r.valor);$('sucessoBox').className='card sucesso';selecionados=[];$('formRifa').reset();resumo();await minhasReservas();$('sucessoBox').scrollIntoView({behavior:'smooth'});
  }catch(err){
    alert((err&&err.message)||'Não foi possível reservar. Verifique a internet e tente novamente.');
  }finally{$('btnReservar').disabled=false;$('btnReservar').textContent='Reservar números';}
}
async function recuperarReservaPendente(){
  const bruto=localStorage.getItem('rifaReservaPendente');
  if(!bruto||!auth.currentUser)return;
  try{
    const r=JSON.parse(bruto),snap=await db.ref('rifa/reservas/'+r.reservaId).once('value');
    if(snap.exists())localStorage.removeItem('rifaReservaPendente');
  }catch(_){ }
}
async function informarPagamento(){if(!reservaAtualId)return alert('Nenhuma reserva ativa.');if(!confirm('Você realmente concluiu o pagamento? O administrador ainda precisará conferir.'))return;try{const rs=await db.ref('rifa/reservas/'+reservaAtualId).once('value'),rv=rs.val()||{},up={};up['rifa/reservas/'+reservaAtualId+'/status']='pagamento_informado';up['rifa/reservas/'+reservaAtualId+'/pagamentoInformadoEm']=Date.now();up['rifa/reservas/'+reservaAtualId+'/nomePagador']=$('nomePagador').value.trim();if(rv.cpf)up['rifa/reservasPorCpf/'+rv.cpf+'/'+reservaAtualId+'/status']='pagamento_informado';await db.ref().update(up);$('statusReserva').textContent='Pagamento informado';$('btnInformarPagamento').disabled=true;$('btnInformarPagamento').textContent='✓ Pagamento informado';await minhasReservas();alert('Informação enviada ao administrador.');}catch(e){alert('Não foi possível informar o pagamento: '+e.message);}}
async function minhasReservas(){const box=$('minhasReservas'),u=auth.currentUser;if(!box)return;if(!u){box.innerHTML='<p class="texto-apoio">Conectando…</p>';return;}try{const snap=await db.ref('rifa/reservas').orderByChild('ownerUid').equalTo(u.uid).once('value'),lista=[];snap.forEach(c=>lista.push(c.val()));lista.sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));if(!lista.length){box.innerHTML='<p class="texto-apoio">Nenhuma reserva feita neste aparelho.</p>';return;}box.innerHTML=lista.map(cardReserva).join('');}catch(e){box.innerHTML='<p class="aviso-pagamento">Não foi possível carregar suas reservas.</p>';}}
function statusNome(s){return s==='aguardando_confirmacao'?'Aguardando confirmação':s==='pagamento_informado'?'Pagamento informado':s==='confirmado'?'Confirmada':s==='cancelado'?'Cancelada':s;}
function cardReserva(r){return '<article class="reserva-card"><div class="reserva-topo"><strong>'+esc(r.reservaId)+'</strong><span class="status-tag '+esc(r.status)+'">'+esc(statusNome(r.status))+'</span></div><p><b>Números:</b> '+esc((r.numeros||[]).join(', '))+'</p><p><b>Total:</b> '+moeda(r.valor)+'</p><p><b>Data:</b> '+new Date(r.criadoEm||0).toLocaleString('pt-BR')+'</p></article>'; }
async function buscarReservasCpf(){const cpf=digs($('consultaCpf').value),box=$('reservasCpf'),msg=$('mensagemCpf');if(cpf.length!==11){msg.textContent='Digite um CPF com 11 números.';msg.className='aviso';box.innerHTML='';return;}msg.textContent='Buscando reservas no Firebase…';msg.className='aviso';box.innerHTML='';try{const snap=await db.ref('rifa/reservasPorCpf/'+cpf).once('value'),lista=[];snap.forEach(c=>lista.push(c.val()));lista.sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));if(!lista.length){msg.textContent='Nenhuma reserva encontrada para este CPF.';msg.className='aviso';return;}msg.className='aviso oculto';box.innerHTML=lista.map(cardReserva).join('');}catch(e){msg.textContent='Não foi possível buscar as reservas: '+e.message;msg.className='aviso';}}

function formatarCpfInput(el){let v=digs(el.value).slice(0,11);v=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');el.value=v;}
function gerarCodigoAfiliado(nome,cpf){const p=String(nome||'INDICA').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z]/g,'').slice(0,6).toUpperCase()||'INDICA';return p+cpf.slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();}
function linkIndicacao(codigo){
  let base=String(configRifa.urlPublica||'').trim();
  if(!base){
    if(location.protocol==='http:'||location.protocol==='https:')base=location.origin+location.pathname.replace(/[^/]*$/,'');
    else return '';
  }
  const u=new URL(base,location.href);u.search='';u.hash='';u.searchParams.set('ref',codigo);return u.toString();
}
async function capturarIndicacao(){
  const param=(new URLSearchParams(location.search).get('ref')||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  if(param){localStorage.setItem('rifaIndicadorCodigo',param);localStorage.setItem('rifaIndicadorCapturadoEm',String(Date.now()));}
  const codigo=(param||localStorage.getItem('rifaIndicadorCodigo')||'').trim().toUpperCase();
  codigoIndicacaoAtivo='';cpfIndicadorAtivo='';nomeIndicadorAtivo='';
  if(!codigo)return;
  try{
    const cs=await db.ref('rifa/codigosAfiliados/'+codigo).once('value');
    const cpf=String(cs.val()||'');
    if(!cpf){localStorage.removeItem('rifaIndicadorCodigo');return;}
    const as=await db.ref('rifa/afiliadosPorCpf/'+cpf).once('value'),a=as.val()||{};
    codigoIndicacaoAtivo=codigo;cpfIndicadorAtivo=cpf;nomeIndicadorAtivo=a.nome||'';
    let aviso=document.getElementById('avisoIndicacaoAtiva');
    if(!aviso){aviso=document.createElement('div');aviso.id='avisoIndicacaoAtiva';aviso.className='aviso';const alvo=document.querySelector('main')||document.body;alvo.insertBefore(aviso,alvo.firstChild);}
    aviso.textContent='🤝 Indicação ativa'+(nomeIndicadorAtivo?' de '+nomeIndicadorAtivo:'')+'. A comissão será liberada somente após a confirmação do pagamento.';
  }catch(e){console.warn('Não foi possível validar a indicação:',e);}
}
async function consultarAfiliado(){const cpf=digs($('afCpf').value),msg=$('afMensagem');$('afPainel').classList.add('oculto');if(cpf.length!==11){msg.textContent='Digite um CPF com 11 números.';msg.className='status-operacao erro';return;}msg.textContent='Consultando cadastro…';msg.className='status-operacao';try{const [a,c]=await Promise.all([db.ref('rifa/afiliadosPorCpf/'+cpf).once('value'),db.ref('rifa/comissoes').orderByChild('afiliadoCpf').equalTo(cpf).once('value')]);if(!a.exists()){msg.textContent='Nenhum cadastro encontrado. Preencha nome, telefone e Pix para criar.';msg.className='status-operacao';return;}const d=a.val()||{};$('afNome').value=d.nome||'';$('afTelefone').value=d.telefone||'';$('afPix').value=d.pix||'';$('afSaldo').textContent=moeda(d.saldoDisponivel||0);$('afTotalGanhos').textContent=moeda(d.totalGanhos||0);$('afIndicacoes').textContent=String(d.totalIndicacoes||0);$('afTotalPago').textContent=moeda(d.totalPago||0);$('afLink').value=linkIndicacao(d.codigo||'');if(!$('afLink').value)msg.textContent='Cadastre a URL pública da rifa no ADM para gerar um link compartilhável.';const lista=[];c.forEach(x=>lista.push(x.val()));lista.sort((x,y)=>(y.confirmadoEm||0)-(x.confirmadoEm||0));$('afListaComissoes').innerHTML=lista.length?lista.map(x=>'<article class="reserva-card"><strong>'+esc(x.reservaId||'')+'</strong><p><b>Quantidade:</b> '+Number(x.quantidade||0)+' número(s)</p><p><b>Comissão:</b> '+moeda(x.valor||0)+'</p><p><b>Status:</b> '+esc(x.status==='paga'?'Paga':'Disponível')+'</p></article>').join(''):'<p class="texto-apoio">Nenhuma comissão confirmada.</p>';$('afPainel').classList.remove('oculto');msg.textContent='Cadastro encontrado. Os dados abaixo são vinculados ao CPF informado.';msg.className='status-operacao sucesso';}catch(e){msg.textContent='Erro ao consultar: '+e.message;msg.className='status-operacao erro';}}
async function salvarAfiliado(){const cpf=digs($('afCpf').value),nome=$('afNome').value.trim(),telefone=digs($('afTelefone').value),pix=$('afPix').value.trim(),msg=$('afMensagem');if(cpf.length!==11)return alert('Digite um CPF com 11 números.');if(nome.length<3)return alert('Digite o nome completo.');if(telefone.length<10)return alert('Digite um telefone válido.');if(pix.length<4)return alert('Digite a chave Pix.');try{msg.textContent='Salvando cadastro…';const ref=db.ref('rifa/afiliadosPorCpf/'+cpf),snap=await ref.once('value'),ant=snap.val()||{};let codigo=ant.codigo||gerarCodigoAfiliado(nome,cpf);if(!ant.codigo){let tentativa=0;while((await db.ref('rifa/codigosAfiliados/'+codigo).once('value')).exists()&&tentativa++<5)codigo=gerarCodigoAfiliado(nome,cpf);}const updates={};updates['rifa/afiliadosPorCpf/'+cpf]=Object.assign({},ant,{cpf,nome,telefone,pix,codigo,saldoDisponivel:Number(ant.saldoDisponivel||0),totalGanhos:Number(ant.totalGanhos||0),totalPago:Number(ant.totalPago||0),totalIndicacoes:Number(ant.totalIndicacoes||0),atualizadoEm:firebase.database.ServerValue.TIMESTAMP,criadoEm:ant.criadoEm||firebase.database.ServerValue.TIMESTAMP});updates['rifa/codigosAfiliados/'+codigo]=cpf;await db.ref().update(updates);await consultarAfiliado();}catch(e){msg.textContent='Erro ao salvar: '+e.message;msg.className='status-operacao erro';}}
async function copiarLinkAfiliado(){const link=$('afLink').value;if(!link)return;try{await navigator.clipboard.writeText(link);alert('Link de indicação copiado.');}catch(_){prompt('Copie o link:',link);}}
function repetir(){const nums=selecionados.length?[...selecionados]:[...ultimosNumeros],msg=$('mensagemRepetir');if(!nums.length){msg.textContent='Nenhum número selecionado.';return;}nums.sort((a,b)=>a-b);const texto='Números selecionados: '+nums.join(', ')+'.';msg.textContent=texto;if('speechSynthesis'in window){speechSynthesis.cancel();const f=new SpeechSynthesisUtterance(texto);f.lang='pt-BR';f.rate=.85;speechSynthesis.speak(f);}}
function copiarPix(){const chave=$('pixChave').textContent.trim();if(!chave)return;if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(chave).then(()=>alert('Chave Pix copiada.')).catch(()=>prompt('Copie a chave:',chave));else prompt('Copie a chave:',chave);}
function aplicarConfigRifa(c){
  configRifa=Object.assign({nomeRifa:'Rifa Online',precoNumero:20,quantidadeNumeros:100,premio:'',descricao:'',dataSorteio:'',horaSorteio:'',banner:'',regulamento:'',vendasAbertas:true},c||{});
  PRECO=Number(configRifa.precoNumero||20);TOTAL=Math.max(1,Math.min(1000,Number(configRifa.quantidadeNumeros||100)));VENDAS_ABERTAS=configRifa.vendasAbertas!==false;
  document.title=(configRifa.nomeRifa||'Rifa Online')+' V15.10';
  $('nomeRifaTitulo').textContent=configRifa.nomeRifa||'Escolha seus números';
  $('quantidadeCabecalho').textContent=String(TOTAL);
  $('precoCabecalho').textContent=moeda(PRECO);
  $('statusVendas').textContent=VENDAS_ABERTAS?'🟢 Vendas abertas':'🔴 Vendas temporariamente fechadas';
  $('statusVendas').className='texto-apoio '+(VENDAS_ABERTAS?'status-aberto':'status-fechado');
  $('btnReservar').disabled=!VENDAS_ABERTAS;$('btnReservar').textContent=VENDAS_ABERTAS?'Reservar números':'Vendas fechadas';
  $('formularioReservaBox').classList.toggle('vendas-fechadas',!VENDAS_ABERTAS);
  const temPremio=!!(configRifa.premio||configRifa.descricao||configRifa.banner||configRifa.dataSorteio);
  $('premioBox').classList.toggle('oculto',!temPremio);$('nomePremio').textContent=configRifa.premio||'Prêmio da rifa';$('descricaoPremio').textContent=configRifa.descricao||'';
  const data=configRifa.dataSorteio?configRifa.dataSorteio.split('-').reverse().join('/') : '';$('dataSorteioTexto').textContent=data?('📅 Sorteio: '+data+(configRifa.horaSorteio?' às '+configRifa.horaSorteio:'')):'';
  if(configRifa.banner){$('bannerPremio').src=configRifa.banner;$('bannerPremio').classList.remove('oculto');}else{$('bannerPremio').removeAttribute('src');$('bannerPremio').classList.add('oculto');}
  $('regulamentoBox').classList.toggle('oculto',!configRifa.regulamento);$('regulamentoTexto').textContent=configRifa.regulamento||'';
  selecionados=selecionados.filter(n=>n<=TOTAL);desenhar();resumo();
}

let recarregouPorAtualizacao=false;
async function registrarServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('service-worker.js?v=15.7',{updateViaCache:'none'});
    await reg.update().catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(recarregouPorAtualizacao)return;
      recarregouPorAtualizacao=true;
      location.reload();
    });
    setInterval(()=>reg.update().catch(()=>{}),5*60*1000);
  }catch(_){ }
}

function dataLocalChave(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function idVisitanteLocal(){
  let id=localStorage.getItem('rifaVisitanteId');
  if(!id){
    id='v_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);
    localStorage.setItem('rifaVisitanteId',id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
}
async function registrarVisualizacao(){
  try{
    const hoje=dataLocalChave(),id=idVisitanteLocal();
    await Promise.all([
      db.ref('rifa/visitas/total').transaction(v=>Number(v||0)+1),
      db.ref('rifa/visitas/porDia/'+hoje).transaction(v=>Number(v||0)+1),
      db.ref('rifa/visitas/visitantes/'+id).transaction(v=>v||{
        primeiraVisita:firebase.database.ServerValue.TIMESTAMP,
        origem:'site-cliente'
      })
    ]);
  }catch(e){ console.warn('Não foi possível registrar a visualização:',e.message); }
}

async function init(){ if('serviceWorker' in navigator)registrarServiceWorker();$('formRifa').onsubmit=reservar;$('btnInformarPagamento').onclick=informarPagamento;$('btnRepetirNumeros').onclick=repetir;$('btnCopiarPix').onclick=copiarPix;$('btnAtualizar').onclick=()=>location.reload();if($('btnMinhasReservas'))$('btnMinhasReservas').onclick=minhasReservas;$('btnBuscarCpf').onclick=buscarReservasCpf;$('btnConsultarAfiliado').onclick=consultarAfiliado;$('btnSalvarAfiliado').onclick=salvarAfiliado;$('btnCopiarLinkAfiliado').onclick=copiarLinkAfiliado;$('btnNovaReserva').onclick=()=>{$('sucessoBox').className='card sucesso oculto';reservaAtualId='';scrollTo(0,0);};$('telefone').oninput=e=>{let v=digs(e.target.value).slice(0,11);if(v.length>6)v='('+v.slice(0,2)+') '+v.slice(2,7)+'-'+v.slice(7);else if(v.length>2)v='('+v.slice(0,2)+') '+v.slice(2);e.target.value=v;};$('cpf').oninput=e=>{let v=digs(e.target.value).slice(0,11);v=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');e.target.value=v;};$('afCpf').oninput=e=>formatarCpfInput(e.target);$('consultaCpf').oninput=e=>{let v=digs(e.target.value).slice(0,11);v=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');e.target.value=v;};$('consultaCpf').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();buscarReservasCpf();}};try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);if(!auth.currentUser)await auth.signInAnonymously();await capturarIndicacao();await registrarVisualizacao();await recuperarReservaPendente();$('mensagemGrade').className='aviso oculto';db.ref('rifa/configPublica/rifa').on('value',s=>aplicarConfigRifa(s.val()||{}));db.ref('rifa/numeros').on('value',s=>{mapaNumeros=s.val()||{};selecionados=selecionados.filter(n=>!mapaNumeros[n]||mapaNumeros[n].status==='livre');desenhar();resumo();});db.ref('rifa/configPublica/pagamentos').on('value',s=>pagamentos=s.val()||{});db.ref('rifa/configPublica/afiliados').on('value',s=>configAfiliados=Object.assign({ativo:true,valorPorNumero:0.20,minimoSaque:10},s.val()||{}));db.ref('rifa/estatisticasPublicas').on('value',s=>{const e=s.val()||{};if($('pubParticipantes'))$('pubParticipantes').textContent=String(Number(e.participantes||0));if($('pubArrecadado'))$('pubArrecadado').textContent=moeda(Number(e.arrecadado||0));});await minhasReservas();}catch(e){$('mensagemGrade').textContent='Erro ao conectar: '+e.message;$('mensagemGrade').className='aviso';}}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();})();