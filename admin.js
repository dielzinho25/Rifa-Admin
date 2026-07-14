(function(){
'use strict';
let reservasCache={}, numerosCache={}, linksCache={}, usuarioAtual=null, configRifa={precoNumero:20,quantidadeNumeros:100,vendasAbertas:true}, ouvindo=false, primeiraLeituraReservas=true, resumoAnterior={total:0,pagamentos:0};
const $=id=>document.getElementById(id), moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const secoes=['barraAdmin','perfilAdmin','dashboard','novosAdmins','configRifa','configPagamento','configPix','sorteioAdmin','painel'];
function mensagem(t,erro=false){const el=$('adminMensagem');el.textContent=t||'';el.style.color=erro?'#b00020':'';}
async function adminRef(uid){
  if(!uid)return false;
  try{
    if(auth.currentUser)await auth.currentUser.getIdToken(true);
    const s=await db.ref('admins/'+uid).once('value');
    return s.val()===true;
  }catch(e){
    console.error('Falha ao verificar administrador:',e);
    return false;
  }
}
function proteger(msg,frase){if(!confirm(msg+'\n\nEsta ação não poderá ser desfeita.'))return false;if(frase&&prompt('Digite exatamente: '+frase)!==frase){alert('Confirmação incorreta.');return false;}return true;}
function statusNome(s){return s==='aguardando_confirmacao'?'reservado':s==='pagamento_informado'?'pagamento informado':s==='confirmado'?'confirmado':'cancelado';}
function trocarAba(tipo){const cadastro=tipo==='cadastro';$('loginForm').classList.toggle('oculto',cadastro);$('cadastroForm').classList.toggle('oculto',!cadastro);$('abaLogin').classList.toggle('ativa',!cadastro);$('abaCadastro').classList.toggle('ativa',cadastro);mensagem('');}
function esconderTudo(){secoes.forEach(id=>$(id).classList.add('oculto'));$('acessoBox').classList.add('oculto');$('aguardandoBox').classList.add('oculto');}
function mostrarAcesso(){esconderTudo();$('acessoBox').classList.remove('oculto');}
function mostrarAguardando(){esconderTudo();$('aguardandoBox').classList.remove('oculto');}
async function entrar(){const email=$('adminEmail').value.trim(),senha=$('adminSenha').value;if(!email||!senha)return mensagem('Preencha e-mail e senha.',true);try{mensagem('Entrando...');await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);await auth.signInWithEmailAndPassword(email,senha);}catch(e){mensagem(traduzErro(e),true);}}
async function cadastrar(){const nome=$('cadNome').value.trim(),telefone=$('cadTelefone').value.replace(/\D/g,''),email=$('cadEmail').value.trim(),senha=$('cadSenha').value,conf=$('cadConfirmarSenha').value;if(nome.length<3)return mensagem('Digite o nome completo.',true);if(telefone.length<10)return mensagem('Digite um telefone válido.',true);if(!email)return mensagem('Digite o e-mail.',true);if(senha.length<6)return mensagem('A senha precisa ter pelo menos 6 caracteres.',true);if(senha!==conf)return mensagem('As senhas não são iguais.',true);try{mensagem('Criando cadastro...');await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);const c=await auth.createUserWithEmailAndPassword(email,senha);await c.user.updateProfile({displayName:nome});const autorizado=await adminRef(c.user.uid);await db.ref('rifa/administradores/'+c.user.uid).set({uid:c.user.uid,nome,telefone,email,foto:'',status:autorizado?'ativo':'pendente',criadoEm:firebase.database.ServerValue.TIMESTAMP,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP,online:true});if(autorizado)await abrirPainel(c.user);else mostrarAguardando();}catch(e){mensagem(traduzErro(e),true);}}
function traduzErro(e){const c=e&&e.code||'';if(c.includes('email-already-in-use'))return 'Este e-mail já possui cadastro.';if(c.includes('wrong-password')||c.includes('invalid-credential'))return 'E-mail ou senha incorretos.';if(c.includes('user-not-found'))return 'Usuário não encontrado.';if(c.includes('invalid-email'))return 'E-mail inválido.';if(c.includes('weak-password'))return 'A senha precisa ter pelo menos 6 caracteres.';if(c.includes('too-many-requests'))return 'Muitas tentativas. Aguarde e tente novamente.';return e.message||'Não foi possível concluir.';}
async function esqueciSenha(){const email=$('adminEmail').value.trim()||prompt('Digite o e-mail cadastrado:');if(!email)return;try{await auth.sendPasswordResetEmail(email);alert('O link para redefinir a senha foi enviado para '+email+'.');}catch(e){alert(traduzErro(e));}}
async function verificarAprovacao(){
  if(!auth.currentUser)return mostrarAcesso();
  mensagemAguardando('Verificando autorização…');
  if(await adminRef(auth.currentUser.uid)){await abrirPainel(auth.currentUser);}
  else mensagemAguardando('Ainda não foi encontrada autorização para este UID. Não é necessário sair: esta tela verifica automaticamente.');
}
function mensagemAguardando(t){const el=$('aguardandoMensagem');if(el)el.textContent=t||'';}
async function garantirPerfil(u){const ref=db.ref('rifa/administradores/'+u.uid),s=await ref.once('value');if(!s.exists())await ref.set({uid:u.uid,nome:u.displayName||'Administrador',telefone:'',email:u.email||'',foto:u.photoURL||'',status:'ativo',criadoEm:firebase.database.ServerValue.TIMESTAMP});await ref.update({status:'ativo',email:u.email||'',ultimoAcesso:firebase.database.ServerValue.TIMESTAMP,online:true});const conectado=db.ref('.info/connected');conectado.on('value',snap=>{if(snap.val()===true){ref.child('online').onDisconnect().set(false);ref.child('ultimoAcesso').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);ref.update({online:true,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP});}});}
async function abrirPainel(u){usuarioAtual=u;esconderTudo();secoes.forEach(id=>$(id).classList.remove('oculto'));await garantirPerfil(u);carregarPerfil();ouvirPendentes();if(!ouvindo){ouvirTudo();ouvindo=true;}aplicarTema(localStorage.getItem('rifaAdminTema')==='escuro');}
function carregarPerfil(){db.ref('rifa/administradores/'+usuarioAtual.uid).on('value',s=>{const p=s.val()||{};$('adminLogado').textContent=p.nome||usuarioAtual.displayName||usuarioAtual.email||'Administrador';$('perfilNome').value=p.nome||'';$('perfilTelefone').value=p.telefone||'';$('perfilEmail').value=usuarioAtual.email||p.email||'';$('perfilFoto').value=p.foto||'';$('perfilUltimoAcesso').textContent='Último acesso: '+(p.ultimoAcesso?new Date(p.ultimoAcesso).toLocaleString('pt-BR'):'primeiro acesso');$('adminStatus').innerHTML='<span class="status-online">● Online</span> • sessão permanece conectada até apertar Sair';const avatar=$('avatarAdmin');if(p.foto){avatar.style.backgroundImage='url("'+String(p.foto).replace(/"/g,'')+'")';avatar.textContent='';}else{avatar.style.backgroundImage='';avatar.textContent=(p.nome||'A').charAt(0).toUpperCase();}});}
async function salvarPerfil(){const nome=$('perfilNome').value.trim(),telefone=$('perfilTelefone').value.replace(/\D/g,''),email=$('perfilEmail').value.trim(),foto=$('perfilFoto').value.trim();if(nome.length<3)return alert('Digite o nome.');if(telefone&&telefone.length<10)return alert('Telefone inválido.');try{if(email&&email!==usuarioAtual.email)await usuarioAtual.updateEmail(email);await usuarioAtual.updateProfile({displayName:nome,photoURL:foto||null});await db.ref('rifa/administradores/'+usuarioAtual.uid).update({nome,telefone,email:usuarioAtual.email,foto,atualizadoEm:firebase.database.ServerValue.TIMESTAMP});alert('Perfil atualizado.');}catch(e){alert(traduzErro(e)+'\nPara alterar o e-mail, talvez seja necessário sair e entrar novamente.');}}
async function alterarSenha(){const nova=prompt('Digite a nova senha (mínimo 6 caracteres):');if(!nova)return;if(nova.length<6)return alert('Senha muito curta.');const conf=prompt('Digite a nova senha novamente:');if(nova!==conf)return alert('As senhas não são iguais.');try{await usuarioAtual.updatePassword(nova);alert('Senha alterada com sucesso.');}catch(e){alert(traduzErro(e)+'\nSaia, entre novamente e tente alterar.');}}
let listenerPendentesAtivo=false;
function renderizarPendentes(dados){
  const c=$('listaAdminsPendentes'),status=$('statusPendentes');
  c.innerHTML='';
  const lista=Object.values(dados||{}).filter(p=>p&&p.status==='pendente').sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  status.textContent='Verificação concluída em '+new Date().toLocaleTimeString('pt-BR')+' • '+lista.length+' pendente(s).';
  status.className='status-operacao sucesso';
  if(!lista.length){c.innerHTML='<p class="texto-apoio">Nenhum cadastro aguardando aprovação.</p>';return;}
  lista.forEach(p=>{const d=document.createElement('article');d.className='admin-pendente';d.innerHTML='<strong>'+esc(p.nome||'Sem nome')+'</strong><p>'+esc(p.email||'')+'</p><p>'+esc(p.telefone||'')+'</p><p class="texto-apoio">Cadastro: '+(p.criadoEm?new Date(p.criadoEm).toLocaleString('pt-BR'):'data não informada')+'</p><div class="linha-botoes"></div>';const a=d.querySelector('.linha-botoes');const ok=document.createElement('button');ok.className='botao confirmar';ok.textContent='✓ Aprovar';ok.onclick=()=>aprovarAdmin(p.uid,true);const no=document.createElement('button');no.className='botao excluir';no.textContent='Recusar';no.onclick=()=>aprovarAdmin(p.uid,false);a.append(ok,no);c.appendChild(d);});
}
async function recarregarPendentes(){const status=$('statusPendentes');status.textContent='Consultando cadastros no Firebase…';status.className='status-operacao';try{const snap=await db.ref('rifa/administradores').once('value');renderizarPendentes(snap.val()||{});}catch(e){console.error(e);status.textContent='Erro ao verificar cadastros: '+e.message;status.className='status-operacao erro';}}
function ouvirPendentes(){if(listenerPendentesAtivo)return;listenerPendentesAtivo=true;db.ref('rifa/administradores').on('value',snap=>renderizarPendentes(snap.val()||{}),e=>{const status=$('statusPendentes');status.textContent='A atualização automática falhou. Aperte “Verificar novamente”. '+e.message;status.className='status-operacao erro';});recarregarPendentes();}
async function aprovarAdmin(uid,aprovar){if(aprovar){if(!confirm('Autorizar este usuário como administrador?'))return;const u={};u['admins/'+uid]=true;u['rifa/administradores/'+uid+'/status']='ativo';u['rifa/administradores/'+uid+'/aprovadoEm']=firebase.database.ServerValue.TIMESTAMP;u['rifa/administradores/'+uid+'/aprovadoPor']=usuarioAtual.uid;await db.ref().update(u);alert('Administrador aprovado.');}else{if(!proteger('Recusar este cadastro?'))return;await db.ref('rifa/administradores/'+uid).update({status:'recusado',recusadoEm:firebase.database.ServerValue.TIMESTAMP,recusadoPor:usuarioAtual.uid});}}
function aplicarTema(escuro){document.body.classList.toggle('tema-escuro',escuro);localStorage.setItem('rifaAdminTema',escuro?'escuro':'claro');$('btnTema').textContent=escuro?'☀️ Modo claro':'🌙 Modo escuro';}
function tocarAviso(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;osc.start();setTimeout(()=>{osc.stop();ctx.close();},220);}catch(_){}}
function avisoInterno(titulo,corpo){let box=document.getElementById('avisoInterno');if(!box){box=document.createElement('div');box.id='avisoInterno';box.className='aviso-interno';document.body.appendChild(box);}box.innerHTML='<strong>'+esc(titulo)+'</strong><span>'+esc(corpo)+'</span>';box.classList.add('mostrar');setTimeout(()=>box.classList.remove('mostrar'),6000);}
async function mostrarNotificacaoSistema(titulo,corpo){if(!('Notification'in window)||Notification.permission!=='granted')return false;try{if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.ready;await reg.showNotification(titulo,{body:corpo,icon:'icon-192.png',badge:'icon-192.png',tag:'rifa-'+titulo,renotify:true});return true;}new Notification(titulo,{body:corpo,icon:'icon-192.png'});return true;}catch(e){console.warn('Notificação do sistema falhou:',e);return false;}}
async function ativarNotificacoes(){const b=$('btnNotificacoes');if(!window.isSecureContext){b.textContent='🔔 Avisos internos ativos';avisoInterno('Avisos ativados','Nesta visualização, os avisos aparecerão dentro do painel. Notificações do Android exigem site HTTPS instalado.');tocarAviso();return;}if(!('Notification'in window)){b.textContent='🔔 Avisos internos ativos';avisoInterno('Avisos ativados','Seu navegador não oferece notificações do sistema, mas os avisos internos funcionarão.');return;}const p=await Notification.requestPermission();b.textContent=p==='granted'?'🔔 Avisos ativados':'🔔 Avisos internos ativos';avisoInterno('Painel da rifa',p==='granted'?'Notificações do sistema ativadas.':'Permissão do sistema bloqueada; os avisos internos continuarão funcionando.');tocarAviso();if(p==='granted')await mostrarNotificacaoSistema('Painel da rifa','Notificações ativadas com sucesso.');}
function avisar(titulo,corpo){avisoInterno(titulo,corpo);tocarAviso();mostrarNotificacaoSistema(titulo,corpo);}
function desenharLinks(m){linksCache=m||{};const l=$('listaLinks');l.innerHTML='';const qs=Object.keys(linksCache).sort((a,b)=>a-b);if(!qs.length){l.innerHTML='<p class="texto-apoio">Nenhum link configurado.</p>';return;}qs.forEach(q=>{const d=document.createElement('div');d.className='link-item';d.innerHTML='<div><strong>'+q+' número(s) — '+moeda(Number(q)*Number(configRifa.precoNumero||20))+'</strong><small>'+esc(linksCache[q])+'</small></div>';const b=document.createElement('button');b.className='botao cancelar';b.textContent='🔒 Excluir';b.onclick=()=>{if(proteger('Excluir este link?'))db.ref('rifa/configPublica/pagamentos/links/'+q).remove();};d.appendChild(b);l.appendChild(d);});}
async function salvarLink(){const q=Number($('quantidadeLink').value),u=$('urlLink').value.trim();if(!Number.isInteger(q)||q<1||q>Number(configRifa.quantidadeNumeros||1000))return alert('Quantidade inválida.');try{const url=new URL(u);if(url.protocol!=='https:')throw 0;}catch(e){return alert('Link HTTPS inválido.');}await db.ref('rifa/configPublica/pagamentos/links/'+q).set(u);$('quantidadeLink').value='';$('urlLink').value='';}
async function salvarPix(){const chave=$('chavePix').value.trim(),nome=$('nomeRecebedorPix').value.trim();if(chave.length<4)return alert('Digite uma chave válida.');await db.ref('rifa/configPublica/pagamentos/pix').set({chave,nome,atualizadoEm:Date.now()});alert('Pix salvo.');}
async function mudar(r,status){const updates={};updates['rifa/reservas/'+r.reservaId+'/status']=status;updates['rifa/reservas/'+r.reservaId+'/atualizadoEm']=Date.now();if(r.cpf)updates['rifa/reservasPorCpf/'+r.cpf+'/'+r.reservaId+'/status']=status;for(const n of r.numeros||[]){if(status==='confirmado')updates['rifa/numeros/'+n]={status:'confirmado',reservaId:r.reservaId,ownerUid:r.ownerUid,atualizadoEm:Date.now()};else if(status==='cancelado')updates['rifa/numeros/'+n]=null;}await db.ref().update(updates);}
async function excluirReserva(r){const frase=r.status==='confirmado'?'EXCLUIR CONFIRMADO':null;if(!proteger('Excluir definitivamente a reserva de '+r.nome+'?',frase))return;const updates={};updates['rifa/reservas/'+r.reservaId]=null;if(r.cpf)updates['rifa/reservasPorCpf/'+r.cpf+'/'+r.reservaId]=null;for(const n of r.numeros||[])updates['rifa/numeros/'+n]=null;await db.ref().update(updates);}
function whatsapp(r){let t=String(r.telefone||'').replace(/\D/g,'');if(!t)return alert('Sem telefone.');if(!t.startsWith('55'))t='55'+t;const msg='Olá, '+r.nome+'! Sobre sua rifa: números '+(r.numeros||[]).join(', ')+', total '+moeda(r.valor)+', status '+statusNome(r.status)+'.';open('https://wa.me/'+t+'?text='+encodeURIComponent(msg),'_blank');}
function desenharReservas(){const termo=$('pesquisa').value.toLowerCase().trim(),lista=Object.values(reservasCache).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)).filter(r=>!termo||[r.nome,r.telefone,r.cpf,r.reservaId,(r.numeros||[]).join(' ')].join(' ').toLowerCase().includes(termo)),q={aguardando_confirmacao:0,pagamento_informado:0,confirmado:0,cancelado:0};Object.values(reservasCache).forEach(r=>q[r.status]=(q[r.status]||0)+1);$('contadorReservas').textContent=Object.keys(reservasCache).length+' total • '+q.aguardando_confirmacao+' reservadas • '+q.pagamento_informado+' pagamentos informados • '+q.confirmado+' confirmadas • '+q.cancelado+' canceladas';const c=$('listaReservas');if(!lista.length){c.innerHTML='<p class="texto-apoio">Nenhuma reserva encontrada.</p>';return;}c.innerHTML='';lista.forEach(r=>{const a=document.createElement('article');a.className='reserva-card'+(r.status==='pagamento_informado'?' pagamento-destaque':'');a.innerHTML='<div class="reserva-topo"><strong>'+esc(r.nome)+'</strong><span class="status-tag '+esc(r.status)+'">'+esc(statusNome(r.status))+'</span></div><p><b>Código:</b> '+esc(r.reservaId)+'</p><p><b>Números:</b> '+esc((r.numeros||[]).join(', '))+'</p><p><b>Total:</b> '+moeda(r.valor)+'</p><p><b>Telefone:</b> '+esc(r.telefone||'-')+'</p><p><b>CPF:</b> '+esc(r.cpf||'-')+'</p><p><b>E-mail:</b> '+esc(r.email||'-')+'</p>'+(r.status==='pagamento_informado'?'<div class="pagamento-informado-box"><b>✅ Cliente informou pagamento</b><br>Nome no pagamento: '+esc(r.nomePagador||'não informado')+'</div>':'')+'<div class="acoes-admin"></div>';const x=a.querySelector('.acoes-admin'),zap=document.createElement('button');zap.className='botao whatsapp';zap.textContent='💬 WhatsApp';zap.onclick=()=>whatsapp(r);x.appendChild(zap);if(['aguardando_confirmacao','pagamento_informado'].includes(r.status)){const ok=document.createElement('button');ok.className='botao confirmar';ok.textContent='✓ Confirmar pagamento';ok.onclick=()=>confirm('Pagamento conferido?')&&mudar(r,'confirmado');const no=document.createElement('button');no.className='botao cancelar';no.textContent='Cancelar';no.onclick=()=>confirm('Cancelar e liberar números?')&&mudar(r,'cancelado');x.append(ok,no);}const del=document.createElement('button');del.className='botao excluir';del.textContent='🔒 Excluir';del.onclick=()=>excluirReserva(r);x.appendChild(del);c.appendChild(a);});}
async function excluirStatus(status){const alvos=Object.values(reservasCache).filter(r=>status==='reservado'?['aguardando_confirmacao','pagamento_informado'].includes(r.status):r.status===status);if(!alvos.length)return alert('Nada para excluir.');const frase=status==='confirmado'?'EXCLUIR CONFIRMADOS':'EXCLUIR '+status.toUpperCase();if(!proteger('Excluir '+alvos.length+' registros?',frase))return;const u={};for(const r of alvos){u['rifa/reservas/'+r.reservaId]=null;if(r.cpf)u['rifa/reservasPorCpf/'+r.cpf+'/'+r.reservaId]=null;for(const n of r.numeros||[])u['rifa/numeros/'+n]=null;}await db.ref().update(u);}

