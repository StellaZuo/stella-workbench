/* Stella Zuo 工作台 · 阶段二（Supabase 云端同步 + 本地存储） */
(function () {
  'use strict';

  // ===== Supabase 配置（anon key 本就公开，安全性由 RLS 策略界定） =====
  const SUPABASE_URL = 'https://zxogdpguhlztcqcbancz.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2dkcGd1aGx6dGNxY2JhbmN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzQ4MTIsImV4cCI6MjEwMDgxMDgxMn0.FcUTqk85DxMcB82_ru7zqrV9KR8WuWGxA-FJDUNxpEg';
  const STATE_ID = 'stella-main';
  const TABLE = 'app_state';

  const DB_KEY = 'stella-data-v1';
  const META_KEY = 'stella-meta-v1';
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function ymd(d) {
    d = d || new Date();
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  const TODAY = ymd();

  function prettyDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return `${m}月${d}日 周${WEEK[new Date(y, m - 1, d).getDay()]}`;
  }

  // ---- 存储 ----
  let data = load();
  function load() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    markLocalModified();
    schedulePush();
  }

  const ensure = (o, k, v) => (k in o ? o[k] : (o[k] = v));

  // ---- 同步元数据 ----
  function loadMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }
  function markLocalModified() {
    const m = loadMeta();
    m.localModified = new Date().toISOString();
    saveMeta(m);
  }

  // 安装级设备 ID（仅用于排查，不影响逻辑）
  let DEVICE_ID = localStorage.getItem('stella-device');
  if (!DEVICE_ID) { DEVICE_ID = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('stella-device', DEVICE_ID); }

  // ---- 状态标识 ----
  const badge = document.getElementById('status-badge');
  function setStatus(mode) {
    badge.className = 'status ' + (mode === 'config' ? 'local' : mode);
    badge.querySelector('.txt').textContent =
      mode === 'online' ? '云端已同步' :
      mode === 'offline' ? '离线' :
      mode === 'config' ? '云端未配置' : '待同步';
  }

  // ===== Supabase REST 客户端（无 SDK 依赖） =====
  function sbHeaders(extra) {
    return Object.assign({
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  async function sbGetRow() {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(STATE_ID)}&select=*`;
    const r = await fetch(url, { headers: sbHeaders() });
    if (r.status === 404) throw new Error('TABLE_MISSING');
    if (!r.ok) throw new Error('GET ' + r.status);
    const arr = await r.json();
    return arr[0] || null;
  }
  async function sbUpsertRow(payload, ts) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
    const body = { id: STATE_ID, payload: payload, updated_at: ts, device: DEVICE_ID };
    const r = await fetch(url, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body)
    });
    if (r.status === 404) throw new Error('TABLE_MISSING');
    if (!r.ok) throw new Error('UPSERT ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }

  // ---- 推送（防抖） ----
  let pushTimer = null;
  let cloudEnabled = true;
  let cloudHintShown = false;
  function schedulePush() {
    if (!navigator.onLine) { setStatus('offline'); return; }
    if (!cloudEnabled) { setStatus('config'); return; }
    setStatus('local');
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 1200);
  }
  async function doPush() {
    if (!navigator.onLine) { setStatus('offline'); return; }
    const ts = new Date().toISOString();
    try {
      await sbUpsertRow(data, ts);
      const m = loadMeta();
      m.syncedAt = ts;
      m.localModified = ts;
      saveMeta(m);
      setStatus('online');
    } catch (e) {
      if (e.message === 'TABLE_MISSING') { cloudEnabled = false; showCloudHint(); setStatus('config'); }
      else setStatus(navigator.onLine ? 'local' : 'offline');
    }
  }

  // ---- 拉取 / 合并（仅首屏；重连时只上传本地） ----
  let firstInit = true;
  async function initCloud() {
    if (!navigator.onLine) { setStatus('offline'); return; }
    if (firstInit) {
      firstInit = false;
      await pullThenMaybePush();
    } else {
      await doPush(); // 重连：把离线期间的本地编辑上传
    }
  }
  async function pullThenMaybePush() {
    try {
      const row = await sbGetRow();
      const meta = loadMeta();
      const syncedAt = meta.syncedAt ? Date.parse(meta.syncedAt) : 0;
      const localMod = meta.localModified ? Date.parse(meta.localModified) : 0;
      if (row) {
        const remoteTs = row.updated_at ? Date.parse(row.updated_at) : 0;
        if (remoteTs > syncedAt && localMod <= syncedAt) {
          // 远端更新且本地无未同步改动 → 采用远端
          localStorage.setItem(DB_KEY, JSON.stringify(row.payload || {}));
          saveMeta({ syncedAt: row.updated_at, localModified: row.updated_at, device: row.device });
          setStatus('online');
          location.reload();
          return;
        }
        // 否则以本地为准，上传覆盖
        await doPush();
      } else {
        await doPush(); // 远端无记录 → 上传本地
      }
    } catch (e) {
      if (e.message === 'TABLE_MISSING') { cloudEnabled = false; showCloudHint(); setStatus('config'); }
      else setStatus(navigator.onLine ? 'local' : 'offline');
    }
  }
  function showCloudHint() {
    const el = document.getElementById('cloud-hint');
    if (el && !cloudHintShown) { cloudHintShown = true; el.style.display = 'flex'; }
  }

  window.addEventListener('offline', () => setStatus('offline'));
  window.addEventListener('online', () => { initCloud(); });

  // ---- 导航 ----
  const tabs = document.querySelectorAll('nav.tabbar button');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('main .section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + b.dataset.sec).classList.add('active');
  }));

  // ---- 减脂：今日打卡 ----
  const weightInput = document.getElementById('weight-input');
  const waterInput = document.getElementById('water-input');
  const dashWeight = document.getElementById('dash-weight');
  const dashWater = document.getElementById('dash-water');
  const dashBinge = document.getElementById('dash-binge');
  const dashMood = document.getElementById('dash-mood');
  const todayCheckin = ensure(data, 'weights', {})[TODAY] || (data.weights[TODAY] = { weight: '', water: '', binge: [], mood: '' });

  // 把今日打卡回填到所有输入控件（生活 tab + 驾驶舱），保持双向同步
  function renderCheckinUI() {
    const w = todayCheckin.weight || '';
    const wa = todayCheckin.water || '';
    const mo = todayCheckin.mood || '';
    const bi = (todayCheckin.binge && todayCheckin.binge.length) ? 'yes' : 'no';
    if (weightInput) weightInput.value = w;
    if (waterInput) waterInput.value = wa;
    if (dashWeight) dashWeight.value = w;
    if (dashWater) dashWater.value = wa;
    if (dashMood) dashMood.value = mo;
    if (dashBinge) dashBinge.value = bi;
    renderBinges();
  }
  function setCheckinField(field, val) {
    if (field === 'weight') todayCheckin.weight = val;
    else if (field === 'water') todayCheckin.water = val;
    else if (field === 'mood') todayCheckin.mood = val;
    else if (field === 'binge') {
      if (val === 'yes' && !(todayCheckin.binge && todayCheckin.binge.length)) {
        (todayCheckin.binge = todayCheckin.binge || []).push({ time: '', food: '暴食(驾驶舱标记)', mood: '', cause: '' });
      } else if (val === 'no') {
        todayCheckin.binge = [];
      }
    }
    save(); renderCheckinUI(); refreshKPI(); renderTrend();
  }
  if (weightInput) weightInput.addEventListener('change', () => setCheckinField('weight', weightInput.value));
  if (waterInput) waterInput.addEventListener('change', () => setCheckinField('water', waterInput.value));
  if (dashWeight) dashWeight.addEventListener('change', () => setCheckinField('weight', dashWeight.value));
  if (dashWater) dashWater.addEventListener('change', () => setCheckinField('water', dashWater.value));
  if (dashMood) dashMood.addEventListener('change', () => setCheckinField('mood', dashMood.value));
  if (dashBinge) dashBinge.addEventListener('change', () => setCheckinField('binge', dashBinge.value));
  function fillCheckin() { renderCheckinUI(); }

  document.getElementById('save-checkin').addEventListener('click', () => {
    todayCheckin.weight = weightInput.value;
    todayCheckin.water = waterInput.value;
    save(); renderCheckinUI(); refreshKPI(); renderTrend();
    flash('已保存今日打卡');
  });

  // 暴食
  const bingeForm = document.getElementById('binge-form');
  document.getElementById('binge-toggle').addEventListener('click', () => {
    bingeForm.style.display = bingeForm.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('add-binge').addEventListener('click', () => {
    const b = {
      time: document.getElementById('binge-time').value.trim(),
      food: document.getElementById('binge-food').value.trim(),
      mood: document.getElementById('binge-mood').value.trim(),
      cause: document.getElementById('binge-cause').value.trim()
    };
    if (!b.food && !b.time) return flash('至少填时间或食物');
    (todayCheckin.binge = todayCheckin.binge || []).push(b);
    save(); renderBinges();
    document.getElementById('binge-time').value = '';
    document.getElementById('binge-food').value = '';
    document.getElementById('binge-mood').value = '';
    document.getElementById('binge-cause').value = '';
  });
  function renderBinges() {
    const box = document.getElementById('binge-list');
    const arr = todayCheckin.binge || [];
    if (!arr.length) { box.innerHTML = ''; return; }
    box.innerHTML = arr.map((b, i) =>
      `<div class="item"><div class="body"><div>${b.food || '暴食'} ${b.time ? '· ' + b.time : ''}</div>` +
      `<div class="meta">情绪:${b.mood || '—'} 诱因:${b.cause || '—'}</div></div>` +
      `<button class="del" data-i="${i}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      arr.splice(+d.dataset.i, 1); save(); renderBinges();
    });
  }

  // ---- 饮食 ----
  const diets = ensure(data, 'diets', {});
  diets[TODAY] = diets[TODAY] || [];
  document.getElementById('add-diet').addEventListener('click', () => {
    const c = document.getElementById('diet-content').value.trim();
    if (!c) return;
    diets[TODAY].push({ meal: document.getElementById('diet-meal').value, content: c });
    document.getElementById('diet-content').value = '';
    save(); renderDiets(); renderDashDiets();
  });
  function renderDiets() {
    const box = document.getElementById('diet-list');
    const arr = diets[TODAY];
    if (!arr.length) { box.innerHTML = '<div class="empty">今天还没有饮食记录</div>'; return; }
    box.innerHTML = arr.map((d, i) =>
      `<div class="item"><div class="body"><div><b>${d.meal}</b> ${escapeHtml(d.content)}</div></div>` +
      `<button class="del" data-i="${i}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(x => x.onclick = () => {
      arr.splice(+x.dataset.i, 1); save(); renderDiets(); renderDashDiets();
    });
  }
  function renderDashDiets() {
    const box = document.getElementById('dash-diet-list');
    if (!box) return;
    const arr = diets[TODAY];
    if (!arr.length) { box.innerHTML = '<div class="empty">今天还没吃</div>'; return; }
    box.innerHTML = arr.map((d, i) =>
      `<div class="item"><div class="body"><div><b>${d.meal}</b> ${escapeHtml(d.content)}</div></div>` +
      `<button class="del" data-i="${i}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(x => x.onclick = () => {
      arr.splice(+x.dataset.i, 1); save(); renderDiets(); renderDashDiets();
    });
  }

  // ---- 健身 ----
  const fitness = ensure(data, 'fitness', {});
  fitness[TODAY] = fitness[TODAY] || [];
  document.getElementById('add-fitness').addEventListener('click', () => {
    const p = document.getElementById('fitness-project').value;
    const m = parseInt(document.getElementById('fitness-min').value, 10);
    if (!m || m <= 0) return flash('填训练时长');
    fitness[TODAY].push({ project: p, min: m });
    document.getElementById('fitness-min').value = '';
    save(); renderFitness();
  });
  function monthKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }
  function renderFitness() {
    const arr = fitness[TODAY];
    const box = document.getElementById('fitness-list');
    const stat = document.getElementById('fitness-stat');
    // 本月统计
    let cnt = 0, mins = 0;
    Object.keys(fitness).forEach(k => {
      if (k.startsWith(monthKey())) fitness[k].forEach(f => { cnt++; mins += f.min; });
    });
    stat.textContent = `本月累计：${cnt} 次 · ${mins} 分钟`;
    if (!arr.length) { box.innerHTML = '<div class="empty">今天还没打卡</div>'; return; }
    box.innerHTML = arr.map((f, i) =>
      `<div class="item"><div class="body"><div>${f.project}</div><div class="meta">${f.min} 分钟</div></div>` +
      `<button class="del" data-i="${i}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(x => x.onclick = () => {
      arr.splice(+x.dataset.i, 1); save(); renderFitness();
    });
  }

  // ---- 待办（按日期折叠） ----
  const todos = ensure(data, 'todos', []);
  document.getElementById('add-todo').addEventListener('click', addTodo);
  document.getElementById('todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
  function addTodo() {
    const t = document.getElementById('todo-input').value.trim();
    if (!t) return;
    todos.unshift({ id: Date.now(), text: t, done: false, date: TODAY });
    document.getElementById('todo-input').value = '';
    save(); renderTodos(); renderDashTodos(); refreshKPI();
  }
  function addTodoFromDash() {
    const t = document.getElementById('dash-todo-input').value.trim();
    if (!t) return;
    todos.unshift({ id: Date.now(), text: t, done: false, date: TODAY });
    document.getElementById('dash-todo-input').value = '';
    save(); renderTodos(); renderDashTodos(); refreshKPI();
  }
  function renderDashTodos() {
    const box = document.getElementById('dash-todo-list');
    if (!box) return;
    const arr = todos.filter(t => t.date === TODAY);
    if (!arr.length) { box.innerHTML = '<div class="empty">今天还没有待办</div>'; return; }
    box.innerHTML = arr.map(t =>
      `<div class="item ${t.done ? 'done' : ''}"><div class="check ${t.done ? 'done' : ''}" data-id="${t.id}">${t.done ? '✓' : ''}</div>` +
      `<div class="body">${escapeHtml(t.text)}</div><button class="del" data-id="${t.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.check').forEach(c => c.onclick = () => {
      const t = todos.find(x => x.id == c.dataset.id); t.done = !t.done; save(); renderTodos(); renderDashTodos(); refreshKPI();
    });
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = todos.findIndex(x => x.id == d.dataset.id); todos.splice(i, 1); save(); renderTodos(); renderDashTodos(); refreshKPI();
    });
  }
  function renderTodos() {
    const box = document.getElementById('todo-groups');
    if (!todos.length) { box.innerHTML = '<div class="empty">暂无待办</div>'; return; }
    const groups = {};
    todos.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
    const keys = Object.keys(groups).sort().reverse();
    box.innerHTML = keys.map(k => {
      const items = groups[k].map(t =>
        `<div class="item ${t.done ? 'done' : ''}"><div class="check ${t.done ? 'done' : ''}" data-id="${t.id}">${t.done ? '✓' : ''}</div>` +
        `<div class="body">${escapeHtml(t.text)}</div><button class="del" data-id="${t.id}">×</button></div>`
      ).join('');
      return `<div class="day-group"><div class="day-head" data-k="${k}"><span>${prettyDate(k)}</span>` +
        `<span class="count">${groups[k].length} 项</span></div><div class="day-body">${items}</div></div>`;
    }).join('');
    box.querySelectorAll('.day-head').forEach(h => h.onclick = () => {
      const b = h.nextElementSibling; b.classList.toggle('collapsed');
    });
    box.querySelectorAll('.check').forEach(c => c.onclick = () => {
      const t = todos.find(x => x.id == c.dataset.id); t.done = !t.done; save(); renderTodos(); renderDashTodos(); refreshKPI();
    });
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = todos.findIndex(x => x.id == d.dataset.id); todos.splice(i, 1); save(); renderTodos(); renderDashTodos(); refreshKPI();
    });
  }

  // ---- 复盘（可编辑，里里侧也可写入） ----
  const reviews = ensure(data, 'reviews', []);
  document.getElementById('add-review').addEventListener('click', () => {
    const content = document.getElementById('review-content').value.trim();
    if (!content) return flash('写点内容吧');
    reviews.unshift({ id: Date.now(), date: TODAY, type: document.getElementById('review-type').value, content, source: 'app' });
    document.getElementById('review-content').value = '';
    save(); renderReviews();
  });
  function renderReviews() {
    const box = document.getElementById('review-list');
    if (!box) return;
    if (!reviews.length) { box.innerHTML = '<div class="empty">还没有复盘记录</div>'; return; }
    box.innerHTML = reviews.map(r =>
      `<div class="item"><div class="body"><div><span class="tag">${r.type || '复盘'}</span>${escapeHtml(r.content)}</div>` +
      `<div class="meta">${prettyDate(r.date)}${r.source === '里里' ? ' · 来自里里' : ''}</div></div>` +
      `<button class="del" data-id="${r.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = reviews.findIndex(x => x.id == d.dataset.id); reviews.splice(i, 1); save(); renderReviews();
    });
  }

  // ---- 来自里里（对话中帮你记的数据收件箱） ----
  const inbox = ensure(data, '_inbox', []);
  function renderInbox() {
    const box = document.getElementById('inbox-list');
    if (!box) return;
    if (!inbox.length) { box.innerHTML = '<div class="empty">里里同步的记录会显示在这里</div>'; return; }
    box.innerHTML = inbox.slice(0, 8).map(r =>
      `<div class="item"><div class="body"><div><span class="tag">${r.board || '通用'}</span>${escapeHtml(r.content)}</div>` +
      `<div class="meta">${prettyDate(r.date)}</div></div>` +
      `<button class="del" data-id="${r.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = inbox.findIndex(x => x.id == d.dataset.id); inbox.splice(i, 1); save(); renderInbox();
    });
  }

  // ---- 手动拉取云端（里里写入的最新数据） ----
  document.getElementById('sync-btn').addEventListener('click', pullUpdates);
  async function pullUpdates() {
    if (!navigator.onLine) { setStatus('offline'); return; }
    try {
      const row = await sbGetRow();
      if (!row) return flash('云端暂无数据');
      const meta = loadMeta();
      const syncedAt = meta.syncedAt ? Date.parse(meta.syncedAt) : 0;
      const localMod = meta.localModified ? Date.parse(meta.localModified) : 0;
      const remoteTs = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (remoteTs > syncedAt && remoteTs >= localMod) {
        localStorage.setItem(DB_KEY, JSON.stringify(row.payload || {}));
        saveMeta({ syncedAt: row.updated_at, localModified: row.updated_at, device: row.device });
        setStatus('online');
        flash('已拉取里里的最新记录，刷新中…');
        setTimeout(() => location.reload(), 700);
      } else {
        flash('已是最新');
      }
    } catch (e) { console.warn('pull 失败', e); flash('同步失败，稍后再试'); }
  }

  // ---- GEO 创业业务（客户台账 + GEO 动态，里里侧也可写入） ----
  const clients = ensure(data, 'clients', []);
  const geoNotes = ensure(data, 'geo_notes', []);
  function geoFiltered() {
    const q = (document.getElementById('geo-search').value || '').trim().toLowerCase();
    const f = document.getElementById('geo-filter').value;
    return clients.filter(c => {
      if (f && c.status !== f) return false;
      if (q && !(c.name + ' ' + (c.industry || '')).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderClients() {
    const box = document.getElementById('geo-list');
    if (!box) return;
    const arr = geoFiltered();
    if (!arr.length) { box.innerHTML = '<div class="empty">还没有客户' + (clients.length ? '（无匹配）' : '，去下方添加，或让里里同步') + '</div>'; return; }
    box.innerHTML = arr.map(c =>
      `<div class="item"><div class="body"><div><span class="tag">${c.status || '意向'}</span><b>${escapeHtml(c.name)}</b></div>` +
      `<div class="meta">${c.contact ? '对接 ' + escapeHtml(c.contact) + ' · ' : ''}${c.industry ? escapeHtml(c.industry) + ' · ' : ''}下一步：${escapeHtml(c.next || '—')}</div></div>` +
      `<button class="del" data-id="${c.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = clients.findIndex(x => x.id == d.dataset.id); clients.splice(i, 1); save(); renderClients();
    });
  }
  document.getElementById('add-client').addEventListener('click', () => {
    const name = document.getElementById('geo-name').value.trim();
    if (!name) return flash('填客户名');
    clients.unshift({
      id: Date.now(), name,
      status: document.getElementById('geo-status').value,
      contact: document.getElementById('geo-contact').value.trim(),
      industry: document.getElementById('geo-industry').value.trim(),
      next: document.getElementById('geo-next').value.trim(),
      updated: TODAY, source: 'app'
    });
    ['geo-name', 'geo-contact', 'geo-industry', 'geo-next'].forEach(i => document.getElementById(i).value = '');
    save(); renderClients();
  });
  document.getElementById('geo-search').addEventListener('input', renderClients);
  document.getElementById('geo-filter').addEventListener('change', renderClients);
  function renderGeoNotes() {
    const box = document.getElementById('geo-notes-list');
    if (!box) return;
    if (!geoNotes.length) { box.innerHTML = '<div class="empty">还没有 GEO 动态</div>'; return; }
    box.innerHTML = geoNotes.slice(0, 20).map(n =>
      `<div class="item"><div class="body"><div><span class="tag">${escapeHtml(n.client || '通用')}</span>${escapeHtml(n.note)}</div>` +
      `<div class="meta">${prettyDate(n.date)}${n.source === '里里' ? ' · 来自里里' : ''}</div></div>` +
      `<button class="del" data-id="${n.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = geoNotes.findIndex(x => x.id == d.dataset.id); geoNotes.splice(i, 1); save(); renderGeoNotes();
    });
  }
  document.getElementById('add-geo-note').addEventListener('click', () => {
    const note = document.getElementById('geo-note-content').value.trim();
    if (!note) return flash('写点内容');
    geoNotes.unshift({ id: Date.now(), date: TODAY, client: document.getElementById('geo-note-client').value.trim() || '通用', note, source: 'app' });
    document.getElementById('geo-note-content').value = '';
    save(); renderGeoNotes();
  });

  // ---- 体重趋势 ----
  function renderTrend() {
    const cv = document.getElementById('trend-canvas');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 160;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const entries = Object.keys(data.weights || {})
      .filter(k => data.weights[k].weight)
      .sort()
      .map(k => ({ k, v: parseFloat(data.weights[k].weight) }));
    if (entries.length < 1) { ctx.fillStyle = '#9a9aab'; ctx.font = '13px sans-serif'; ctx.fillText('录入体重后显示趋势', 12, h / 2); return; }
    const vals = entries.map(e => e.v);
    const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
    const px = i => entries.length === 1 ? w / 2 : 30 + i * (w - 60) / (entries.length - 1);
    const py = v => h - 20 - (v - min) / (max - min) * (h - 40);
    ctx.strokeStyle = '#ff5c8a'; ctx.lineWidth = 2; ctx.beginPath();
    entries.forEach((e, i) => { const x = px(i), y = py(e.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#ff5c8a';
    entries.forEach((e, i) => { ctx.beginPath(); ctx.arc(px(i), py(e.v), 3.5, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#9a9aab'; ctx.font = '10px sans-serif';
    entries.forEach((e, i) => { if (i % Math.ceil(entries.length / 6) === 0) ctx.fillText(e.k.slice(5), px(i) - 12, h - 6); });
  }

  // ---- 本月统计（驾驶舱） ----
  function refreshKPI() {
    let fc = 0; Object.keys(fitness).forEach(k => { if (k.startsWith(monthKey())) fc += fitness[k].length; });
    const df = document.getElementById('dash-fitness'); if (df) df.textContent = fc;
    const dt = document.getElementById('dash-todo-count'); if (dt) dt.textContent = todos.filter(t => !t.done).length;
  }

  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function flash(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#2a2a37;color:#ececf1;padding:8px 16px;border-radius:999px;font-size:13px;z-index:50;border:1px solid #353545';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ---- 初始化 ----
  document.getElementById('today-date').textContent = '· ' + prettyDate(TODAY);
  setStatus('local');
  fillCheckin(); renderDiets(); renderFitness(); renderTodos(); renderDashTodos(); renderDashDiets(); renderReviews(); renderInbox(); renderClients(); renderGeoNotes(); refreshKPI(); renderTrend();

  // 驾驶舱：今日待办 / 饮食快捷编辑
  document.getElementById('dash-add-todo').addEventListener('click', addTodoFromDash);
  document.getElementById('dash-todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodoFromDash(); });
  document.getElementById('dash-add-diet').addEventListener('click', () => {
    const c = document.getElementById('dash-diet-content').value.trim();
    if (!c) return;
    diets[TODAY].push({ meal: document.getElementById('dash-diet-meal').value, content: c });
    document.getElementById('dash-diet-content').value = '';
    save(); renderDiets(); renderDashDiets();
  });
  // 三大板块导航跳转
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    const sec = b.dataset.goto;
    document.querySelectorAll('nav.tabbar button').forEach(x => x.classList.remove('active'));
    const tb = document.querySelector('nav.tabbar button[data-sec="' + sec + '"]');
    if (tb) tb.click();
  }));

  initCloud();

  // ---- Service Worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW 注册失败:', e));
    });
  }

  // 暴露给后续阶段（GEO/学习/AI 研讨）接入的钩子
  window.__STELLA__ = {
    data, save, initCloud, doPush,
    setStatus,
    renderAll: () => { fillCheckin(); renderDiets(); renderFitness(); renderTodos(); renderDashTodos(); renderDashDiets(); renderReviews(); renderInbox(); renderClients(); renderGeoNotes(); refreshKPI(); renderTrend(); }
  };
})();
