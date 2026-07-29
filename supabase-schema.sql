-- ============================================================
-- Stella Zuo 工作台 · 云端同步表
-- 运行方式：Supabase 后台 (https://app.supabase.com) → 你的项目
--           → SQL Editor → New query → 粘贴本文件全部内容 → Run
-- 只需运行一次。运行后刷新工作台页面，状态点即变绿「云端已同步」。
-- ============================================================

-- 单表：整包应用状态镜像（后续阶段新增的 GEO/学习/AI 等数据都自动包含在内）
create table if not exists app_state (
  id          text primary key,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  device      text
);

-- 个人单用户应用：anon key 本就公开，这里放开 anon 角色的读写，安全性由该策略界定
alter table app_state enable row level security;

drop policy if exists "anon_all_app_state" on app_state;
create policy "anon_all_app_state"
  on app_state for all
  to anon
  using (true)
  with check (true);

-- （可选）预置一行默认记录；首次同步时应用会自动 upsert，这步可省略
-- insert into app_state (id, payload) values ('stella-main', '{}'::jsonb)
-- on conflict (id) do nothing;
