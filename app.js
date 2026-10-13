const API = 'http://localhost:3000/api';
const NIV = ['Verde', 'Amarillo', 'Naranja', 'Rojo'];
const COL = ['#2e7d4f', '#c99a06', '#e07b00', '#c62828'];
const $ = id => document.getElementById(id);
let sesion = JSON.parse(localStorage.getItem('sesion') || 'null');
let modoRegistro = false, mapa = null, capa = null, coordReporte = null;

async function api(ruta, opts = {}) {
  const r = await fetch(API + ruta, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: 'Bearer ' + sesion.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && sesion) salir();
  if (!r.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}
const aviso = (el, txt, err) => { el.textContent = txt; el.className = 'msg' + (err ? ' err' : ''); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const esOperador = () => sesion.rol === 'operador';

// ---- Autenticación ----
$('toggleAuth').onclick = () => {
  modoRegistro = !modoRegistro;
  $('camposRegistro').classList.toggle('hidden', !modoRegistro);
  $('tituloAuth').textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  $('btnAuth').textContent = modoRegistro ? 'Registrarme' : 'Ingresar';
  $('toggleAuth').textContent = modoRegistro ? 'Ya tengo cuenta' : '¿Primera vez? Crea tu cuenta';
};
$('formAuth').onsubmit = async e => {
  e.preventDefault();
  try {
    const body = { email: $('email').value, password: $('password').value };
    if (modoRegistro) Object.assign(body, { dni: $('dni').value, nombres: $('nombres').value, apellidos: $('apellidos').value, telefono: $('telefono').value });
    sesion = await api(modoRegistro ? '/auth/registro' : '/auth/login', { method: 'POST', body });
    localStorage.setItem('sesion', JSON.stringify(sesion));
    iniciar();
  } catch (err) { aviso($('msgAuth'), err.message, true); $('msgAuth').classList.remove('hidden'); }
};
function salir() { localStorage.removeItem('sesion'); sesion = null; $('vistaApp').classList.add('hidden'); $('vistaLogin').classList.remove('hidden'); }
$('btnSalir').onclick = salir;

// ---- Mapa ----
function iniciarMapa() {
  if (mapa) { setTimeout(() => mapa.invalidateSize(), 100); return; }
  mapa = L.map('mapa').setView([-11.9386, -76.6944], 14);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  mapa.on('click', e => { if (!esOperador()) fijarPunto(e.latlng.lat, e.latlng.lng); });
}
function fijarPunto(lat, lng) {
  coordReporte = { lat, lng };
  $('coordTxt').textContent = `Ubicación marcada: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  dibujarCapa(window._zonas || []);
}
$('btnGPS').onclick = () => {
  if (!navigator.geolocation) return alert('Tu navegador no permite geolocalización');
  navigator.geolocation.getCurrentPosition(p => { fijarPunto(p.coords.latitude, p.coords.longitude); mapa.setView([p.coords.latitude, p.coords.longitude], 15); },
    () => alert('No se pudo obtener tu ubicación. Haz clic en el mapa para marcarla.'));
};
function dibujarCapa(zonas) {
  capa.clearLayers();
  zonas.forEach(z => L.circleMarker([+z.lat, +z.lng], { radius: 12 + z.nivel_actual * 4, color: COL[z.nivel_actual], fillColor: COL[z.nivel_actual], fillOpacity: .55 })
    .bindPopup(`<strong>${esc(z.nombre)}</strong><br>Nivel: ${NIV[z.nivel_actual]}`).addTo(capa));
  if (coordReporte) L.circleMarker([coordReporte.lat, coordReporte.lng], { radius: 6, color: '#0f5f8a', fillColor: '#0f5f8a', fillOpacity: 1 }).bindPopup('Mi ubicación').addTo(capa);
}

// ---- Panel ----
async function iniciar() {
  if (!sesion) return;
  $('vistaLogin').classList.add('hidden'); $('vistaApp').classList.remove('hidden');
  $('saludo').textContent = (esOperador() ? 'Operador: ' : 'Hola, ') + sesion.nombre;
  ['panelLectura', 'panelManual'].forEach(id => $(id).classList.toggle('hidden', !esOperador()));
  ['panelReporte', 'panelNotif'].forEach(id => $(id).classList.toggle('hidden', esOperador()));
  $('tituloReportes').textContent = esOperador() ? 'Reportes ciudadanos' : 'Mis reportes';
  iniciarMapa();
  refrescar();
}
async function refrescar() {
  const [zonas, alertas, reportes, notifs] = await Promise.all([
    api('/zonas'), api('/alertas'), api('/reportes'), esOperador() ? Promise.resolve([]) : api('/notificaciones')]);
  window._zonas = zonas;
  dibujarCapa(zonas);
  const opciones = zonas.map(z => `<option value="${z.id}">${esc(z.nombre)}</option>`).join('');
  [['lzona', ''], ['mzona', ''], ['rzona', '<option value="">Detectar según mi ubicación</option>']].forEach(([id, extra]) => {
    const v = $(id).value; $(id).innerHTML = extra + opciones; $(id).value = v;
  });
  $('zonas').innerHTML = zonas.map(z => `
    <div class="zona"><div><strong>${esc(z.nombre)}</strong><br>
      <small>${z.lluvia_mm_h == null ? 'Sin lecturas aún' : `Lluvia ${z.lluvia_mm_h} mm/h · Río ${z.nivel_rio_cm} cm`}</small></div>
      <div><span class="semaforo n${z.nivel_actual}">${NIV[z.nivel_actual]}</span>
      ${esOperador() ? '' : `<button class="btn sec small" data-seg="${z.id}" data-on="${z.suscrito}">${+z.suscrito ? 'Siguiendo' : 'Seguir'}</button>`}</div></div>`).join('');
  $('alertas').innerHTML = alertas.length ? alertas.map(a => `
    <div class="alerta n${a.nivel}"><strong>${NIV[a.nivel]} · ${esc(a.zona)}</strong><br>${esc(a.mensaje)}<br><small>${a.emitida_en} (${a.origen})</small></div>`).join('')
    : '<p>No hay alertas emitidas todavía.</p>';
  $('notifs').innerHTML = notifs.length ? notifs.map(n => `
    <div class="notif ${n.leida ? '' : 'nueva'}">${esc(n.mensaje)}<br><small>${n.creada_en}</small></div>`).join('')
    : '<p>Sin notificaciones. Sigue una quebrada para recibirlas.</p>';
  $('reportes').innerHTML = reportes.length ? `<table>${reportes.map(r => `
    <tr><td>${esc(r.zona)}<br><small>${esc(r.tipo)}${esOperador() ? ' · ' + esc(r.ciudadano) : ''}</small><br><small>${esc(r.descripcion)}</small></td>
    <td>${esc(r.estado)}${esOperador() && r.estado === 'pendiente' ? `<br><button class="btn small" data-rep="verificado" data-id="${r.id}">Verificar</button> <button class="btn sec small" data-rep="descartado" data-id="${r.id}">Descartar</button>` : ''}</td></tr>`).join('')}</table>`
    : '<p>Aún no hay reportes.</p>';
}
$('zonas').onclick = async e => {
  const b = e.target.closest('[data-seg]'); if (!b) return;
  try { await api('/suscripciones/' + b.dataset.seg, { method: +b.dataset.on ? 'DELETE' : 'POST' }); refrescar(); } catch (err) { alert(err.message); }
};
$('reportes').onclick = async e => {
  const b = e.target.closest('[data-rep]'); if (!b) return;
  try { await api('/reportes/' + b.dataset.id, { method: 'PATCH', body: { estado: b.dataset.rep } }); refrescar(); } catch (err) { alert(err.message); }
};
$('btnLeer').onclick = async () => { await api('/notificaciones/leer', { method: 'PATCH' }); refrescar(); };
async function enviar(formId, msgId, ruta, body, ok) {
  const m = $(msgId); m.classList.remove('hidden');
  try { const r = await api(ruta, { method: 'POST', body }); aviso(m, ok(r)); $(formId).reset(); refrescar(); return true; }
  catch (err) { aviso(m, err.message, true); return false; }
}
$('formLectura').onsubmit = e => { e.preventDefault();
  enviar('formLectura', 'msgLectura', `/zonas/${$('lzona').value}/lecturas`, { lluvia_mm_h: $('lluvia').value, nivel_rio_cm: $('rio').value },
    r => `Lectura guardada. Nivel: ${r.nivel}.${r.alerta ? ` Alerta automática emitida (${r.alerta.notificados} notificados).` : ''}`); };
$('formManual').onsubmit = e => { e.preventDefault();
  enviar('formManual', 'msgManual', '/alertas', { zona_id: $('mzona').value, nivel: $('mnivel').value, mensaje: $('mmensaje').value }, r => r.mensaje); };
$('formReporte').onsubmit = async e => { e.preventDefault();
  const ok = await enviar('formReporte', 'msgReporte', '/reportes',
    { zona_id: $('rzona').value || null, tipo: $('rtipo').value, descripcion: $('rdesc').value, lat: coordReporte?.lat, lng: coordReporte?.lng }, r => r.mensaje);
  if (ok) { coordReporte = null; $('coordTxt').textContent = 'O haz clic en el mapa para marcarla.'; } };
iniciar();


