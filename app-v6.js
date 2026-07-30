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
  let selectedDate = TODAY;

  function prettyDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return `${m}月${d}日 周${WEEK[new Date(y, m - 1, d).getDay()]}`;
  }
  function isFutureDate(s) {
    return s > TODAY;
  }
  function setSelectedDate(d) {
    selectedDate = d;
    document.querySelectorAll('.global-date-picker').forEach(el => { if (el.value !== d) el.value = d; });
    document.querySelectorAll('.date-label').forEach(el => el.textContent = prettyDate(d));
    fillCheckin(); renderDiets(); renderFitness(); renderTodos(); renderDashTodos(); renderDashDiets(); renderReviews(); renderLearns(); refreshKPI(); renderTrend(); renderNews(); renderTaskCenter(); renderFatlossGoals(); renderFinance(); renderMacro(); renderBooks(); renderChat();
    updateReadonlyState();
  }
  function updateReadonlyState() {
    const isToday = selectedDate === TODAY;
    document.body.classList.toggle('viewing-history', !isToday);
    document.querySelectorAll('.readonly-when-history').forEach(el => {
      el.disabled = !isToday;
      el.title = isToday ? '' : '切回今天才能编辑哦';
    });
    // 历史日期下禁用所有表单输入（配置面板和日期选择器除外）
    document.querySelectorAll('input:not(.date-picker):not([type="checkbox"]):not([type="radio"]), select:not(.date-picker), textarea').forEach(el => {
      if (!el.closest('.config-panel') && !el.closest('#fatloss-goals-overlay')) el.disabled = !isToday;
    });
  }
  function currentCheckin() {
    const w = ensure(data, 'weights', {});
    return w[selectedDate] || (w[selectedDate] = { weight: '', water: '', binge: [], mood: '' });
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

  // ---- 减脂阶段目标 ----
  const DEFAULT_GOALS = { height: 157, startWeight: 130, shortTarget: 115, shortDate: '2026-08-20', midTarget: 105, midDate: '2026-09-30' };
  const goals = ensure(data, 'fatlossGoals', { ...DEFAULT_GOALS });
  function daysUntil(s) { const t = Date.parse(s + 'T00:00:00'); const d = Date.now(); const diff = Math.ceil((t - d) / 86400000); return diff; }
  function bmi(weightJin) { const kg = weightJin / 2; const m = (goals.height || 157) / 100; return (kg / (m * m)).toFixed(1); }
  function latestWeight() {
    const w = data.weights || {};
    const keys = Object.keys(w).filter(k => w[k] && w[k].weight).sort();
    return keys.length ? parseFloat(w[keys[keys.length - 1]].weight) : (goals.startWeight || 130);
  }
  function fmtProgress(cur, start, target) {
    if (target >= start) return 0;
    const lost = start - cur;
    const total = start - target;
    if (total <= 0) return 0;
    const p = Math.max(0, Math.min(100, lost / total * 100));
    return Math.round(p);
  }
  function renderFatlossGoals() {
    const cur = latestWeight();
    const lost = +(cur - (goals.startWeight || 130)).toFixed(1);
    const absLost = Math.abs(lost);
    const shortDays = daysUntil(goals.shortDate);
    const midDays = daysUntil(goals.midDate);
    const shortProgress = fmtProgress(cur, goals.startWeight, goals.shortTarget);
    const midProgress = fmtProgress(cur, goals.startWeight, goals.midTarget);
    const elCur = document.getElementById('fg-current'); if (elCur) elCur.textContent = cur;
    const elLost = document.getElementById('fg-lost'); if (elLost) elLost.textContent = (lost <= 0 ? '' : '+') + lost;
    const elProg = document.getElementById('fg-progress'); if (elProg) elProg.textContent = shortProgress + '%';
    const elBmi = document.getElementById('fg-bmi'); if (elBmi) elBmi.textContent = bmi(cur);
    const elShortLabel = document.getElementById('fg-short-label'); if (elShortLabel) elShortLabel.textContent = `短期 ${goals.shortDate.slice(5)}`;
    const elShortBar = document.getElementById('fg-short-bar'); if (elShortBar) elShortBar.style.width = shortProgress + '%';
    const elShortVal = document.getElementById('fg-short-val'); if (elShortVal) elShortVal.textContent = goals.shortTarget + '斤';
    const elMidLabel = document.getElementById('fg-mid-label'); if (elMidLabel) elMidLabel.textContent = `中期 ${goals.midDate.slice(5)}`;
    const elMidBar = document.getElementById('fg-mid-bar'); if (elMidBar) elMidBar.style.width = midProgress + '%';
    const elMidVal = document.getElementById('fg-mid-val'); if (elMidVal) elMidVal.textContent = goals.midTarget + '斤';
    const elCd = document.getElementById('fg-countdown'); if (elCd) elCd.textContent = `短期剩 ${shortDays} 天 · 中期剩 ${midDays} 天`;
  }
  function openFatlossGoalsEditor() {
    document.getElementById('fg-in-height').value = goals.height;
    document.getElementById('fg-in-start').value = goals.startWeight;
    document.getElementById('fg-in-short-target').value = goals.shortTarget;
    document.getElementById('fg-in-short-date').value = goals.shortDate;
    document.getElementById('fg-in-mid-target').value = goals.midTarget;
    document.getElementById('fg-in-mid-date').value = goals.midDate;
    document.getElementById('fatloss-goals-overlay').style.display = 'flex';
  }
  function closeFatlossGoalsEditor() { document.getElementById('fatloss-goals-overlay').style.display = 'none'; }
  function saveFatlossGoals() {
    goals.height = parseInt(document.getElementById('fg-in-height').value, 10) || 157;
    goals.startWeight = parseFloat(document.getElementById('fg-in-start').value) || 130;
    goals.shortTarget = parseFloat(document.getElementById('fg-in-short-target').value) || 115;
    goals.shortDate = document.getElementById('fg-in-short-date').value || '2026-08-20';
    goals.midTarget = parseFloat(document.getElementById('fg-in-mid-target').value) || 105;
    goals.midDate = document.getElementById('fg-in-mid-date').value || '2026-09-30';
    save(); renderFatlossGoals(); closeFatlossGoalsEditor(); flash('减脂目标已更新');
  }
  document.getElementById('fatloss-edit-goals').addEventListener('click', openFatlossGoalsEditor);
  document.getElementById('fatloss-goals-close').addEventListener('click', closeFatlossGoalsEditor);
  document.getElementById('fatloss-goals-cancel').addEventListener('click', closeFatlossGoalsEditor);
  document.getElementById('fatloss-goals-save').addEventListener('click', saveFatlossGoals);
  document.getElementById('fatloss-goals-overlay').addEventListener('click', e => { if (e.target.id === 'fatloss-goals-overlay') closeFatlossGoalsEditor(); });

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
    renderTrend(); // 切换 tab 后重绘体重趋势（隐藏画布宽度恢复为 0 时需重新绘制）
  }));

  // ---- 减脂：今日打卡 ----
  const weightInput = document.getElementById('weight-input');
  const waterInput = document.getElementById('water-input');
  const dashWeight = document.getElementById('dash-weight');
  const dashWater = document.getElementById('dash-water');
  const dashBinge = document.getElementById('dash-binge');
  const dashMood = document.getElementById('dash-mood');
  // 今日打卡对象（初始化占位，实际渲染随 selectedDate 变化）
  ensure(data, 'weights', {})[TODAY] = ensure(data, 'weights', {})[TODAY] || { weight: '', water: '', binge: [], mood: '' };

  // 把今日打卡回填到所有输入控件（生活 tab + 驾驶舱），保持双向同步
  function renderCheckinUI() {
    const w = currentCheckin().weight || '';
    const wa = currentCheckin().water || '';
    const mo = currentCheckin().mood || '';
    const bi = (currentCheckin().binge && currentCheckin().binge.length) ? 'yes' : 'no';
    if (weightInput) weightInput.value = w;
    if (waterInput) waterInput.value = wa;
    if (dashWeight) dashWeight.value = w;
    if (dashWater) dashWater.value = wa;
    if (dashMood) dashMood.value = mo;
    if (dashBinge) dashBinge.value = bi;
    renderBinges();
  }
  function setCheckinField(field, val) {
    if (field === 'weight') currentCheckin().weight = val;
    else if (field === 'water') currentCheckin().water = val;
    else if (field === 'mood') currentCheckin().mood = val;
    else if (field === 'binge') {
      if (val === 'yes' && !(currentCheckin().binge && currentCheckin().binge.length)) {
        (currentCheckin().binge = currentCheckin().binge || []).push({ time: '', food: '暴食(驾驶舱标记)', mood: '', cause: '' });
      } else if (val === 'no') {
        currentCheckin().binge = [];
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
    currentCheckin().weight = weightInput.value;
    currentCheckin().water = waterInput.value;
    save(); renderCheckinUI(); refreshKPI(); renderTrend(); renderFatlossGoals();
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
    (currentCheckin().binge = currentCheckin().binge || []).push(b);
    save(); renderBinges();
    document.getElementById('binge-time').value = '';
    document.getElementById('binge-food').value = '';
    document.getElementById('binge-mood').value = '';
    document.getElementById('binge-cause').value = '';
  });
  function renderBinges() {
    const box = document.getElementById('binge-list');
    const arr = currentCheckin().binge || [];
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
  diets[selectedDate] = diets[selectedDate] || [];
  document.getElementById('add-diet').addEventListener('click', () => {
    const c = document.getElementById('diet-content').value.trim();
    if (!c) return;
    diets[selectedDate].push({ meal: document.getElementById('diet-meal').value, content: c });
    document.getElementById('diet-content').value = '';
    save(); renderDiets(); renderDashDiets();
  });
  function renderDiets() {
    const box = document.getElementById('diet-list');
    const arr = diets[selectedDate];
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
    const arr = diets[selectedDate];
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
  fitness[selectedDate] = fitness[selectedDate] || [];
  document.getElementById('add-fitness').addEventListener('click', () => {
    const p = document.getElementById('fitness-project').value;
    const m = parseInt(document.getElementById('fitness-min').value, 10);
    if (!m || m <= 0) return flash('填训练时长');
    fitness[selectedDate].push({ project: p, min: m });
    document.getElementById('fitness-min').value = '';
    save(); renderFitness();
  });
  function monthKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }
  function renderFitness() {
    const arr = fitness[selectedDate];
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
    todos.unshift({ id: Date.now(), text: t, done: false, date: selectedDate });
    document.getElementById('todo-input').value = '';
    save(); renderTodos(); renderDashTodos(); refreshKPI();
  }
  function addTodoFromDash() {
    const t = document.getElementById('dash-todo-input').value.trim();
    if (!t) return;
    todos.unshift({ id: Date.now(), text: t, done: false, date: selectedDate });
    document.getElementById('dash-todo-input').value = '';
    save(); renderTodos(); renderDashTodos(); refreshKPI();
  }
  function renderDashTodos() {
    const box = document.getElementById('dash-todo-list');
    if (!box) return;
    const arr = todos.filter(t => t.date === selectedDate);
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
    reviews.unshift({ id: Date.now(), date: selectedDate, type: document.getElementById('review-type').value, content, source: 'app' });
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
  // ---- 任务中心（里里从对话同步的业务种子，云端 biz_inbox，采纳后落地本地业务模块） ----
  const bizInbox = ensure(data, 'biz_inbox', []);
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

  // ---- 任务中心（里里同步来的业务待办） ----
  function renderTaskCenter() {
    const card = document.getElementById('task-center');
    if (!card) return;
    const box = document.getElementById('task-list');
    const badge = document.getElementById('task-count');
    const list = (data.biz_inbox || []).filter(s => !s.adopted);
    if (badge) badge.textContent = list.length;
    if (!list.length) {
      box.innerHTML = '<div class="empty">暂无待办 · 里里在对话里帮你记的会议 / PPT / 客户 / 公众号素材会出现在这里</div>';
      return;
    }
    const icons = { client: '💼', meeting: '🎤', ppt: '📁', material: '📣' };
    const labels = { client: '客户', meeting: '会议', ppt: 'PPT', material: '素材' };
    box.innerHTML = list.slice(0, 12).map(s =>
      `<div class="item task-item" data-id="${s.id}">
        <div class="body">
          <div><span class="tag">${icons[s.type] || '📌'} ${labels[s.type] || '任务'}</span><b>${escapeHtml(s.title || '(无标题)')}</b></div>
          <div class="meta">${escapeHtml(s.summary || '')}${s.created ? ' · ' + escapeHtml(s.created) : ''}</div>
        </div>
        <div class="task-actions">
          <button class="sm primary" data-act="adopt" data-id="${s.id}">采纳</button>
          <button class="sm" data-act="ignore" data-id="${s.id}">忽略</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const id = b.dataset.id, act = b.dataset.act;
      const i = (data.biz_inbox || []).findIndex(x => String(x.id) === String(id));
      if (i < 0) return;
      if (act === 'adopt') {
        const seed = data.biz_inbox[i];
        const res = (window.__BIZ__ && window.__BIZ__.adoptSeed) ? window.__BIZ__.adoptSeed(seed) : { ok: false };
        if (res.ok) {
          data.biz_inbox.splice(i, 1); save(); renderTaskCenter();
          const nameMap = { clients: '客户台账', meeting: '会议中心', ppt: 'PPT物料', content: '内容运维' };
          flash('已采纳 → 落入业务模块「' + (nameMap[res.tab] || '业务') + '」');
          if (res.tab) setTimeout(() => { if (window.__BIZ__) window.__BIZ__.openBiz(res.tab); }, 350);
          return;
        }
        flash('采纳失败：' + (res.err || '业务模块未就绪，请刷新重试'));
      } else {
        data.biz_inbox.splice(i, 1); save(); renderTaskCenter(); flash('已忽略');
      }
    });
  }

  // ---- 学习专区 ----
  const learns = ensure(data, 'learns', []);
  const TRACKS = ['Agent 开发', 'GEO 知识与开发', '项目运营经营', '内心能量与情绪管理', '人生智慧与长期认知'];
  const TRACK_COLORS = ['#6aa9ff', '#ff6f9d', '#ffa94d', '#b08bff', '#4dd0e1'];
  function renderLearnTracks() {
    const box = document.getElementById('learn-tracks');
    if (!box) return;
    box.innerHTML = TRACKS.map((t, i) => {
      const list = learns.filter(x => x.track === t);
      const done = list.filter(x => x.status === '已掌握').length;
      const doing = list.filter(x => x.status === '进行中').length;
      const pending = list.filter(x => x.status === '想学').length;
      return `<div class="track-card" style="--tc:${TRACK_COLORS[i]}">` +
        `<div class="track-name">${t}</div>` +
        `<div class="track-num">${list.length}</div>` +
        `<div class="track-meta">已掌握 ${done} · 进行中 ${doing} · 想学 ${pending}</div>` +
        `<button class="track-add" data-track="${t}">＋ 记一条</button>` +
        `</div>`;
    }).join('');
    box.querySelectorAll('.track-add').forEach(b => b.onclick = () => {
      document.getElementById('learn-track').value = b.dataset.track;
      window.scrollTo({ top: document.getElementById('sec-study').offsetTop, behavior: 'smooth' });
    });
  }
  function renderLearns() {
    const box = document.getElementById('learn-list');
    const count = document.getElementById('learn-count');
    const fTrack = document.getElementById('learn-track-filter').value;
    const fStatus = document.getElementById('learn-status-filter').value;
    const fDateEl = document.getElementById('learn-list-date-filter');
    const fDate = fDateEl ? fDateEl.value : '';
    if (count) count.textContent = `共 ${learns.length} 条` + (fDate ? ` · ${prettyDate(fDate)}` : '');
    if (!box) return;
    const arr = learns.filter(x => {
      if (fTrack && x.track !== fTrack) return false;
      if (fStatus && x.status !== fStatus) return false;
      if (fDate && x.date !== fDate) return false;
      return true;
    });
    if (!arr.length) { box.innerHTML = '<div class="empty">还没有学习记录</div>'; return; }
    box.innerHTML = arr.map(l =>
      `<div class="item"><div class="body"><div><span class="tag">${escapeHtml(l.track)}</span><b>${escapeHtml(l.type)}</b> ${escapeHtml(l.title)}</div>` +
      `<div class="meta">${escapeHtml(l.status)} · ${prettyDate(l.date)}${l.note ? ' · ' + escapeHtml(l.note.slice(0, 40)) + (l.note.length > 40 ? '…' : '') : ''}</div></div>` +
      `<button class="del" data-id="${l.id}">×</button></div>`
    ).join('');
    box.querySelectorAll('.del').forEach(d => d.onclick = () => {
      const i = learns.findIndex(x => x.id == d.dataset.id); learns.splice(i, 1); save(); renderLearns(); renderLearnTracks();
    });
  }
  const addLearnBtn = document.getElementById('add-learn');
  if (addLearnBtn) addLearnBtn.addEventListener('click', () => {
    const title = document.getElementById('learn-title').value.trim();
    if (!title) return flash('填一下标题');
    learns.unshift({
      id: Date.now(),
      track: document.getElementById('learn-track').value,
      type: document.getElementById('learn-type').value,
      title,
      status: document.getElementById('learn-status').value,
      note: document.getElementById('learn-note').value.trim(),
      date: selectedDate,
      source: 'app'
    });
    document.getElementById('learn-title').value = '';
    document.getElementById('learn-note').value = '';
    save(); renderLearns(); renderLearnTracks();
  });
  const learnTrackFilter = document.getElementById('learn-track-filter');
  const learnStatusFilter = document.getElementById('learn-status-filter');
  const learnDateFilter = document.getElementById('learn-list-date-filter');
  if (learnTrackFilter) learnTrackFilter.addEventListener('change', renderLearns);
  if (learnStatusFilter) learnStatusFilter.addEventListener('change', renderLearns);
  if (learnDateFilter) learnDateFilter.addEventListener('change', renderLearns);

  // ---- AI 研讨窗口 ----
  const AI_CFG_KEY = 'stella-ai-config-v1';
  const chatHistory = ensure(data, 'ai_chat', []);
  let aiConfig = (() => { try { return JSON.parse(localStorage.getItem(AI_CFG_KEY)) || {}; } catch (e) { return {}; } })();
  function saveAiConfig() { localStorage.setItem(AI_CFG_KEY, JSON.stringify(aiConfig)); }
  function hasAiKey() { return !!(aiConfig.base && aiConfig.key && aiConfig.model); }

  function renderChat() {
    const box = document.getElementById('ai-chat-box');
    if (!box) return;
    if (!chatHistory.length) {
      box.innerHTML = '<div class="chat-welcome">👋 我是里里。可以问我今天减脂怎么样、工作怎么复盘，或点上方场景一键开始。</div>';
      return;
    }
    box.innerHTML = chatHistory.map(m =>
      `<div class="chat-msg ${m.role}">` +
      `<div class="chat-bubble">${escapeHtml(m.content)}</div>` +
      `<div class="chat-time">${m.time || ''}</div>` +
      `</div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
  }

  function aiContext() {
    const w = data.weights || {};
    const recentWeights = Object.keys(w).filter(k => w[k].weight).sort().slice(-7).map(k => `${k}: ${w[k].weight}斤`);
    const todayBinge = (currentCheckin().binge || []).map(b => `${b.time || ''} ${b.food || ''} 情绪:${b.mood || '—'} 诱因:${b.cause || '—'}`).join('；');
    const todayDiet = (diets[selectedDate] || []).map(d => `${d.meal} ${d.content}`).join('；');
    const todayFitness = (fitness[selectedDate] || []).map(f => `${f.project} ${f.min}分钟`).join('；');
    let monthCnt = 0, monthMins = 0;
    Object.keys(fitness).forEach(k => { if (k.startsWith(monthKey())) fitness[k].forEach(f => { monthCnt++; monthMins += f.min; }); });
    const undoneTodos = todos.filter(t => !t.done && t.date === selectedDate).map(t => t.text).join('；');
    const recentLearns = learns.slice(0, 5).map(l => `[${l.track}] ${l.status} ${l.title}`).join('；');
    const geo = data.geo_stats ? `活跃客户${data.geo_stats.total || 0}，已落地${data.geo_stats.landed || 0}，推进中${data.geo_stats.pipeline || 0}` : '暂无聚合数据';
    return [
      '你是里里，左星的数字搭档。请基于以下 Stella 工作台数据，用简洁、有主见、温暖的语气回答问题。不要过度寒暄，直接给 actionable 建议。',
      '',
      '【今日减脂打卡】',
      `体重：${currentCheckin().weight || '未记录'}斤 · 饮水：${currentCheckin().water || '未记录'}ml · 心情：${currentCheckin().mood || '未记录'} · 暴食：${todayBinge || '无'}`,
      '',
      '【最近体重趋势】',
      recentWeights.join('；') || '暂无',
      '',
      '【今日饮食】',
      todayDiet || '未记录',
      '',
      '【今日健身】',
      todayFitness || '未记录',
      '',
      '【本月健身累计】',
      `${monthCnt}次 · ${monthMins}分钟`,
      '',
      '【今日待办未完成】',
      undoneTodos || '无',
      '',
      '【最近学习记录】',
      recentLearns || '无',
      '',
      '【GEO 业务概况（脱敏）】',
      geo,
      '',
      '当前日期：' + TODAY
    ].join('\n');
  }

  function appendChat(role, content) {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    chatHistory.push({ role, content, time });
    if (chatHistory.length > 50) chatHistory.shift();
    save(); renderChat();
  }

  async function sendChat() {
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (!hasAiKey()) {
      document.getElementById('ai-key-bar').style.display = 'flex';
      document.getElementById('ai-config-panel').style.display = 'block';
      return flash('请先配置 AI 密钥');
    }
    input.value = '';
    appendChat('user', text);
    appendChat('assistant', '思考中…');
    const idx = chatHistory.length - 1;
    try {
      const messages = [
        { role: 'system', content: aiContext() },
        ...chatHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      ];
      const r = await fetch(aiConfig.base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiConfig.key },
        body: JSON.stringify({ model: aiConfig.model, messages, temperature: 0.7, max_tokens: 800 })
      });
      if (!r.ok) throw new Error('API ' + r.status);
      const j = await r.json();
      const reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!reply) throw new Error('空回复');
      chatHistory[idx].content = reply;
    } catch (e) {
      let hint = '请检查 API Base、Key 和网络。';
      if (e.message && e.message.includes('Failed to fetch')) {
        hint = '请求发不出去，通常是网络或跨域问题。';
        if (aiConfig.base.includes('openai.com')) hint += ' 你配的是 OpenAI 官方地址，在中国大陆可能直接连不上；建议换成硅基流动、DeepSeek、豆包等支持 CORS 的国内兼容接口。';
        else hint += ' 可尝试在配置面板换成支持浏览器跨域（CORS）的接口 Base。';
      }
      chatHistory[idx].content = '调用失败：' + e.message + '。' + hint;
    }
    save(); renderChat();
  }

  document.querySelectorAll('.ai-scenes .chip').forEach(b => {
    b.addEventListener('click', () => {
      const prompts = {
        fatigue: '基于我最近的数据，分析减脂进度并给出接下来3天可执行的调整建议。',
        diet: '帮我复盘今天的饮食，指出可能的问题并给出改进建议。',
        mood: '我最近心情有点起伏，能帮我疏导一下情绪吗？',
        work: '帮我复盘今天的工作和学习进展，看看哪些完成了、哪些需要推进。'
      };
      const input = document.getElementById('ai-chat-input');
      input.value = prompts[b.dataset.scene] || '';
      input.focus();
      if (hasAiKey()) sendChat();
    });
  });

  const aiSendBtn = document.getElementById('ai-chat-send');
  const aiInput = document.getElementById('ai-chat-input');
  if (aiSendBtn) aiSendBtn.addEventListener('click', sendChat);
  if (aiInput) aiInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  const keyBar = document.getElementById('ai-key-bar');
  const cfgPanel = document.getElementById('ai-config-panel');
  const cfgBtn = document.getElementById('ai-config-btn');
  const saveKeyBtn = document.getElementById('ai-save-key');
  if (keyBar) keyBar.style.display = hasAiKey() ? 'none' : 'flex';
  if (cfgBtn) cfgBtn.addEventListener('click', () => {
    cfgPanel.style.display = cfgPanel.style.display === 'none' ? 'block' : 'none';
    if (cfgPanel.style.display !== 'none') {
      document.getElementById('ai-base').value = aiConfig.base || 'https://api.openai.com/v1';
      document.getElementById('ai-key').value = aiConfig.key || '';
      document.getElementById('ai-model').value = aiConfig.model || 'gpt-4o-mini';
    }
  });
  if (saveKeyBtn) saveKeyBtn.addEventListener('click', () => {
    aiConfig = {
      base: document.getElementById('ai-base').value.trim().replace(/\/$/, ''),
      key: document.getElementById('ai-key').value.trim(),
      model: document.getElementById('ai-model').value.trim() || 'gpt-4o-mini'
    };
    saveAiConfig();
    cfgPanel.style.display = 'none';
    if (keyBar) keyBar.style.display = hasAiKey() ? 'none' : 'flex';
    flash('AI 配置已保存');
  });

  // ---- 资讯速览（阶段五：资讯自动抓取） ----
  const NEWS_CFG_KEY = 'stella-news-config-v1';
  const news = ensure(data, 'news', []);
  let newsConfig = (() => { try { return JSON.parse(localStorage.getItem(NEWS_CFG_KEY)) || {}; } catch (e) { return {}; } })();
  // 强制中文 GEO 为默认，忽略旧版 HN/英文回退配置，避免手机端拉到英文
  if (!newsConfig.mode || newsConfig.mode === 'hn' || newsConfig.mode === 'default') {
    newsConfig.mode = 'geo';
    try { localStorage.setItem(NEWS_CFG_KEY, JSON.stringify(newsConfig)); } catch (e) {}
  }
  function saveNewsConfig() { localStorage.setItem(NEWS_CFG_KEY, JSON.stringify(newsConfig)); }

  // 保险：若本地缓存仍是旧版英文 Hacker News，只清本地、不同步云端（避免覆盖里里推送的中文）
  (function cleanLegacyEnglishNews() {
    if (!Array.isArray(news) || !news.length) return;
    const hasHN = news.some(n => n && (n.source || '').toLowerCase().includes('hacker news'));
    if (hasHN) { news.length = 0; data.newsAsOf = ''; }
  })();

  function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }

  function renderNews() {
    const box = document.getElementById('news-list');
    const aof = document.getElementById('news-asof');
    if (aof) aof.textContent = data.newsAsOf ? '· ' + data.newsAsOf : '';
    if (!box) return;
    if (!news.length) { box.innerHTML = '<div class="empty">还没有资讯，点「⚡ 抓取最新」拉取</div>'; return; }
    box.innerHTML = news.slice(0, 10).map(n =>
      `<div class="item"><div class="body">` +
      (n.url ? `<a class="news-title" href="${escapeAttr(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title || '资讯')}</a>`
             : `<div class="news-title">${escapeHtml(n.title || '资讯')}</div>`) +
      `<div class="meta news-src">${escapeHtml(n.source || '—')}${n.time ? ' · ' + escapeHtml(n.time) : ''}</div>` +
      (n.summary ? `<div class="meta">${escapeHtml(n.summary)}</div>` : '') +
      `</div></div>`
    ).join('');
  }

  // ===== 驾驶舱 · 工作板块（理财 / 国际政经 / 书籍） =====
  const financeNews = ensure(data, 'financeNews', { items: [], trend: '', learning: [] });
  const financeLedger = ensure(data, 'financeLedger', []);
  const macroNews = ensure(data, 'macroNews', { items: [], analysis: '' });
  const bookRecs = ensure(data, 'bookRecs', { items: [] });
  const myBooks = ensure(data, 'myBooks', []);

  function renderFinance() {
    const list = document.getElementById('finance-list');
    const trend = document.getElementById('finance-trend');
    if (trend) trend.textContent = financeNews.trend || '暂无市场趋势简析，点 🔄 拉取最新理财热点。';
    if (list) {
      const items = financeNews.items || [];
      if (!items.length) list.innerHTML = '<div class="empty">暂无理财热点，点 🔄 拉取最新</div>';
      else {
        list.innerHTML = items.map(n =>
          `<div class="item"><div class="body">` +
          (n.url ? `<a class="news-title" href="${escapeAttr(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title || '资讯')}</a>`
                 : `<div class="news-title">${escapeHtml(n.title || '资讯')}</div>`) +
          (n.tag ? ` <span class="chip sm">${escapeHtml(n.tag)}</span>` : '') +
          (n.summary ? `<div class="meta">${escapeHtml(n.summary)}</div>` : '') +
          `</div></div>`
        ).join('');
      }
    }
    const ledgerList = document.getElementById('finance-ledger-list');
    if (ledgerList) {
      if (!financeLedger.length) ledgerList.innerHTML = '<div class="empty">还没有收支记录</div>';
      else {
        ledgerList.innerHTML = financeLedger.slice().reverse().map(e => {
          const balance = (parseFloat(e.income) || 0) - (parseFloat(e.expense) || 0);
          return `<div class="item"><div class="body"><div><b>${e.date}</b> · 收 ¥${e.income || 0} · 支 ¥${e.expense || 0} · 余 ¥${balance.toFixed(2)}</div>${e.note ? `<div class="meta">${escapeHtml(e.note)}</div>` : ''}</div></div>`;
        }).join('');
      }
    }
    const learnList = document.getElementById('finance-learning-list');
    if (learnList) {
      const lessons = financeNews.learning || [];
      if (!lessons.length) learnList.innerHTML = '<div class="empty">暂无理财学习清单</div>';
      else {
        learnList.innerHTML = lessons.map((l, i) =>
          `<div class="item"><div class="body">` +
          `<div class="news-title">${escapeHtml(l.title)} <span class="chip sm">${escapeHtml(l.level || '基础')}</span></div>` +
          `<div class="row" style="align-items:center;gap:10px;margin-top:6px">` +
          `<input type="range" min="0" max="100" value="${l.progress || 0}" data-fi="${i}" class="finance-progress" style="flex:1" />` +
          `<span class="meta progress-val-${i}">${l.progress || 0}%</span>` +
          `</div></div></div>`
        ).join('');
      }
    }
  }

  function addFinanceLedger() {
    const date = document.getElementById('finance-date').value || TODAY;
    const income = parseFloat(document.getElementById('finance-income').value) || 0;
    const expense = parseFloat(document.getElementById('finance-expense').value) || 0;
    const note = document.getElementById('finance-note').value.trim();
    if (!income && !expense && !note) return;
    financeLedger.push({ date, income, expense, note });
    save(); renderFinance();
    document.getElementById('finance-income').value = '';
    document.getElementById('finance-expense').value = '';
    document.getElementById('finance-note').value = '';
    flash('已记录收支');
  }

  function renderMacro() {
    const list = document.getElementById('macro-list');
    const analysis = document.getElementById('macro-analysis');
    if (analysis) analysis.textContent = macroNews.analysis || '暂无趋势分析，点 🔄 拉取最新国际政经资讯。';
    if (list) {
      const items = macroNews.items || [];
      if (!items.length) list.innerHTML = '<div class="empty">暂无国际政经资讯，点 🔄 拉取最新</div>';
      else {
        list.innerHTML = items.map(n =>
          `<div class="item"><div class="body">` +
          (n.url ? `<a class="news-title" href="${escapeAttr(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title || '资讯')}</a>`
                 : `<div class="news-title">${escapeHtml(n.title || '资讯')}</div>`) +
          (n.source ? `<div class="meta news-src">${escapeHtml(n.source)}</div>` : '') +
          (n.summary ? `<div class="meta">${escapeHtml(n.summary)}</div>` : '') +
          `</div></div>`
        ).join('');
      }
    }
  }

  function renderBooks() {
    const recList = document.getElementById('book-rec-list');
    if (recList) {
      const items = bookRecs.items || [];
      if (!items.length) recList.innerHTML = '<div class="empty">暂无书籍推荐，点 🔄 拉取最新</div>';
      else {
        recList.innerHTML = items.map(b =>
          `<div class="item"><div class="body">` +
          `<div class="news-title">${escapeHtml(b.title)} <span class="chip sm">${escapeHtml(b.tag || '推荐')}</span></div>` +
          `<div class="meta">${escapeHtml(b.author || '')}${b.rating ? ' · ' + escapeHtml(b.rating) : ''}</div>` +
          (b.summary ? `<div class="meta">${escapeHtml(b.summary)}</div>` : '') +
          (b.readUrl ? `<a class="chip" href="${escapeAttr(b.readUrl)}" target="_blank" rel="noopener">📖 打开阅读</a>` : '') +
          `</div></div>`
        ).join('');
      }
    }
    const mineList = document.getElementById('book-mine-list');
    if (mineList) {
      if (!myBooks.length) mineList.innerHTML = '<div class="empty">还没有书单，添加一本吧</div>';
      else {
        mineList.innerHTML = myBooks.slice().reverse().map(b =>
          `<div class="item"><div class="body">` +
          `<div class="news-title">${escapeHtml(b.title)} <span class="chip sm">${escapeHtml(b.status || '想读')}</span></div>` +
          (b.author ? `<div class="meta">${escapeHtml(b.author)}</div>` : '') +
          (b.progress ? `<div class="meta">${escapeHtml(b.progress)}</div>` : '') +
          `</div></div>`
        ).join('');
      }
    }
  }

  function addMyBook() {
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();
    const status = document.getElementById('book-status').value;
    const progress = document.getElementById('book-progress').value.trim();
    if (!title) return;
    myBooks.push({ id: Date.now(), title, author, status, progress });
    save(); renderBooks();
    document.getElementById('book-title').value = '';
    document.getElementById('book-author').value = '';
    document.getElementById('book-progress').value = '';
    flash('已加入书单');
  }

  // 工作板块子 tab 切换
  document.querySelectorAll('.finance-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.finance-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['hot', 'ledger', 'learn'].forEach(t => {
        document.getElementById('finance-pane-' + t).style.display = btn.dataset.financeTab === t ? 'block' : 'none';
      });
    });
  });
  document.querySelectorAll('.book-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.book-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['rec', 'mine'].forEach(t => {
        document.getElementById('book-pane-' + t).style.display = btn.dataset.bookTab === t ? 'block' : 'none';
      });
    });
  });

  const financeAdd = document.getElementById('finance-add');
  if (financeAdd) financeAdd.addEventListener('click', addFinanceLedger);
  const bookAdd = document.getElementById('book-add');
  if (bookAdd) bookAdd.addEventListener('click', addMyBook);

  // 理财学习进度滑块
  document.addEventListener('input', e => {
    if (e.target.classList.contains('finance-progress')) {
      const idx = parseInt(e.target.dataset.fi, 10);
      if (financeNews.learning && financeNews.learning[idx]) {
        financeNews.learning[idx].progress = parseInt(e.target.value, 10);
        const valEl = document.querySelector('.progress-val-' + idx);
        if (valEl) valEl.textContent = e.target.value + '%';
        save();
      }
    }
  });

  async function fetchNews() {
    let items = [];
    let asOf = '';
    try {
      if (newsConfig.mode === 'ai') items = await fetchNewsViaAI();
      else if (newsConfig.mode === 'custom') items = await fetchNewsCustom();
      else if (newsConfig.mode === 'hn') items = await fetchNewsGeo();
      else { items = await fetchNewsGeo(); asOf = data.newsAsOf; }
    } catch (e) {
      console.warn('news fetch failed', e);
      flash('资讯拉取失败：' + e.message);
      return;
    }
    if (items && items.length) {
      news.length = 0;
      items.forEach(it => news.push(it));
      data.newsAsOf = asOf || new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      save(); renderNews();
      flash('已更新 ' + items.length + ' 条资讯');
    } else {
      flash('未获取到资讯');
    }
  }

  // 里里抓取的中文 GEO 资讯：从云端 payload.news 拉取，无需浏览器跨域/API Key
  async function fetchNewsGeo() {
    const row = await sbGetRow();
    const cloudNews = (row && row.payload && row.payload.news) ? row.payload.news : [];
    if (!cloudNews.length) throw new Error('云端暂无里里抓取的 GEO 资讯');
    data.newsAsOf = row.payload.newsAsOf || '';
    return cloudNews;
  }

  // 理财/政经/书籍：从云端拉取里里推送的最新内容（无需 API Key）
  async function fetchFinance() {
    try {
      const row = await sbGetRow();
      const cloud = row && row.payload && row.payload.financeNews;
      if (!cloud) throw new Error('云端暂无理财热点');
      Object.assign(financeNews, cloud);
      save(); renderFinance();
      flash('已拉取最新理财热点 ' + ((financeNews.items || []).length) + ' 条');
    } catch (e) { console.warn(e); flash('理财热点拉取失败：' + e.message); }
  }
  async function fetchMacro() {
    try {
      const row = await sbGetRow();
      const cloud = row && row.payload && row.payload.macroNews;
      if (!cloud) throw new Error('云端暂无国际政经资讯');
      Object.assign(macroNews, cloud);
      save(); renderMacro();
      flash('已拉取最新国际政经资讯 ' + ((macroNews.items || []).length) + ' 条');
    } catch (e) { console.warn(e); flash('国际政经资讯拉取失败：' + e.message); }
  }
  async function fetchBooks() {
    try {
      const row = await sbGetRow();
      const cloud = row && row.payload && row.payload.bookRecs;
      if (!cloud) throw new Error('云端暂无书籍推荐');
      Object.assign(bookRecs, cloud);
      save(); renderBooks();
      flash('已拉取最新书籍推荐 ' + ((bookRecs.items || []).length) + ' 本');
    } catch (e) { console.warn(e); flash('书籍推荐拉取失败：' + e.message); }
  }

  // 默认免费源：Hacker News Algolia，浏览器可直接跨域调用，无需密钥
  async function fetchNewsDefault() {
    const q = encodeURIComponent(newsConfig.query || 'AI');
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${q}&hitsPerPage=10`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.hits || []).filter(h => h.title).slice(0, 8).map(h => ({
      title: h.title,
      url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
      source: 'Hacker News',
      time: (h.created_at || '').slice(0, 10)
    }));
  }

  // 自定义 JSON 接口（NewsAPI 兼容等），返回数组或含 articles/data/results 字段
  async function fetchNewsCustom() {
    const q = encodeURIComponent(newsConfig.query || 'AI');
    const sep = newsConfig.base.indexOf('?') >= 0 ? '&' : '?';
    const url = newsConfig.base + sep + 'q=' + q + (newsConfig.key ? '&apiKey=' + encodeURIComponent(newsConfig.key) : '');
    const r = await fetch(url, newsConfig.key ? { headers: { 'Authorization': 'Bearer ' + newsConfig.key } } : {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.articles || j.data || j.results || j.hits || []);
    return arr.slice(0, 10).map(h => ({
      title: h.title || h.headline || h.name || '资讯',
      url: h.url || h.link || h.webUrl || '',
      source: h.source || newsConfig.source || '自定义源',
      time: (h.publishedAt || h.time || h.date || '').toString().slice(0, 10)
    }));
  }

  // 用 AI 生成中文资讯摘要（复用 OpenAI 兼容接口）
  async function fetchNewsViaAI() {
    if (!newsConfig.key) throw new Error('未配置 AI 密钥');
    const messages = [
      { role: 'system', content: '你是资讯助手。请基于今天的热点，用中文列出 6 条与 AI / GEO / 创业 / 个人成长相关的最新资讯，每条一行，格式：标题 | 一句话要点。不要解释、不要编号。' },
      { role: 'user', content: '给我今日资讯速览' }
    ];
    const r = await fetch(newsConfig.base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + newsConfig.key },
      body: JSON.stringify({ model: newsConfig.model || 'gpt-4o-mini', messages, temperature: 0.6, max_tokens: 700 })
    });
    if (!r.ok) throw new Error('API ' + r.status);
    const j = await r.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6).map(l => {
      const parts = l.split('|');
      return { title: parts[0].replace(/^\d+[.、）)\s]*/, '').trim(), summary: (parts[1] || '').trim(), source: 'AI 生成', url: '' };
    });
  }

  const newsRefresh = document.getElementById('news-refresh');
  if (newsRefresh) newsRefresh.addEventListener('click', fetchNews);
  const financeRefresh = document.getElementById('finance-refresh');
  if (financeRefresh) financeRefresh.addEventListener('click', fetchFinance);
  const macroRefresh = document.getElementById('macro-refresh');
  if (macroRefresh) macroRefresh.addEventListener('click', fetchMacro);
  const bookRefresh = document.getElementById('book-refresh');
  if (bookRefresh) bookRefresh.addEventListener('click', fetchBooks);
  const newsKeyBar = document.getElementById('news-key-bar');
  const newsCfgPanel = document.getElementById('news-config-panel');
  const newsCfgBtn = document.getElementById('news-config-btn');
  if (newsKeyBar) newsKeyBar.style.display = 'none'; // 默认免费源，无需配置
  if (newsCfgBtn) newsCfgBtn.addEventListener('click', () => {
    newsCfgPanel.style.display = newsCfgPanel.style.display === 'none' ? 'block' : 'none';
    if (newsCfgPanel.style.display !== 'none') {
      document.getElementById('news-base').value = newsConfig.base || '';
      document.getElementById('news-key').value = newsConfig.key || '';
      document.getElementById('news-query').value = newsConfig.query || 'AI';
      document.getElementById('news-mode').value = newsConfig.mode || 'geo';
    }
  });
  const newsSaveBtn = document.getElementById('news-save-config');
  if (newsSaveBtn) newsSaveBtn.addEventListener('click', () => {
    newsConfig = {
      base: document.getElementById('news-base').value.trim(),
      key: document.getElementById('news-key').value.trim(),
      query: document.getElementById('news-query').value.trim() || 'AI',
      mode: document.getElementById('news-mode').value,
      source: '自定义源'
    };
    saveNewsConfig();
    newsCfgPanel.style.display = 'none';
    flash('资讯源已保存');
  });

  // ---- 手动拉取云端（里里写入的最新数据） ----
  document.getElementById('sync-btn').addEventListener('click', pullUpdates);
  const taskBadge = document.getElementById('task-badge');
  if (taskBadge) taskBadge.addEventListener('click', () => {
    const ov = document.querySelector('nav.tabbar button[data-sec="overview"]'); if (ov) ov.click();
    setTimeout(() => { const c = document.getElementById('task-center'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  });
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

  // ---- 业务模块迁移：把原本误存到公开云的客户/动态数据收回本地(stella-biz-v1)，并从 data 删除，停止上传泄露 ----
  (function migrateBiz() {
    const raw = localStorage.getItem('stella-biz-v1');
    if (!raw && (data.clients || data.geo_notes)) {
      const biz = {
        clients: data.clients || [], geoNotes: data.geo_notes || [],
        content: { materials: [], images: [], topics: [], ideas: [], articles: [], metrics: [], official: [] },
        ppt: { standard: [], custom: [], auxiliary: [], knowledge: [] },
        meetings: [], freqQuestions: [], passcode: null, updatedAt: new Date().toISOString()
      };
      localStorage.setItem('stella-biz-v1', JSON.stringify(biz));
    }
    if (data.clients || data.geo_notes) { delete data.clients; delete data.geo_notes; save(); }
  })();

  // ---- 体重趋势（驾驶舱 + 减脂区两块画布） ----
  function drawTrendOn(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = 160;
    if (!w) return; // 隐藏的画布（如未激活的 tab）宽度 0，跳过，等切到时再画
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const entries = Object.keys(data.weights || {})
      .filter(k => data.weights[k].weight)
      .sort()
      .map(k => ({ k, v: parseFloat(data.weights[k].weight) }));
    if (entries.length < 1) { ctx.fillStyle = '#9a9aab'; ctx.font = '13px sans-serif'; ctx.fillText('录入体重后显示趋势', 12, h / 2); return; }
    const vals = entries.map(e => e.v);
    const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
    const pad = 30, right = w - 16;
    const px = i => entries.length === 1 ? w / 2 : pad + i * (right - pad) / (entries.length - 1);
    const py = v => h - 22 - (v - min) / (max - min) * (h - 42);
    ctx.strokeStyle = '#ff5c8a'; ctx.lineWidth = 2; ctx.beginPath();
    entries.forEach((e, i) => { const x = px(i), y = py(e.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#ff5c8a';
    entries.forEach((e, i) => { ctx.beginPath(); ctx.arc(px(i), py(e.v), 3.5, 0, 7); ctx.fill(); });
    // 数据点数值标签
    ctx.fillStyle = '#ff5c8a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    entries.forEach((e, i) => { ctx.fillText(e.v, px(i), py(e.v) - 8); });
    ctx.fillStyle = '#9a9aab'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    entries.forEach((e, i) => { if (i % Math.ceil(entries.length / 6) === 0) ctx.fillText(e.k.slice(5), px(i), h - 6); });
    ctx.textAlign = 'start';
  }
  function renderTrend() {
    document.querySelectorAll('.trend-canvas').forEach(drawTrendOn);
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

  // ---- 日期选择器 ----
  function bindDatePickers() {
    document.querySelectorAll('.global-date-picker').forEach(el => {
      el.value = selectedDate;
      el.max = TODAY;
      el.addEventListener('change', () => { if (el.value) setSelectedDate(el.value); });
    });
  }

  // ---- 初始化 ----
  bindDatePickers();
  document.getElementById('today-date').textContent = '· ' + prettyDate(selectedDate);
  const financeDate = document.getElementById('finance-date');
  if (financeDate) financeDate.value = TODAY;
  setStatus('local');
  fillCheckin(); renderDiets(); renderFitness(); renderTodos(); renderDashTodos(); renderDashDiets(); renderReviews(); renderInbox(); renderLearnTracks(); renderLearns(); renderChat(); refreshKPI(); renderTrend(); renderNews(); renderTaskCenter(); renderFatlossGoals(); renderFinance(); renderMacro(); renderBooks();
  // 首次进入且本地无资讯时，自动同步里里抓取的最新中文 GEO 资讯（同会话仅一次）
    // 首次进入且本地无资讯时，自动拉一次云端中文 GEO（同会话仅一次）
    if (navigator.onLine && news.length === 0 && !sessionStorage.getItem('stella-news-autofetch')) {
      sessionStorage.setItem('stella-news-autofetch', '1');
      fetchNews().catch(() => {});
    }

  // 驾驶舱：今日待办 / 饮食快捷编辑
  document.getElementById('dash-add-todo').addEventListener('click', addTodoFromDash);
  document.getElementById('dash-todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodoFromDash(); });
  document.getElementById('dash-add-diet').addEventListener('click', () => {
    const c = document.getElementById('dash-diet-content').value.trim();
    if (!c) return;
    diets[selectedDate].push({ meal: document.getElementById('dash-diet-meal').value, content: c });
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
    renderAll: () => { fillCheckin(); renderDiets(); renderFitness(); renderTodos(); renderDashTodos(); renderDashDiets(); renderReviews(); renderInbox(); renderLearnTracks(); renderLearns(); renderChat(); refreshKPI(); renderTrend(); renderNews(); renderTaskCenter(); renderFatlossGoals(); renderFinance(); renderMacro(); renderBooks(); }
  };
})();
