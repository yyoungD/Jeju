# Trip timetable

## 실행

```powershell
npm.cmd install
npm.cmd run dev
```

## 실시간 공유와 지도 연결

`.env.example`을 복사해 `.env`로 만들고 값을 입력합니다.

```text
VITE_KAKAO_MAP_KEY=카카오 JavaScript 키
VITE_SUPABASE_URL=Supabase 프로젝트 URL
VITE_SUPABASE_ANON_KEY=Supabase anon 키
```

Supabase SQL Editor에서 아래를 실행한 후 `plan_items` 테이블의 Realtime을 활성화하세요.

```sql
create table public.plan_items (
  id uuid primary key,
  title text not null,
  address text,
  day text not null,
  time text not null,
  color text not null,
  created_at timestamptz default now()
);
alter table public.plan_items enable row level security;
create policy "public plan read" on public.plan_items for select using (true);
create policy "public plan add" on public.plan_items for insert with check (true);
create policy "public plan delete" on public.plan_items for delete using (true);
alter publication supabase_realtime add table public.plan_items;
```

Vercel에 Git 저장소를 연결한 뒤 위 환경변수 3개를 등록하고 배포합니다.
