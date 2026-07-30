/* ============================================================
 * Stella Zuo 工作台 · 业务模块（GEO 创业业务管理）
 * 本地优先存储：所有业务数据只存在手机 localStorage（stella-biz-v1），
 * 绝不写入 Supabase 公有 blob，杜绝客户机密泄露（与 C 方案一致）。
 * 跨设备：导出/导入 JSON 备份。
 * ============================================================ */
(function () {
  'use strict';

  const BIZ_KEY = 'stella-biz-v1';
  const AI_KEY = 'stella-ai-config-v1';
  const DATA_KEY = 'stella-data-v1'; // 业务全景(geo_stats)脱敏聚合仍读这里

  /* ---------- 工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function today() { const d = new Date(); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
  function fmt(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${+m}月${+d}日`; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function flash(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:9999;opacity:0;transition:.25s;pointer-events:none;max-width:80%'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', 1800);
  }
  function loadAI() { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) { return {}; } }
  async function aiChat(system, user, model) {
    const cfg = loadAI();
    if (!cfg.base || !cfg.key) { flash('未配置 AI：去「生活 → AI 研讨」填 Base 和密钥'); return null; }
    try {
      const r = await fetch(cfg.base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: model || cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.7 })
      });
      if (!r.ok) { flash('AI 调用失败 ' + r.status); return null; }
      const j = await r.json();
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    } catch (e) { flash('AI 网络错误'); return null; }
  }
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- 存储 ---------- */
  function defaultBiz() {
    return {
      clients: [], geoNotes: [],
      content: { materials: [], images: [], topics: [], ideas: [], articles: [], metrics: [], official: [] },
      ppt: { standard: [], custom: [], auxiliary: [], knowledge: [] },
      meetings: [], freqQuestions: [],
      passcode: null,
      updatedAt: null
    };
  }
  let biz = defaultBiz();
  function load() { try { const r = localStorage.getItem(BIZ_KEY); if (r) biz = Object.assign(defaultBiz(), JSON.parse(r)); } catch (e) {} }
  function save() { biz.updatedAt = new Date().toISOString(); localStorage.setItem(BIZ_KEY, JSON.stringify(biz)); }

  /* ---------- 业务全景（脱敏聚合，读 geo_stats） ---------- */
  function renderOverview(root) {
    let s = null;
    try { const d = JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); s = d.geo_stats; } catch (e) {}
    const cN = biz.clients.length, pN = biz.ppt.standard.length + biz.ppt.custom.length + biz.ppt.auxiliary.length;
    const mN = biz.meetings.length, aN = biz.content.articles.length, riskN = biz.clients.filter(c => c.risk && c.risk.level && c.risk.level !== '无').length;
    const todoN = biz.clients.filter(c => (c.next || '').trim()).length + biz.meetings.filter(m => !m.done).length;
    let statsHtml = '<div class="empty">暂无脱敏聚合数据。让里里在对话里跑建账脚本并推送，或点首页 🔄 同步。</div>';
    if (s) {
      const byStatus = {}; Object.keys(s.byStatus || {}).forEach(k => { const nk = (k === '签约' || k === '已成交' || k === '已签约') ? '已签约' : k; byStatus[nk] = (byStatus[nk] || 0) + (s.byStatus[k]); });
      const order = ['已签约', '打单', '商机', '渠道', '业务合伙人'];
      const colors = { '已签约': '#ff6f9d', '打单': '#6aa9ff', '商机': '#ffa94d', '渠道': '#b08bff', '业务合伙人': '#4dd0e1' };
      const total = s.total || 0;
      statsHtml = `<div class="kpis">
        <div class="kpi pink"><div class="v">${total}</div><div class="l">活跃客户</div></div>
        <div class="kpi"><div class="v">${s.landed || 0}</div><div class="l">已落地</div></div>
        <div class="kpi"><div class="v">${s.pipeline || 0}</div><div class="l">推进中</div></div>
        <div class="kpi"><div class="v">${s.channel || 0}</div><div class="l">渠道伙伴</div></div>
      </div>
      <div class="sub-h">状态分布</div>
      <div class="bars">${order.filter(k => byStatus[k]).map(k => { const v = byStatus[k]; const pct = total ? Math.round(v / total * 100) : 0; return `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar" style="width:${pct}%;background:${colors[k]}"></div></div><span class="bar-num">${v}</span></div>`; }).join('')}</div>
      <div class="meta" style="padding-top:8px">行业信息完整 ${s.industryFilled || 0}/${total} 家 · 更新于 ${s.asOf || '—'}</div>`;
    }
    root.innerHTML = `
      <div class="card">
        <h2>📊 业务全景 <span class="meta" style="font-size:12px;font-weight:400">脱敏聚合</span></h2>
        ${statsHtml}
      </div>
      <div class="card">
        <h2>🧭 模块速览</h2>
        <div class="kpis">
          <div class="kpi"><div class="v">${cN}</div><div class="l">客户台账</div></div>
          <div class="kpi"><div class="v">${aN}</div><div class="l">公众号文案</div></div>
          <div class="kpi"><div class="v">${pN}</div><div class="l">PPT 物料</div></div>
          <div class="kpi"><div class="v">${mN}</div><div class="l">会议</div></div>
        </div>
        <div class="kpis" style="margin-top:8px">
          <div class="kpi warn"><div class="v">${riskN}</div><div class="l">风险标记</div></div>
          <div class="kpi"><div class="v">${todoN}</div><div class="l">待办事项</div></div>
          <div class="kpi"><div class="v">${biz.freqQuestions.length}</div><div class="l">沉淀疑问</div></div>
        </div>
      </div>
      <div class="card meta" style="color:var(--muted)">
        🔒 本模块全部数据仅存于本机，不上传云端。换设备请用右上角「导出」备份，到新设备「导入」即可。
      </div>`;
  }

  /* ---------- 子模块1：客户全生命周期交付台账 ---------- */
  const STAGES = ['需求确认', '方案设计', '交付实施', '验收上线', '持续优化', '已结案'];
  const STATUS = ['意向', '商机', '打单', '签约', '已成交', '渠道', '业务合伙人'];
  const RISK = ['无', '低', '中', '高'];
  function clientById(id) { return biz.clients.find(c => c.id == id); }

  function renderClients(root) {
    root.innerHTML = `
      <div class="card">
        <div class="row">
          <div class="field" style="flex:2"><input id="cl-search" type="text" placeholder="搜索客户名 / 行业 / 对接人" /></div>
          <div class="field"><select id="cl-filter">
            <option value="">全部状态</option>${STATUS.map(s => `<option>${s}</option>`).join('')}
          </select></div>
        </div>
        <div id="cl-list" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h2>➕ 新增客户</h2>
        <div class="row">
          <div class="field" style="flex:2"><label>客户名称</label><input id="cl-name" placeholder="公司 / 品牌名" /></div>
          <div class="field"><label>状态</label><select id="cl-status">${STATUS.map(s => `<option>${s}</option>`).join('')}</select></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div class="field"><label>签约时间</label><input id="cl-sign" type="date" /></div>
          <div class="field"><label>项目类型</label><input id="cl-type" placeholder="如 GEO 全案 / 单项" /></div>
          <div class="field"><label>对接人</label><input id="cl-contact" placeholder="对接人" /></div>
        </div>
        <div class="btn-row"><button class="primary" id="cl-add">添加客户</button></div>
      </div>`;
    const list = $('#cl-list', root);
    function draw() {
      const q = ($('#cl-search', root).value || '').trim().toLowerCase();
      const f = $('#cl-filter', root).value;
      const arr = biz.clients.filter(c => {
        if (f && c.status !== f) return false;
        if (q && !(c.name + ' ' + (c.industry || '') + ' ' + (c.contact || '')).toLowerCase().includes(q)) return false;
        return true;
      });
      if (!arr.length) { list.innerHTML = `<div class="empty">还没有客户${biz.clients.length ? '（无匹配）' : '，去上方添加'}</div>`; return; }
      list.innerHTML = arr.map(c => {
        const riskTag = (c.risk && c.risk.level && c.risk.level !== '无') ? `<span class="tag warn">${c.risk.level}风险</span>` : '';
        return `<div class="item clickable" data-id="${c.id}">
          <div class="body"><div><span class="tag">${escapeHtml(c.status || '意向')}</span><b>${escapeHtml(c.name)}</b> ${riskTag}</div>
          <div class="meta">${c.contact ? '对接 ' + escapeHtml(c.contact) + ' · ' : ''}${c.industry ? escapeHtml(c.industry) + ' · ' : ''}阶段：${escapeHtml(c.stage || '—')} · 下一步：${escapeHtml(c.next || '—')}</div></div>
          <button class="del" data-del="${c.id}">×</button></div>`;
      }).join('');
      $all('.item.clickable', list).forEach(el => el.onclick = e => { if (e.target.dataset.del) return; openClient(el.dataset.id); });
      $all('.del', list).forEach(b => b.onclick = e => { e.stopPropagation(); if (confirm('删除该客户台账？')) { biz.clients = biz.clients.filter(c => c.id != b.dataset.del); save(); draw(); } });
    }
    $('#cl-search', root).oninput = draw; $('#cl-filter', root).onchange = draw;
    $('#cl-add', root).onclick = () => {
      const name = $('#cl-name', root).value.trim(); if (!name) return flash('填客户名称');
      biz.clients.unshift({ id: uid(), name, status: $('#cl-status', root).value, signDate: $('#cl-sign', root).value, type: $('#cl-type', root).value.trim(), contact: $('#cl-contact', root).value.trim(), industry: '', stage: '', deliverables: [], schedule: [], nodes: [], todos: [], questions: [], risk: { level: '无', note: '' }, notes: [], created: today() });
      save(); $('#cl-name', root).value = $('#cl-contact', root).value = $('#cl-type', root).value = $('#cl-sign', root).value = ''; draw(); flash('已添加');
    };
    draw();
  }

  function openClient(id) {
    const c = clientById(id); if (!c) return;
    const ov = overlay();
    function listEditor(title, arr, ph, key) {
      arr = arr || [];
      const items = arr.map((it, i) => `<div class="li"><span>${escapeHtml(typeof it === 'string' ? it : (it.text || ''))}</span><button data-prop="${key}" data-i="${i}">×</button></div>`).join('');
      return `<div class="sub-h">${title}</div>
        <div class="li-list">${items || '<div class="meta">暂无</div>'}</div>
        <div class="row"><input id="add-${key}" placeholder="${ph}" style="flex:1" /><button class="sm" id="btn-${key}">加</button></div>`;
    }
    ov.body.innerHTML = `
      <h2>${escapeHtml(c.name)} <span class="tag">${escapeHtml(c.status || '意向')}</span></h2>
      <div class="row">
        <div class="field"><label>状态</label><select id="d-status">${STATUS.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>当前实施阶段</label><select id="d-stage">${STAGES.map(s => `<option ${s === c.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>签约时间</label><input id="d-sign" type="date" value="${c.signDate || ''}" /></div>
        <div class="field"><label>项目类型</label><input id="d-type" value="${escapeHtml(c.type || '')}" /></div>
        <div class="field"><label>行业</label><input id="d-industry" value="${escapeHtml(c.industry || '')}" placeholder="如 珠宝" /></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field" style="flex:1"><label>下一步动作</label><input id="d-next" value="${escapeHtml(c.next || '')}" placeholder="如 本周出方案" /></div>
        <div class="field"><label>优先级</label><select id="d-prio"><option value="普通" ${c.prio === '普通' || !c.prio ? 'selected' : ''}>普通</option><option value="高" ${c.prio === '高' ? 'selected' : ''}>高</option><option value="紧急" ${c.prio === '紧急' ? 'selected' : ''}>紧急</option></select></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>风险等级</label><select id="d-risk">${RISK.map(s => `<option ${s === (c.risk && c.risk.level) ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label>风险说明</label><input id="d-risk-note" value="${escapeHtml(c.risk && c.risk.note || '')}" /></div>
      </div>
      ${listEditor('📋 完整交付清单', c.deliverables, '交付项', 'del')}
      ${listEditor('🗓 专项方案排期', c.schedule, '排期事项', 'sch')}
      ${listEditor('🚩 关键交付节点', c.nodes, '节点 / 日期', 'node')}
      ${listEditor('💬 待沟通事项', c.todos, '待沟通', 'todo')}
      ${listEditor('❓ 客户疑问汇总', c.questions, '疑问', 'q')}
      <div class="sub-h">📝 跟进备注记录</div>
      <div class="li-list">${(c.notes || []).map((n, i) => `<div class="li"><span>${fmt(n.date)} ${escapeHtml(n.text)}</span><button data-ni="${i}">×</button></div>`).join('') || '<div class="meta">暂无</div>'}</div>
      <div class="row"><input id="d-note" placeholder="追加备注" style="flex:1" /><button class="sm" id="d-note-add">记</button></div>
      <div class="btn-row" style="margin-top:12px"><button class="primary" id="d-save">保存</button></div>`;

    function bindList(key, prop) {
      const add = $('#btn-' + key, ov.body), inp = $('#add-' + key, ov.body);
      add.onclick = () => { const v = inp.value.trim(); if (!v) return; c[prop] = c[prop] || []; c[prop].push(typeof c[prop][0] === 'string' ? v : { text: v, date: today() }); save(); openClient(id); };
    }
    bindList('del', 'deliverables'); bindList('sch', 'schedule'); bindList('node', 'nodes'); bindList('todo', 'todo'); bindList('q', 'questions');
    // 删除列表条目（带 data-prop 标记归属）
    $all('.li-list button[data-prop]', ov.body).forEach(b => b.onclick = () => { c[b.dataset.prop].splice(+b.dataset.i, 1); save(); openClient(id); });
    // 删除跟进备注
    $all('.li-list button[data-ni]', ov.body).forEach(b => b.onclick = () => { c.notes.splice(+b.dataset.ni, 1); save(); openClient(id); });
    $('#d-note-add', ov.body).onclick = () => { const v = $('#d-note', ov.body).value.trim(); if (!v) return; c.notes = c.notes || []; c.notes.unshift({ date: today(), text: v }); save(); openClient(id); };
    $('#d-save', ov.body).onclick = () => {
      c.status = $('#d-status', ov.body).value; c.stage = $('#d-stage', ov.body).value;
      c.signDate = $('#d-sign', ov.body).value; c.type = $('#d-type', ov.body).value.trim(); c.industry = $('#d-industry', ov.body).value.trim();
      c.next = $('#d-next', ov.body).value.trim(); c.prio = $('#d-prio', ov.body).value;
      c.risk = { level: $('#d-risk', ov.body).value, note: $('#d-risk-note', ov.body).value.trim() };
      c.updated = today(); save(); closeOverlay(ov); renderCurrent(); flash('已保存');
    };
  }

  /* ---------- 子模块2：品牌内容运维 ---------- */
  function renderContent(root) {
    root.innerHTML = `
      <div class="row biz-subtabs" id="ct-tabs">
        <button class="biz-tab active" data-ct="lib">📦 素材库</button>
        <button class="biz-tab" data-ct="idea">💡 选题&文案</button>
        <button class="biz-tab" data-ct="data">📈 数据复盘</button>
        <button class="biz-tab" data-ct="site">🌐 官网台账</button>
      </div>
      <div id="ct-root"></div>`;
    const ctRoot = $('#ct-root', root);
    function go(t) { $all('#ct-tabs .biz-tab', root).forEach(b => b.classList.toggle('active', b.dataset.ct === t)); ({ lib: renderCtLib, idea: renderCtIdea, data: renderCtData, site: renderCtSite })[t](ctRoot); }
    $all('#ct-tabs .biz-tab', root).forEach(b => b.onclick = () => go(b.dataset.ct));
    go('lib');
  }
  function renderCtLib(root) {
    const cc = biz.content;
    function block(title, arr, key, ph1, ph2) {
      const items = arr.map((it, i) => `<div class="li"><span><b>${escapeHtml(it.name)}</b>${it.url ? ' · <a href="${escapeHtml(it.url)}" target="_blank">链接</a>' : ''}${it.note ? ' · ' + escapeHtml(it.note) : ''}</span><button data-k="${key}" data-i="${i}">×</button></div>`).join('');
      return `<div class="card"><h2>${title}</h2><div class="li-list">${items || '<div class="meta">暂无</div>'}</div>
        <div class="row"><input id="n-${key}" placeholder="${ph1}" style="flex:1" /><input id="u-${key}" placeholder="${ph2 || '链接/备注'}" style="flex:1" /><button class="sm" id="b-${key}">加</button></div></div>`;
    }
    root.innerHTML = block('🗂 素材池', cc.materials, 'materials', '素材名', '链接/备注') +
      block('🖼 图片库', cc.images, 'images', '图片名', '链接') +
      block('💬 话题库', cc.topics, 'topics', '话题 / 角度', '备注');
    ['materials', 'images', 'topics'].forEach(key => {
      $('#b-' + key, root).onclick = () => { const n = $('#n-' + key, root).value.trim(); if (!n) return; biz.content[key].unshift({ name: n, url: $('#u-' + key, root).value.trim() }); save(); renderCtLib(root); };
    });
    $all('.li-list button', root).forEach(b => b.onclick = () => { biz.content[b.dataset.k].splice(+b.dataset.i, 1); save(); renderCtLib(root); });
  }
  function renderCtIdea(root) {
    const cc = biz.content;
    root.innerHTML = `
      <div class="card">
        <h2>📝 标准化选题表</h2>
        <div class="row"><button class="sm" id="gen-idea">✨ AI 生成今日选题</button></div>
        <div class="li-list" id="idea-list" style="margin-top:8px"></div>
        <div class="row" style="margin-top:8px"><input id="idea-dir" placeholder="选题方向" style="flex:1" /><input id="idea-hot" placeholder="参考爆点" style="flex:1" /><input id="idea-form" placeholder="适配形式" style="flex:1" /><button class="sm" id="idea-add">加</button></div>
      </div>
      <div class="card">
        <h2>✍️ 公众号文案</h2>
        <div class="row"><button class="sm" id="gen-article">✨ AI 一键产出文案</button></div>
        <div class="li-list" id="article-list" style="margin-top:8px"></div>
        <div class="row" style="margin-top:8px"><input id="art-title" placeholder="标题" style="flex:2" /><input id="art-angle" placeholder="素材/角度" style="flex:1" /><button class="sm" id="art-add">加</button></div>
      </div>`;
    function drawIdeas() { $('#idea-list', root).innerHTML = cc.ideas.map((it, i) => `<div class="li"><span><b>${escapeHtml(it.dir)}</b> · 爆点：${escapeHtml(it.hot || '—')} · 形式：${escapeHtml(it.form || '—')}</span><button data-i="${i}">×</button></div>`).join('') || '<div class="meta">暂无选题</div>'; $all('#idea-list button', root).forEach(b => b.onclick = () => { cc.ideas.splice(+b.dataset.i, 1); save(); drawIdeas(); }); }
    function drawArticles() { $('#article-list', root).innerHTML = cc.articles.map((it, i) => `<div class="li"><span><b>${escapeHtml(it.title)}</b>${it.body ? '<br>' + escapeHtml(it.body).replace(/\n/g, '<br>') : ''}</span><button data-i="${i}">×</button></div>`).join('') || '<div class="meta">暂无文案</div>'; $all('#article-list button', root).forEach(b => b.onclick = () => { cc.articles.splice(+b.dataset.i, 1); save(); drawArticles(); }); }
    drawIdeas(); drawArticles();
    $('#idea-add', root).onclick = () => { const d = $('#idea-dir', root).value.trim(); if (!d) return; cc.ideas.unshift({ dir: d, hot: $('#idea-hot', root).value.trim(), form: $('#idea-form', root).value.trim(), date: today() }); save(); $('#idea-dir', root).value = $('#idea-hot', root).value = $('#idea-form', root).value = ''; drawIdeas(); };
    $('#art-add', root).onclick = () => { const t = $('#art-title', root).value.trim(); if (!t) return; cc.articles.unshift({ title: t, body: '', angle: $('#art-angle', root).value.trim(), date: today() }); save(); $('#art-title', root).value = $('#art-angle', root).value = ''; drawArticles(); };
    $('#gen-idea', root).onclick = async () => {
      flash('AI 生成中…');
      const hot = (biz.content.ideas.slice(0, 3).map(i => i.dir).join('；') || 'GEO/AI搜索/创业');
      const txt = await aiChat('你是 GEO 领域公众号选题专家。基于用户给的热点，产出 5 条公众号选题，每条一行，格式：选题方向 | 参考爆点 | 内容适配形式（图文/短视频/长文）。只输出选题，不要解释。', '今日热点：' + hot);
      if (!txt) return;
      txt.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => { const p = l.split('|'); cc.ideas.unshift({ dir: (p[0] || '').trim(), hot: (p[1] || '').trim(), form: (p[2] || '').trim(), date: today(), ai: true }); });
      save(); drawIdeas(); flash('已生成选题');
    };
    $('#gen-article', root).onclick = async () => {
      flash('AI 产出中…');
      const mat = biz.content.materials.slice(0, 5).map(m => m.name).join('、') || 'GEO 行业知识';
      const txt = await aiChat('你是公众号爆款文案写手。基于素材与选题，产出一篇公众号文章：先给 3 个爆款标题（每行一个，前缀“标题：”），空一行后给正文（含小标题、标准化排版、配图建议用【图：】标注）。语言专业但有网感。', '素材：' + mat + '；选题：' + (cc.ideas[0] ? cc.ideas[0].dir : 'GEO 创业'));
      if (!txt) return;
      const lines = txt.split('\n'); const titles = lines.filter(l => l.startsWith('标题：')).map(l => l.replace('标题：', '').trim());
      const body = lines.filter(l => !l.startsWith('标题：')).join('\n').trim();
      cc.articles.unshift({ title: titles[0] || 'AI 生成文案', body, angle: 'AI', date: today(), titles: titles.slice(1) });
      save(); drawArticles(); flash('文案已产出');
    };
  }
  function renderCtData(root) {
    const cc = biz.content;
    root.innerHTML = `
      <div class="card">
        <h2>📅 每日运营数据</h2>
        <div class="row">
          <div class="field"><label>日期</label><input id="m-date" type="date" value="${today()}" /></div>
          <div class="field"><label>阅读</label><input id="m-read" type="number" placeholder="0" /></div>
          <div class="field"><label>点赞</label><input id="m-like" type="number" placeholder="0" /></div>
          <div class="field"><label>收藏</label><input id="m-fav" type="number" placeholder="0" /></div>
          <div class="field"><label>涨粉</label><input id="m-fan" type="number" placeholder="0" /></div>
        </div>
        <div class="btn-row"><button class="primary sm" id="m-add">记录当日</button></div>
        <div id="m-chart" style="margin-top:10px"></div>
      </div>
      <div class="card" id="m-report"></div>`;
    $('#m-add', root).onclick = () => {
      const date = $('#m-date', root).value || today();
      const rec = { date, read: +$('#m-read', root).value || 0, like: +$('#m-like', root).value || 0, fav: +$('#m-fav', root).value || 0, fan: +$('#m-fan', root).value || 0 };
      const ex = cc.metrics.find(m => m.date === date); if (ex) Object.assign(ex, rec); else cc.metrics.unshift(rec);
      save(); drawChart(); drawReport(); flash('已记录');
    };
    function drawChart() {
      const arr = cc.metrics.slice().sort((a, b) => a.date < b.date ? -1 : 1);
      if (!arr.length) { $('#m-chart', root).innerHTML = '<div class="meta">暂无数据</div>'; return; }
      const max = Math.max(1, ...arr.map(m => m.read));
      $('#m-chart', root).innerHTML = `<div class="sub-h">阅读趋势</div>` + arr.slice(-14).map(m => { const h = Math.round(m.read / max * 60); return `<div class="bar-row"><span class="bar-label" style="width:54px">${fmt(m.date)}</span><div class="bar-track"><div class="bar" style="width:${h}%;background:#6aa9ff"></div></div><span class="bar-num">${m.read}</span></div>`; }).join('') + `<div class="meta" style="padding-top:6px">点赞合计 ${arr.reduce((s, m) => s + m.like, 0)} · 收藏 ${arr.reduce((s, m) => s + m.fav, 0)} · 涨粉 ${arr.reduce((s, m) => s + m.fan, 0)}</div>`;
    }
    function drawReport() {
      const arr = cc.metrics.slice().sort((a, b) => a.date < b.date ? -1 : 1);
      if (!arr.length) { $('#m-report', root).innerHTML = '<div class="meta">暂无复盘</div>'; return; }
      const sum = k => arr.reduce((s, m) => s + m[k], 0);
      const monthMap = {}, quarterMap = {};
      arr.forEach(m => { const [y, mo] = m.date.split('-'); const mk = y + '-' + mo; monthMap[mk] = monthMap[mk] || { read: 0, like: 0, fav: 0, fan: 0 }; ['read', 'like', 'fav', 'fan'].forEach(k => monthMap[mk][k] += m[k]); const q = Math.ceil(+mo / 3); quarterMap[y + 'Q' + q] = quarterMap[y + 'Q' + q] || { read: 0, like: 0, fav: 0, fan: 0 }; ['read', 'like', 'fav', 'fan'].forEach(k => quarterMap[y + 'Q' + q][k] += m[k]); });
      const rows = (map, title) => `<div class="sub-h">${title}</div><table class="tbl"><tr><th>周期</th><th>阅读</th><th>点赞</th><th>收藏</th><th>涨粉</th></tr>${Object.keys(map).map(k => `<tr><td>${k}</td><td>${map[k].read}</td><td>${map[k].like}</td><td>${map[k].fav}</td><td>${map[k].fan}</td></tr>`).join('')}</table>`;
      $('#m-report', root).innerHTML = rows(monthMap, '📆 月度综合报表') + rows(quarterMap, '📊 季度复盘对比');
    }
    drawChart(); drawReport();
  }
  function renderCtSite(root) {
    const cc = biz.content;
    root.innerHTML = `
      <div class="card">
        <h2>🌐 官网更新台账</h2>
        <div class="li-list" id="site-list"></div>
        <div class="row" style="margin-top:8px">
          <input id="s-col" placeholder="栏目" style="flex:1" />
          <input id="s-mat" placeholder="文案素材" style="flex:1" />
          <input id="s-ver" placeholder="版本" style="flex:1" />
          <input id="s-date" type="date" value="${today()}" />
          <button class="sm" id="s-add">加</button>
        </div>
      </div>
      <div class="card">
        <h2>🔁 内容互通复用</h2>
        <div class="meta">把公众号优质文案一键迁移到官网栏目：</div>
        <div class="li-list" id="reuse-list" style="margin-top:6px"></div>
      </div>`;
    function draw() {
      $('#site-list', root).innerHTML = cc.official.map((it, i) => `<div class="li"><span><b>${escapeHtml(it.col)}</b> · ${escapeHtml(it.mat || '—')} · 版本 ${escapeHtml(it.ver || '—')} · 计划 ${fmt(it.date || '—')}${it.check ? ' · ✅已上线' : ''}</span><button data-i="${i}">×</button>${!it.check ? `<button class="sm" data-on="${i}" style="margin-left:6px">标记上线</button>` : ''}</div>`).join('') || '<div class="meta">暂无更新</div>';
      $all('#site-list button[data-i]', root).forEach(b => b.onclick = () => { cc.official.splice(+b.dataset.i, 1); save(); draw(); });
      $all('#site-list button[data-on]', root).forEach(b => b.onclick = () => { cc.official[+b.dataset.on].check = true; cc.official[+b.dataset.on].launched = today(); save(); draw(); });
      $('#reuse-list', root).innerHTML = cc.articles.map((a, i) => `<div class="li"><span>${escapeHtml(a.title)}</span><button class="sm" data-i="${i}">迁移到官网</button></div>`).join('') || '<div class="meta">暂无文案可迁移</div>';
      $all('#reuse-list button', root).forEach(b => b.onclick = () => { const a = cc.articles[+b.dataset.i]; cc.official.unshift({ col: '文章', mat: a.title, ver: 'v1', date: today(), from: a.title }); save(); draw(); flash('已迁移'); });
    }
    $('#s-add', root).onclick = () => { const col = $('#s-col', root).value.trim(); if (!col) return; cc.official.unshift({ col, mat: $('#s-mat', root).value.trim(), ver: $('#s-ver', root).value.trim(), date: $('#s-date', root).value, check: false }); save(); $('#s-col', root).value = $('#s-mat', root).value = $('#s-ver', root).value = ''; draw(); };
    draw();
  }

  /* ---------- 子模块3：PPT 物料全生命周期 ---------- */
  function renderPPT(root) {
    root.innerHTML = `
      <div class="row biz-subtabs" id="ppt-tabs">
        <button class="biz-tab active" data-p="std">📘 通用标准</button>
        <button class="biz-tab" data-p="cus">📗 客户定制</button>
        <button class="biz-tab" data-p="aux">📙 市场辅助</button>
        <button class="biz-tab" data-p="kb">🧠 知识沉淀</button>
      </div>
      <div id="ppt-root"></div>`;
    const pptRoot = $('#ppt-root', root);
    function go(t) { $all('#ppt-tabs .biz-tab', root).forEach(b => b.classList.toggle('active', b.dataset.p === t)); ({ std: () => renderPptList(pptRoot, 'standard', false), cus: () => renderPptList(pptRoot, 'custom', true), aux: () => renderPptList(pptRoot, 'auxiliary', false), kb: renderPptKB })[t](); }
    $all('#ppt-tabs .biz-tab', root).forEach(b => b.onclick = () => go(b.dataset.p));
    go('std');
  }
  function renderPptList(root, key, isCustom) {
    const arr = biz.ppt[key];
    root.innerHTML = `
      <div class="card">
        <h2>${isCustom ? '📗 客户定制专项 GEO 方案 PPT' : (key === 'standard' ? '📘 通用产品标准 PPT' : '📙 市场辅助物料')}</h2>
        <div class="li-list" id="ppt-list"></div>
        <div class="row" style="margin-top:8px">
          <input id="p-name" placeholder="${isCustom ? '客户名' : '物料名'}" style="flex:1" />
          <input id="p-ver" placeholder="版本号" style="flex:1" />
          <input id="p-scene" placeholder="适配场景" style="flex:1" />
          ${isCustom ? '<input id="p-src" placeholder="需求来源" style="flex:1" />' : ''}
          <button class="sm" id="p-add">加</button>
        </div>
      </div>`;
    function draw() {
      $('#ppt-list', root).innerHTML = arr.map((it, i) => `<div class="li"><span><b>${escapeHtml(it.name)}</b> · 版本 ${escapeHtml(it.ver || '—')} · ${escapeHtml(it.scene || '—')}${it.src ? ' · 来源 ' + escapeHtml(it.src) : ''}${it.reuse ? ' · ♻️可复用' : ''}</span><button data-i="${i}">×</button>${!it.reuse ? `<button class="sm" data-r="${i}" style="margin-left:6px">标复用</button>` : ''}</div>`).join('') || '<div class="meta">暂无</div>';
      $all('#ppt-list button[data-i]', root).forEach(b => b.onclick = () => { arr.splice(+b.dataset.i, 1); save(); draw(); });
      $all('#ppt-list button[data-r]', root).forEach(b => b.onclick = () => { arr[+b.dataset.r].reuse = true; save(); draw(); flash('已标记可复用'); });
    }
    $('#p-add', root).onclick = () => { const n = $('#p-name', root).value.trim(); if (!n) return; arr.unshift({ name: n, ver: $('#p-ver', root).value.trim(), scene: $('#p-scene', root).value.trim(), src: isCustom ? $('#p-src', root).value.trim() : '', reuse: false, note: '', updates: [] }); save(); $('#p-name', root).value = $('#p-ver', root).value = $('#p-scene', root).value = $('#p-src', root).value = ''; draw(); };
    draw();
  }
  function renderPptKB(root) {
    const kb = biz.ppt.knowledge;
    root.innerHTML = `
      <div class="card">
        <h2>🧠 知识沉淀（反向回流产品知识库）</h2>
        <div class="meta">汇总客户高频提问、方案优化要点，支撑新方案/内容/话术。</div>
        <div class="li-list" id="kb-list" style="margin-top:8px"></div>
        <div class="row" style="margin-top:8px"><input id="kb-text" placeholder="沉淀要点（如：客户常问 GEO 与 SEO 区别）" style="flex:1" /><select id="kb-type"><option value="高频提问">高频提问</option><option value="优化要点">优化要点</option><option value="话术">话术</option></select><button class="sm" id="kb-add">加</button></div>
      </div>`;
    function draw() { $('#kb-list', root).innerHTML = kb.map((it, i) => `<div class="li"><span><span class="tag">${escapeHtml(it.type)}</span> ${escapeHtml(it.text)}</span><button data-i="${i}">×</button></div>`).join('') || '<div class="meta">暂无沉淀</div>'; $all('#kb-list button', root).forEach(b => b.onclick = () => { kb.splice(+b.dataset.i, 1); save(); draw(); }); }
    $('#kb-add', root).onclick = () => { const t = $('#kb-text', root).value.trim(); if (!t) return; kb.unshift({ type: $('#kb-type', root).value, text: t, date: today() }); save(); $('#kb-text', root).value = ''; draw(); };
    draw();
  }

  /* ---------- 子模块4：市场宣讲&会议支撑中心 ---------- */
  function renderMeeting(root) {
    root.innerHTML = `
      <div class="card">
        <h2>🎤 会议日程排期</h2>
        <div class="li-list" id="mt-list"></div>
        <div class="row" style="margin-top:8px">
          <input id="mt-theme" placeholder="会议主题" style="flex:2" />
          <input id="mt-time" type="datetime-local" style="flex:1" />
          <select id="mt-type"><option value="市场宣讲">市场宣讲</option><option value="客户沟通">客户沟通</option><option value="内部">内部</option></select>
          <button class="sm" id="mt-add">排期</button>
        </div>
      </div>
      <div class="card">
        <h2>📌 高频疑问沉淀（业务迭代燃料）</h2>
        <div id="fq-list"></div>
      </div>`;
    function draw() {
      const arr = biz.meetings.slice().sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      $('#mt-list', root).innerHTML = arr.map(m => `<div class="item clickable" data-id="${m.id}"><div class="body"><div><span class="tag">${escapeHtml(m.type)}</span><b>${escapeHtml(m.theme)}</b>${m.done ? ' ✅' : ''}</div><div class="meta">${m.time ? m.time.replace('T', ' ') : '未定时间'} · 参会 ${escapeHtml((m.attend || []).join('、') || '—')}</div></div><button class="del" data-del="${m.id}">×</button></div>`).join('') || '<div class="meta">暂无会议</div>';
      $all('.item.clickable', root).forEach(el => el.onclick = e => { if (e.target.dataset.del) return; openMeeting(el.dataset.id); });
      $all('.del', root).forEach(b => b.onclick = e => { e.stopPropagation(); if (confirm('删除该会议？')) { biz.meetings = biz.meetings.filter(m => m.id != b.dataset.del); save(); draw(); } });
      $('#fq-list', root).innerHTML = biz.freqQuestions.map((q, i) => `<div class="li"><span><b>${escapeHtml(q.q)}</b>${q.from ? ' · 来源 ' + escapeHtml(q.from) : ''}</span><button data-i="${i}">×</button></div>`).join('') || '<div class="meta">暂无沉淀（在会议详情里记录客户提问会自动汇总到这里）</div>';
      $all('#fq-list button', root).forEach(b => b.onclick = () => { biz.freqQuestions.splice(+b.dataset.i, 1); save(); draw(); });
    }
    $('#mt-add', root).onclick = () => { const t = $('#mt-theme', root).value.trim(); if (!t) return; biz.meetings.unshift({ id: uid(), theme: t, time: $('#mt-time', root).value, type: $('#mt-type', root).value, attend: [], done: false, checklist: [], minutes: '', questions: [] }); save(); $('#mt-theme', root).value = $('#mt-time', root).value = ''; draw(); };
    draw();
  }
  function openMeeting(id) {
    const m = biz.meetings.find(x => x.id == id); if (!m) return;
    const ov = overlay();
    ov.body.innerHTML = `
      <h2>${escapeHtml(m.theme)} <span class="tag">${escapeHtml(m.type)}</span></h2>
      <div class="row">
        <div class="field" style="flex:1"><label>时间</label><input id="e-time" type="datetime-local" value="${m.time || ''}" /></div>
        <div class="field" style="flex:1"><label>参会人员</label><input id="e-attend" value="${escapeHtml((m.attend || []).join('、'))}" placeholder="逗号分隔" /></div>
        <div class="field"><label>状态</label><select id="e-done"><option value="false" ${!m.done ? 'selected' : ''}>未结束</option><option value="true" ${m.done ? 'selected' : ''}>已完成</option></select></div>
      </div>
      <div class="sub-h">✅ 会前筹备核查清单</div>
      <div class="li-list" id="ck-list"></div>
      <div class="row"><input id="ck-add" placeholder="核查项（PPT/素材/话术/答疑资料）" style="flex:1" /><button class="sm" id="ck-btn">加</button></div>
      <div class="sub-h">📝 会后纪要</div>
      <textarea id="e-min" rows="4" style="width:100%;box-sizing:border-box">${escapeHtml(m.minutes || '')}</textarea>
      <div class="sub-h">❓ 现场客户提问 / 诉求异议</div>
      <div class="li-list" id="q-list"></div>
      <div class="row"><input id="q-add" placeholder="客户提问" style="flex:1" /><button class="sm" id="q-btn">记</button></div>
      <div class="btn-row" style="margin-top:12px"><button class="primary" id="e-save">保存</button></div>`;
    function drawCk() { $('#ck-list', ov.body).innerHTML = (m.checklist || []).map((c, i) => `<div class="li"><label><input type="checkbox" ${c.done ? 'checked' : ''} data-i="${i}"/> ${escapeHtml(c.text)}</label><button data-ci="${i}">×</button></div>`).join('') || '<div class="meta">暂无</div>'; $all('#ck-list input[type=checkbox]', ov.body).forEach(cb => cb.onchange = () => { m.checklist[+cb.dataset.i].done = cb.checked; save(); }); $all('#ck-list button', ov.body).forEach(b => b.onclick = () => { m.checklist.splice(+b.dataset.ci, 1); save(); drawCk(); }); }
    function drawQ() { $('#q-list', ov.body).innerHTML = (m.questions || []).map((q, i) => `<div class="li"><span>${escapeHtml(q)}</span><button data-qi="${i}">×</button></div>`).join('') || '<div class="meta">暂无</div>'; $all('#q-list button', ov.body).forEach(b => b.onclick = () => { m.questions.splice(+b.dataset.qi, 1); biz.freqQuestions = biz.freqQuestions.filter(f => f._mid !== m.id || f.q !== m.questions[+b.dataset.qi]); save(); drawQ(); renderCurrent(); }); }
    drawCk(); drawQ();
    $('#ck-btn', ov.body).onclick = () => { const v = $('#ck-add', ov.body).value.trim(); if (!v) return; m.checklist = m.checklist || []; m.checklist.push({ text: v, done: false }); save(); $('#ck-add', ov.body).value = ''; drawCk(); };
    $('#q-btn', ov.body).onclick = () => { const v = $('#q-add', ov.body).value.trim(); if (!v) return; m.questions = m.questions || []; m.questions.push(v); biz.freqQuestions.unshift({ q: v, from: m.theme, _mid: m.id, date: today() }); save(); $('#q-add', ov.body).value = ''; drawQ(); renderCurrent(); flash('已沉淀'); };
    $('#e-save', ov.body).onclick = () => {
      m.time = $('#e-time', ov.body).value; m.attend = $('#e-attend', ov.body).value.split(/[，,]/).map(s => s.trim()).filter(Boolean); m.done = $('#e-done', ov.body).value === 'true'; m.minutes = $('#e-min', ov.body).value;
      save(); closeOverlay(ov); renderCurrent(); flash('已保存');
    };
  }

  /* ---------- 弹层 ---------- */
  function overlay() {
    const ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML = `<div class="ov-box"><button class="ov-close">×</button><div class="ov-body"></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('.ov-close').onclick = () => closeOverlay(ov);
    ov.onclick = e => { if (e.target === ov) closeOverlay(ov); };
    return { el: ov, body: ov.querySelector('.ov-body'), close: () => closeOverlay(ov) };
  }
  function closeOverlay(ov) { ov.el.remove(); }

  /* ---------- 导出/导入/密码 ---------- */
  function exportBiz() { download('stella-biz-' + today() + '.json', JSON.stringify(biz, null, 2)); flash('已导出备份'); }
  function importBiz(file) {
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (confirm('导入将覆盖当前业务数据，确定？')) { biz = Object.assign(defaultBiz(), d); save(); renderCurrent(); flash('导入成功'); } } catch (e) { flash('文件格式错误'); } };
    r.readAsText(file);
  }
  function lockUI() {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="ov-box" style="max-width:280px;text-align:center"><h2>🔒 已锁定</h2><input id="lk" type="password" placeholder="输入密码解锁" style="width:100%;box-sizing:border-box" /><div class="btn-row" style="justify-content:center;margin-top:10px"><button class="primary" id="lk-btn">解锁</button></div></div>`;
    document.body.appendChild(ov);
    const tryUnlock = () => { if ($('#lk', ov).value === biz.passcode) { ov.remove(); } else flash('密码错误'); };
    $('#lk-btn', ov).onclick = tryUnlock; $('#lk', ov).onkeydown = e => { if (e.key === 'Enter') tryUnlock(); };
  }
  function setPasscode() {
    const nv = prompt('设置/修改解锁密码（留空则取消密码）：');
    if (nv === null) return;
    biz.passcode = nv.trim() || null; save(); flash(biz.passcode ? '已启用密码' : '已取消密码');
    if (biz.passcode) lockUI();
  }

  /* ---------- 来自里里：任务中心采纳 ---------- */
  // 把里里从对话同步来的"种子"映射到本地业务数组；完整机密只落本地，云端仅暂存种子。
  function normList(v) {
    if (!Array.isArray(v)) return [];
    return v.map(x => typeof x === 'string' ? x : (x && (x.text || x.name || x)) || '');
  }
  function adoptSeed(seed) {
    try {
      if (!seed || !seed.type) return { ok: false, err: '种子缺类型' };
      const p = seed.payload || {};
      let tab = 'overview';
      if (seed.type === 'client') {
        const c = {
          id: uid(), name: p.name || seed.title || '未命名客户',
          status: p.status || '意向', signDate: p.signDate || '',
          type: p.type || '', contact: p.contact || '', industry: p.industry || '',
          stage: p.stage || '', next: p.next || '', prio: (p.prio || p.priority || '普通'),
          deliverables: normList(p.deliverables), schedule: normList(p.schedule),
          nodes: normList(p.nodes), todos: normList(p.todos), questions: normList(p.questions),
          risk: { level: p.riskLevel || '无', note: p.riskNote || '' },
          notes: (Array.isArray(p.notes) ? p.notes : (p.notes ? [p.notes] : [])).map(t => ({ date: today(), text: String(t) })),
          created: today()
        };
        biz.clients.unshift(c); tab = 'clients';
      } else if (seed.type === 'meeting') {
        const m = {
          id: uid(), theme: p.theme || seed.title || '会议', time: p.time || '',
          type: p.mtype || '客户沟通', attend: p.attend || [],
          done: false,
          checklist: normList(p.checklist).map(t => ({ text: t, done: false })),
          minutes: p.minutes || '', questions: p.questions || []
        };
        biz.meetings.unshift(m); tab = 'meeting';
        (p.questions || []).forEach(q => biz.freqQuestions.unshift({ q: q, from: m.theme, _mid: m.id, date: today() }));
      } else if (seed.type === 'ppt') {
        const key = (p.pptType === 'standard' || p.pptType === 'auxiliary') ? p.pptType : 'custom';
        biz.ppt[key].unshift({ name: p.name || seed.title || 'PPT', ver: p.ver || '', scene: p.scene || '', src: p.src || '', reuse: false, note: '', updates: [] });
        tab = 'ppt';
      } else if (seed.type === 'material') {
        if (Array.isArray(p.items) && p.items.length) {
          p.items.forEach(it => {
            const title = (it && (it.title || it.name || it)) || '素材';
            biz.content.topics.unshift({ title: String(title), hot: (it && it.hot) || '', form: (it && (it.form || it.angle)) || '', date: today() });
          });
          tab = 'content';
        } else {
          const cat = (p.cat && biz.content[p.cat]) ? p.cat : 'materials';
          if (cat === 'ideas') biz.content.ideas.unshift({ dir: p.name || seed.title || '选题', hot: p.hot || '', form: p.form || '', date: today() });
          else if (cat === 'articles') biz.content.articles.unshift({ title: p.name || seed.title || '文案', body: p.body || '', angle: p.angle || '里里同步', date: today() });
          else biz.content[cat].unshift({ name: p.name || seed.title || '素材', url: p.url || '' });
          tab = 'content';
        }
      } else {
        return { ok: false, err: '未知类型: ' + seed.type };
      }
      save();
      return { ok: true, tab: tab };
    } catch (e) {
      console.error('adoptSeed error', e);
      return { ok: false, err: (e && e.message) || String(e) };
    }
  }
  function openBiz(tab) {
    tab = tab || 'overview';
    const tb = document.querySelector('nav.tabbar button[data-sec="geo"]');
    if (tb) tb.click();
    curTab = tab;
    const bt = document.querySelector('#biz-tabs .biz-tab[data-biz="' + tab + '"]');
    if (bt) { document.querySelectorAll('#biz-tabs .biz-tab').forEach(x => x.classList.remove('active')); bt.classList.add('active'); }
    renderCurrent();
  }
  window.__BIZ__ = { adoptSeed: adoptSeed, openBiz: openBiz };

  /* ---------- 主渲染 ---------- */
  let curTab = 'overview';
  function renderCurrent() {
    const root = $('#biz-root'); if (!root) return;
    ({ overview: renderOverview, clients: renderClients, content: renderContent, ppt: renderPPT, meeting: renderMeeting })[curTab](root);
  }
  function bindTabs() {
    $all('#biz-tabs .biz-tab').forEach(b => b.onclick = () => {
      curTab = b.dataset.biz; $all('#biz-tabs .biz-tab').forEach(x => x.classList.toggle('active', x === b)); renderCurrent();
    });
    const ex = $('#biz-export'), im = $('#biz-import'), imf = $('#biz-import-file'), lk = $('#biz-lock');
    if (ex) ex.onclick = exportBiz;
    if (im) im.onclick = () => imf.click();
    if (imf) imf.onchange = () => { if (imf.files[0]) importBiz(imf.files[0]); imf.value = ''; };
    if (lk) lk.onclick = setPasscode;
  }

  function init() {
    load();
    if (biz.passcode) { lockUI(); }
    bindTabs();
    renderCurrent();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