function atualizarDashboard(){
  const lista=Object.values(reservasCache||{}), numeros=Object.values(numerosCache||{});
  const reservados=numeros.filter(n=>n&&n.status==='reservado').length;
  const confirmados=numeros.filter(n=>n&&n.status==='confirmado').length;
  const livres=Math.max(0,Number(configRifa.quantidadeNumeros||100)-reservados-confirmados);
  const ativos=lista.filter(r=>['aguardando_confirmacao','pagamento_informado','confirmado'].includes(r.status));
  const participantes=new Set(ativos.map(r=>String(r.cpf||r.telefone||r.ownerUid||r.reservaId))).size;
  const arrecadado=lista.filter(r=>r.status==='confirmado').reduce((t,r)=>t+Number(r.valor||0),0);
  $('dashLivres').textContent=String(livres);
  $('dashReservados').textContent=String(reservados);
  $('dashConfirmados').textContent=String(confirmados);
  $('dashParticipantes').textContent=String(participantes);
  $('dashArrecadado').textContent=moeda(arrecadado);
  db.ref('rifa/estatisticasPublicas').set({livres,reservados,confirmados,participantes,arrecadado,atualizadoEm:firebase.database.ServerValue.TIMESTAMP}).catch(e=>console.warn('Falha ao publicar estatísticas:',e));
}
function statusFerramenta(texto,tipo=''){const el=$('statusFerramentas');if(!el)return;el.textContent=texto;el.className='status-operacao'+(tipo?' '+tipo:'');}

function baixar(nome,conteudo,tipo){const blob=new Blob([conteudo],{type:tipo}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportarCsv(){
  try{
    statusFerramenta('Preparando arquivo CSV…');
    const dados=Object.values(reservasCache||{}).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
    const linhas=[['Código','Nome','Telefone','CPF','E-mail','Números','Valor','Status','Data']];
    dados.forEach(r=>linhas.push([r.reservaId||'',r.nome||'',r.telefone||'',r.cpf||'',r.email||'',(r.numeros||[]).join(' '),Number(r.valor||0).toFixed(2).replace('.',','),statusNome(r.status),new Date(r.criadoEm||0).toLocaleString('pt-BR')]));
    const csv='\ufeff'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
    baixar('reservas-rifa-'+new Date().toISOString().slice(0,10)+'.csv',csv,'text/csv;charset=utf-8');
    statusFerramenta('CSV exportado com '+dados.length+' reserva(s).','sucesso');
  }catch(e){console.error(e);statusFerramenta('Erro ao exportar CSV: '+e.message,'erro');alert('Não foi possível exportar o CSV.');}
}
async function baixarBackup(){
  try{
    statusFerramenta('Lendo os dados do Firebase…');
    const s=await db.ref('rifa').once('value');
    const pacote={versao:15,criadoEm:Date.now(),projeto:'rifa-firebase',rifa:s.val()||{}};
    baixar('backup-rifa-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',JSON.stringify(pacote,null,2),'application/json');
    statusFerramenta('Backup baixado com sucesso. Guarde o arquivo em local seguro.','sucesso');
  }catch(e){console.error(e);statusFerramenta('Erro ao baixar backup: '+e.message,'erro');alert('Não foi possível baixar o backup.');}
}
async function restaurarBackup(arquivo){
  if(!arquivo)return;
  try{
    statusFerramenta('Verificando o arquivo de backup…');
    if(arquivo.size>10*1024*1024)throw new Error('Arquivo maior que 10 MB.');
    const txt=await arquivo.text(),obj=JSON.parse(txt),dados=obj.rifa||obj;
    if(!dados||typeof dados!=='object'||Array.isArray(dados))throw new Error('Arquivo inválido.');
    if(!proteger('Restaurar este backup e substituir todos os dados atuais da rifa?','RESTAURAR BACKUP')){statusFerramenta('Restauração cancelada.');return;}
    const seguranca=await db.ref('rifa').once('value');
    localStorage.setItem('rifaBackupAntesRestaurar',JSON.stringify({criadoEm:Date.now(),rifa:seguranca.val()||{}}));
    await db.ref('rifa').set(dados);
    statusFerramenta('Backup restaurado com sucesso.','sucesso');
    alert('Backup restaurado com sucesso.');
  }catch(e){console.error(e);statusFerramenta('Erro ao restaurar: '+e.message,'erro');alert('Não foi possível restaurar: '+e.message);}finally{$('arquivoBackup').value='';}
}


async function carregarConfigRifa(){
  const msg=$('configRifaMensagem');
  try{
    if(msg){msg.textContent='Carregando configurações…';msg.className='status-operacao';}
    const snap=await db.ref('rifa/configPublica/rifa').once('value');
    configRifa=Object.assign({nomeRifa:'Rifa Online',precoNumero:20,quantidadeNumeros:100,premio:'',descricao:'',dataSorteio:'',horaSorteio:'',banner:'',regulamento:'',whatsapp:'',vendasAbertas:true},snap.val()||{});
    $('cfgNomeRifa').value=configRifa.nomeRifa||'Rifa Online';
    $('cfgPrecoNumero').value=Number(configRifa.precoNumero||20);
    $('cfgQuantidadeNumeros').value=Number(configRifa.quantidadeNumeros||100);
    $('cfgPremio').value=configRifa.premio||'';
    $('cfgDescricao').value=configRifa.descricao||'';
    $('cfgDataSorteio').value=configRifa.dataSorteio||'';
    $('cfgHoraSorteio').value=configRifa.horaSorteio||'';
    $('cfgBanner').value=configRifa.banner||'';
    $('cfgRegulamento').value=configRifa.regulamento||'';
    $('cfgWhatsapp').value=configRifa.whatsapp||'';
    $('cfgVendasAbertas').checked=configRifa.vendasAbertas!==false;
    if(msg){msg.textContent='Configurações carregadas.';msg.className='status-operacao sucesso';}
    atualizarDashboard();
  }catch(e){if(msg){msg.textContent='Erro ao carregar: '+e.message;msg.className='status-operacao erro';}}
}
async function salvarConfigRifa(){
  const nome=$('cfgNomeRifa').value.trim()||'Rifa Online';
  const preco=Number(String($('cfgPrecoNumero').value).replace(',','.'));
  const quantidade=Number($('cfgQuantidadeNumeros').value);
  if(!Number.isFinite(preco)||preco<=0)return alert('Digite um valor válido para cada número.');
  if(!Number.isInteger(quantidade)||quantidade<1||quantidade>1000)return alert('A quantidade deve ficar entre 1 e 1000.');
  const acima=Object.keys(numerosCache||{}).map(Number).filter(n=>n>quantidade && numerosCache[n] && ['reservado','confirmado'].includes(numerosCache[n].status));
  if(acima.length)return alert('Não é possível reduzir para '+quantidade+' porque existem números reservados/confirmados acima desse limite: '+acima.slice(0,10).join(', '));
  const dados={nomeRifa:nome,precoNumero:preco,quantidadeNumeros:quantidade,premio:$('cfgPremio').value.trim(),descricao:$('cfgDescricao').value.trim(),dataSorteio:$('cfgDataSorteio').value,horaSorteio:$('cfgHoraSorteio').value,banner:$('cfgBanner').value.trim(),regulamento:$('cfgRegulamento').value.trim(),whatsapp:$('cfgWhatsapp').value.replace(/\D/g,''),vendasAbertas:$('cfgVendasAbertas').checked,atualizadoEm:firebase.database.ServerValue.TIMESTAMP,atualizadoPor:usuarioAtual?usuarioAtual.uid:''};
  if(!confirm('Salvar estas configurações e atualizar a página dos clientes em tempo real?'))return;
  const msg=$('configRifaMensagem');msg.textContent='Salvando no Firebase…';msg.className='status-operacao';
  try{await db.ref('rifa/configPublica/rifa').set(dados);configRifa=Object.assign({},dados,{atualizadoEm:Date.now()});msg.textContent='Configurações salvas com sucesso.';msg.className='status-operacao sucesso';desenharLinks(((await db.ref('rifa/configPublica/pagamentos/links').once('value')).val())||{});atualizarDashboard();}
  catch(e){msg.textContent='Erro ao salvar: '+e.message;msg.className='status-operacao erro';}
}
function ouvirTudo(){db.ref('rifa/configPublica/rifa').on('value',snap=>{configRifa=Object.assign({precoNumero:20,quantidadeNumeros:100,vendasAbertas:true},snap.val()||{});carregarConfigRifa();desenharLinks(linksCache);atualizarDashboard();});db.ref('rifa/configPublica/pagamentos').on('value',s=>{const p=s.val()||{},links=p.links||{},pix=p.pix||{};$('chavePix').value=pix.chave||'';$('nomeRecebedorPix').value=pix.nome||'';$('pixAdminMensagem').textContent=pix.chave?'Chave cadastrada: '+pix.chave:'Nenhuma chave cadastrada.';desenharLinks(links);});db.ref('rifa/numeros').on('value',s=>{numerosCache=s.val()||{};atualizarDashboard();},e=>statusFerramenta('Erro ao ler números: '+e.message,'erro'));db.ref('rifa/reservas').on('value',s=>{reservasCache=s.val()||{};const vals=Object.values(reservasCache),resumo={total:vals.length,pagamentos:vals.filter(r=>r.status==='pagamento_informado').length};if(!primeiraLeituraReservas){if(resumo.total>resumoAnterior.total)avisar('Nova reserva','Uma nova reserva foi registrada.');if(resumo.pagamentos>resumoAnterior.pagamentos)avisar('Pagamento informado','Um cliente informou que realizou o pagamento.');}primeiraLeituraReservas=false;resumoAnterior=resumo;desenharReservas();atualizarDashboard();statusFerramenta('Painel atualizado em '+new Date().toLocaleTimeString('pt-BR')+'.','sucesso');},e=>statusFerramenta('Erro ao ler reservas: '+e.message,'erro'));}

let recarregouPorAtualizacao=false;
async function registrarServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('service-worker.js?v=15.6',{updateViaCache:'none'});
    await reg.update().catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(recarregouPorAtualizacao)return;
      recarregouPorAtualizacao=true;
      location.reload();
    });
    setInterval(()=>reg.update().catch(()=>{}),5*60*1000);
  }catch(_){ }
}

function init(){auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});$('abaLogin').onclick=()=>trocarAba('login');$('abaCadastro').onclick=()=>trocarAba('cadastro');$('btnEntrar').onclick=entrar;$('btnCadastrar').onclick=cadastrar;$('btnEsqueciSenha').onclick=esqueciSenha;$('btnAtualizarAprovacao').onclick=verificarAprovacao;$('btnSairAguardando').onclick=()=>auth.signOut();$('btnSair').onclick=async()=>{if(usuarioAtual)await db.ref('rifa/administradores/'+usuarioAtual.uid).update({online:false,ultimoAcesso:firebase.database.ServerValue.TIMESTAMP});await auth.signOut();};$('btnSalvarPerfil').onclick=salvarPerfil;$('btnAlterarSenha').onclick=alterarSenha;$('btnTema').onclick=()=>aplicarTema(!document.body.classList.contains('tema-escuro'));$('btnNotificacoes').onclick=ativarNotificacoes;$('btnRecarregarPendentes').onclick=recarregarPendentes;$('btnSalvarConfigRifa').onclick=salvarConfigRifa;$('btnRecarregarConfigRifa').onclick=carregarConfigRifa;$('btnSalvarLink').onclick=salvarLink;$('btnSalvarPix').onclick=salvarPix;$('btnExcluirPix').onclick=()=>proteger('Excluir chave Pix?')&&db.ref('rifa/configPublica/pagamentos/pix').remove();$('pesquisa').oninput=desenharReservas;$('btnExcluirCanceladas').onclick=()=>excluirStatus('cancelado');$('btnExcluirReservadas').onclick=()=>excluirStatus('reservado');$('btnExcluirConfirmadas').onclick=()=>excluirStatus('confirmado');$('btnExportarCsv').onclick=exportarCsv;$('btnBackup').onclick=baixarBackup;$('arquivoBackup').onchange=e=>restaurarBackup(e.target.files[0]);$('adminSenha').addEventListener('keydown',e=>{if(e.key==='Enter')entrar();});if('serviceWorker'in navigator)registrarServiceWorker();auth.onAuthStateChanged(async u=>{
  usuarioAtual=u;
  if(!u)return mostrarAcesso();
  mensagemAguardando('Verificando autorização…');
  if(await adminRef(u.uid)){await abrirPainel(u);return;}
  mostrarAguardando();
  mensagemAguardando('Conta conectada. Aguardando autorização no Firebase…');
  db.ref('admins/'+u.uid).on('value',async snap=>{
    if(auth.currentUser&&auth.currentUser.uid===u.uid&&snap.val()===true)await abrirPainel(auth.currentUser);
  });
});}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
