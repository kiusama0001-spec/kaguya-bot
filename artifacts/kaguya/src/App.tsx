import { type ReactNode, useMemo, useState } from 'react';
import { SignIn } from '@clerk/react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, ArrowDownRight, ArrowUpRight, AudioLines, Bell, BookOpen, Bot, Check,
  ChevronDown, ChevronRight, CircleAlert, Clock3, Command, FileText, Fingerprint,
  Gauge, Image, LogIn, Menu, MessageCircle, MessageSquareText, Search, Settings2, CalendarDays, Trophy,
  Shield, ShieldAlert, ShieldCheck, Users, X, RefreshCw, Plus, Save, RotateCcw, WalletCards, ListFilter, Pencil, Trash2,
} from 'lucide-react';
import {
  useHealthCheck, getHealthCheckQueryKey, useGetDashboard, getGetDashboardQueryKey,
  useListGroups, getListGroupsQueryKey, useListGroupMembers, getListGroupMembersQueryKey,
  useListSanctions, getListSanctionsQueryKey, useCreateSanction, useRestoreSanction,
  useGetGroupSettings, getGetGroupSettingsQueryKey, useUpdateGroupSettings,
  useListTemplates, getListTemplatesQueryKey, useUpdateTemplate,
  useGetBotSettings, getGetBotSettingsQueryKey, useUpdateBotSettings,
  useListPhrases, getListPhrasesQueryKey, useCreatePhrase,
  useListGifs, getListGifsQueryKey, useCreateGif,
  useListReminders, getListRemindersQueryKey, useCreateReminder,
  useListActivity, getListActivityQueryKey, customFetch,
} from '@workspace/api-client-react';
import { Route, Switch, Link, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const nav = [
  { label: 'Overview', href: '/', icon: Gauge, group: 'Workspace' },
  { label: 'Groups', href: '/groups', icon: Users, group: 'Workspace' },
  { label: 'Moderation', href: '/moderation', icon: Shield, group: 'Workspace' },
  { label: 'Messages', href: '/messages', icon: MessageSquareText, group: 'Configure' },
  { label: 'Phrases', href: '/phrases', icon: BookOpen, group: 'Configure' },
  { label: 'GIF library', href: '/gifs', icon: Image, group: 'Configure' },
  { label: 'Reminders', href: '/reminders', icon: Bell, group: 'Configure' },
  { label: 'Events & contests', href: '/events', icon: CalendarDays, group: 'Configure' },
  { label: 'Clients & rent', href: '/clients', icon: WalletCards, group: 'Configure' },
  { label: 'Backups & data', href: '/data', icon: FileText, group: 'Configure' },
  { label: 'Group filters', href: '/filters', icon: ListFilter, group: 'Configure' },
  { label: 'Settings', href: '/settings', icon: Settings2, group: 'Configure' },
  { label: 'Activity', href: '/activity', icon: Activity, group: 'Review' },
];

const niceDate = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const dateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
const pretty = (value?: string) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
const getErrorCode = (error: any) => error?.status ?? error?.response?.status ?? error?.code;
const isUnauthorized = (error: any) => getErrorCode(error) === 401 || getErrorCode(error) === 403;

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
    <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-primary"><span className="h-px w-5 bg-primary" />{eyebrow}</div>
      <h1 className="serif text-4xl leading-none tracking-tight text-foreground md:text-[46px]">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>{action && <div className="shrink-0">{action}</div>}
  </header>;
}
function Button({ children, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'quiet'|'danger' }) {
  const cls = variant === 'primary' ? 'bg-primary text-primary-foreground hover:brightness-95' : variant === 'danger' ? 'bg-destructive text-destructive-foreground hover:brightness-95' : 'border border-border bg-card text-foreground hover:bg-muted';
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${props.className ?? ''}`} />;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`rounded-xl border border-card-border bg-card shadow-sm ${className}`}>{children}</section>; }
function PanelHeading({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>{right}</div>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-2"><span className="text-xs font-semibold text-foreground">{label}</span>{children}{hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}</label>;
}
const inputClass = 'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15';
const areaClass = `${inputClass} min-h-28 resize-y leading-6`;

function QueryState({ query, children, noun = 'records' }: { query: any; children: ReactNode; noun?: string }) {
  if (query.isLoading) return <div className="space-y-3" aria-label="Loading"><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-40 animate-pulse rounded-xl bg-muted" /></div>;
  if (query.isError) return <Panel className="p-8"><div className="mx-auto max-w-md text-center"><div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-accent"><CircleAlert size={20} /></div>
    <h2 className="font-semibold">{isUnauthorized(query.error) ? 'Administrator sign-in required' : 'Could not load this view'}</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{isUnauthorized(query.error) ? 'This information is protected. Sign in with an approved administrator account to continue.' : `Kaguya could not retrieve the ${noun}. Your work has not been changed.`}</p>
    <div className="mt-5 flex justify-center gap-2"><Button variant="quiet" onClick={() => query.refetch()}><RefreshCw size={14}/> Try again</Button>{isUnauthorized(query.error) && <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><LogIn size={14}/> Sign in</Link>}</div>
  </div></Panel>;
  return <>{children}</>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-secondary text-primary"><Fingerprint size={18}/></div><p className="text-sm font-semibold">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{text}</p></div>;
}
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  const color = tone === 'green' ? 'bg-primary/10 text-primary' : tone === 'red' ? 'bg-destructive/10 text-destructive' : tone === 'amber' ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{children}</span>;
}
function PageShell({ children }: { children: ReactNode }) {
  const [location] = useLocation(); const [mobileOpen, setMobileOpen] = useState(false);
  const selected = nav.find(item => item.href === location);
  return <div className="min-h-[100dvh] bg-background md:flex">
    {mobileOpen && <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-foreground/30 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-sidebar text-sidebar-foreground transition-transform md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><AudioLines size={19}/></div>
        <div><div className="serif text-[23px] leading-none">Kaguya</div><div className="mt-1 text-[9px] font-semibold uppercase tracking-[.2em] text-sidebar-foreground/55">Community care</div></div>
        <button onClick={() => setMobileOpen(false)} className="ml-auto md:hidden" aria-label="Close navigation"><X size={17}/></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {['Workspace','Configure','Review'].map(section => <div key={section} className="mb-5">
          <div className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-sidebar-foreground/40">{section}</div>
          <div className="space-y-1">{nav.filter(item => item.group === section).map(item => {
            const Icon = item.icon; const active = item.href === location;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'}`}>
              <Icon size={16} strokeWidth={active ? 2 : 1.7} /><span className="flex-1">{item.label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary"/>}
            </Link>;
          })}</div>
        </div>)}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/60 p-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary/20 text-sidebar-primary"><ShieldCheck size={15}/></div><div className="min-w-0"><div className="text-xs font-semibold">Administrator space</div><div className="mt-0.5 truncate text-[10px] text-sidebar-foreground/55">Protected control room</div></div></div>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <div className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-9">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={18}/></button><div className="text-xs text-muted-foreground">Kaguya <ChevronRight className="mx-1 inline" size={12}/><span className="font-semibold text-foreground">{selected?.label ?? 'Account'}</span></div></div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary"/> Admin access only</div>
      </div>
      <main className="mx-auto max-w-[1440px] px-4 py-7 md:px-9 md:py-9"><div className="fade-in">{children}</div></main>
    </div>
  </div>;
}

function Overview() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false } });
  const stats = dashboard.data;
  const cards = [
    { label: 'Connected groups', value: stats?.groups, icon: Users, sub: 'Telegram communities' },
    { label: 'Members seen', value: stats?.membersSeen, icon: Fingerprint, sub: 'Known to Kaguya' },
    { label: 'Active sanctions', value: stats?.activeSanctions, icon: ShieldAlert, sub: 'Currently in effect' },
    { label: 'Pending reminders', value: stats?.pendingReminders, icon: Bell, sub: 'Scheduled to send' },
  ];
  const botTone = stats?.botStatus === 'online' ? 'green' : stats?.botStatus === 'offline' ? 'red' : 'amber';
  return <><PageTitle eyebrow="Control room" title="Community, in good hands." description="A clear view of what Kaguya knows, what needs attention, and what the bot actually did." action={<Link href="/activity" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted">Review activity <ArrowUpRight size={15}/></Link>}/>
    {dashboard.isError ? <QueryState query={dashboard} noun="dashboard"><></></QueryState> : <>
      <Panel className="mb-5 overflow-hidden"><div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:px-6"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Bot size={22}/></div><div><div className="text-xs font-medium text-muted-foreground">Bot connection</div><div className="mt-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${stats?.botStatus === 'online' ? 'bg-primary' : stats?.botStatus === 'offline' ? 'bg-destructive' : 'bg-accent'}`}/><span className="font-semibold">{stats?.botStatus ? pretty(stats.botStatus) : health.isLoading ? 'Checking status' : 'Status unavailable'}</span></div></div></div>
        <div className="flex flex-wrap items-center gap-3"><Pill tone={botTone}>{stats?.botStatus === 'online' ? 'Connected' : stats?.botStatus === 'needs_setup' ? 'Setup required' : stats?.botStatus === 'offline' ? 'Offline' : 'Awaiting response'}</Pill>{stats?.botStatus === 'needs_setup' && <Link href="/settings" className="text-xs font-semibold text-primary underline underline-offset-4">Review setup</Link>}<span className="text-xs text-muted-foreground">{health.data?.status ? `Service ${health.data.status}` : health.isError ? 'Health check unavailable' : 'Service check in progress'}</span></div>
      </div></Panel>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map((item, i) => { const Icon = item.icon; return <Panel key={item.label} className="p-4 md:p-5"><div className="flex items-start justify-between"><span className="text-xs font-medium text-muted-foreground">{item.label}</span><Icon size={16} className="text-primary"/></div><div className="mt-4 font-mono text-3xl tracking-tight">{dashboard.isLoading ? '—' : (item.value ?? 0).toLocaleString()}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.sub}</div></Panel>; })}</div>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <Panel><PanelHeading title="Recent activity" hint="A record of actions taken across your communities" right={<Link href="/activity" className="text-xs font-semibold text-primary">Full history</Link>}/>
          {dashboard.isLoading ? <div className="space-y-4 p-5"><div className="h-8 animate-pulse rounded bg-muted"/><div className="h-8 animate-pulse rounded bg-muted"/></div> : stats?.recentActivity?.length ? <div className="divide-y divide-border">{stats.recentActivity.slice(0,6).map((item:any) => <ActivityRow key={item.id} item={item}/>)}</div> : <Empty title="No activity recorded" text="Actions will appear here as Kaguya starts helping your communities."/>}
        </Panel>
        <Panel><PanelHeading title="A good place to start" hint="Set up the essentials, then let Kaguya take care of the routine."/>
          <div className="space-y-1 p-3">{[
            {icon:Users,title:'Connect a group',sub:'Review known Telegram groups',href:'/groups'},
            {icon:MessageSquareText,title:'Shape the welcome',sub:'Give new members a thoughtful hello',href:'/messages'},
            {icon:ShieldCheck,title:'Tune moderation',sub:'Confirm the safeguards you want active',href:'/settings'},
          ].map(row=>{const Icon=row.icon;return <Link key={row.title} href={row.href} className="flex items-center gap-3 rounded-lg p-3 transition hover:bg-muted"><div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16}/></div><div className="flex-1"><div className="text-xs font-semibold">{row.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{row.sub}</div></div><ChevronRight size={15} className="text-muted-foreground"/></Link>})}</div>
        </Panel>
      </div>
    </>}
  </>;
}
function ActivityRow({ item }: { item: any }) {
  return <div className="flex items-start gap-3 px-5 py-4"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Activity size={14}/></div><div className="min-w-0 flex-1"><div className="text-sm leading-5">{item.summary}</div><div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground"><span>{pretty(item.action)}</span>{item.actor && <><span>·</span><span>{item.actor}</span></>}{item.groupId && <><span>·</span><span className="mono">{item.groupId}</span></>}</div></div><time className="shrink-0 text-[10px] text-muted-foreground">{dateOnly(item.createdAt)}</time></div>;
}
function Groups() {
  const query = useListGroups({ query: { queryKey: getListGroupsQueryKey(), retry: false } });
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const groups = query.data ?? [];
  const activeId = selected || groups[0]?.chatId || '';
  const members = useListGroupMembers(activeId, { search: search || undefined }, { query: { queryKey: getListGroupMembersQueryKey(activeId, { search: search || undefined }), enabled: !!activeId, retry: false } });
  const settings = useGetGroupSettings(activeId, { query: { queryKey: getGetGroupSettingsQueryKey(activeId), enabled: !!activeId, retry: false } });
  return <><PageTitle eyebrow="Communities" title="Your groups" description="Review communities known to Kaguya and search the members the bot has seen."/>
    <QueryState query={query} noun="groups">{groups.length === 0 ? <Panel><Empty title="No groups connected yet" text="When Kaguya is added to a Telegram group, it will appear here. Group setup is managed in Telegram." /></Panel> : <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Panel><PanelHeading title="Connected groups" hint={`${groups.length} ${groups.length === 1 ? 'community' : 'communities'} in Kaguya's view`}/>
        <div className="divide-y divide-border">{groups.map(group => <button key={group.chatId} onClick={() => setSelected(group.chatId)} className={`flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-muted ${activeId === group.chatId ? 'bg-primary/5' : ''}`}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><MessageCircle size={17}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{group.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{group.memberCount.toLocaleString()} members · Seen {dateOnly(group.lastSeenAt)}</div></div><Pill tone={group.enabled?'green':'neutral'}>{group.enabled?'Enabled':'Paused'}</Pill></button>)}</div>
      </Panel>
      <Panel><PanelHeading title="Member directory" hint={activeId ? `Members seen in ${groups.find(g=>g.chatId===activeId)?.title ?? 'this group'}` : 'Choose a group to review members'} right={<div className="mono text-[10px] text-muted-foreground">{members.data?.length ?? 0} found</div>}/>
        {activeId && <div className="border-b border-border p-4"><div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={15}/><input className={`${inputClass} pl-9`} placeholder="Search name or username" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search group members"/></div></div>}
        {!activeId ? <Empty title="Select a group" text="Choose a connected group to search its member directory."/> : members.isLoading ? <div className="space-y-3 p-5"><div className="h-12 animate-pulse rounded bg-muted"/><div className="h-12 animate-pulse rounded bg-muted"/></div> : members.isError ? <QueryState query={members} noun="members"><></></QueryState> : members.data?.length ? <div className="divide-y divide-border">{members.data.map(member=><div key={member.userId} className="flex items-center gap-3 px-5 py-3.5"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">{member.fullName.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{member.fullName}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{member.username ? `@${member.username}` : `User ${member.userId}`} · last seen {dateOnly(member.lastSeenAt)}</div></div><Pill tone={member.status==='active'?'green':member.status==='banned'?'red':'neutral'}>{pretty(member.status)}</Pill></div>)}</div> : <Empty title={search?'No matching members':'No members recorded'} text={search?'Try a different name or username.':'Kaguya has not recorded members in this group yet.'}/>}
      </Panel>
    </div>}</QueryState></>;
}
function Moderation() {
  const groupsQuery = useListGroups({ query: { queryKey: getListGroupsQueryKey(), retry: false } });
  const groups = groupsQuery.data ?? []; const [groupId,setGroupId]=useState('');
  const currentId=groupId || groups[0]?.chatId || '';
  const [statusFilter,setStatusFilter]=useState('all');
  const sanctionParams={status:statusFilter==='all'?undefined:statusFilter as any};
  const sanctions=useListSanctions(currentId,sanctionParams, {query:{queryKey:getListSanctionsQueryKey(currentId,sanctionParams),enabled:!!currentId,retry:false}});
  const create=useCreateSanction(); const restore=useRestoreSanction(); const client=useQueryClient();
  const [userId,setUserId]=useState(''); const [username,setUsername]=useState(''); const [action,setAction]=useState('ban'); const [reason,setReason]=useState(''); const [duration,setDuration]=useState('');
  const [confirm,setConfirm]=useState<any>(null); const [pendingSanction,setPendingSanction]=useState<any>(null); const [notice,setNotice]=useState('');
  const refresh=()=>{client.invalidateQueries({queryKey:getListSanctionsQueryKey(currentId)});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});client.invalidateQueries({queryKey:getListActivityQueryKey({limit:20})});};
  const submit=(e:React.FormEvent)=>{e.preventDefault(); if(!currentId||!userId.trim())return; setPendingSanction({groupId:currentId,data:{userId:userId.trim(),username:username.trim()||null,action:action as any,reason:reason.trim()||undefined,durationSeconds:duration?Number(duration)*60:undefined}});};
  const applySanction=()=>{if(!pendingSanction)return;create.mutate(pendingSanction,{onSuccess:()=>{setUserId('');setUsername('');setReason('');setDuration('');setNotice('Sanction saved and reflected in the current list.');setPendingSanction(null);refresh();},onError:()=>{setNotice('The action was not saved. Check administrator access and Telegram permissions.');setPendingSanction(null);}});};
  const doRestore=()=>{if(!confirm)return;restore.mutate({sanctionId:confirm.id},{onSuccess:()=>{setNotice(`Restored permissions for ${confirm.username||confirm.userId}.`);setConfirm(null);refresh();},onError:()=>setNotice('Restore failed. The member permissions were not changed.')});};
  return <><PageTitle eyebrow="Safety" title="Moderation desk" description="Apply clear, traceable actions and restore members with their saved Telegram permissions."/>
    {notice&&<div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><Field label="Community"><select className={inputClass} value={currentId} onChange={e=>setGroupId(e.target.value)}>{groups.length?groups.map(g=><option key={g.chatId} value={g.chatId}>{g.title}</option>):<option value="">No groups available</option>}</select></Field><div className="text-xs text-muted-foreground">Actions are sent through Telegram and recorded in the audit history.</div></div>
    <div className="grid items-start gap-5 xl:grid-cols-[.78fr_1.22fr]">
      <Panel><PanelHeading title="Apply an action" hint="Changes take effect immediately in Telegram."/><form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Telegram user ID"><input className={inputClass} value={userId} onChange={e=>setUserId(e.target.value)} required maxLength={32} placeholder="For example, 123456789"/></Field>
        <Field label="Username (optional)"><input className={inputClass} value={username} onChange={e=>setUsername(e.target.value)} placeholder="username"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Action"><select className={inputClass} value={action} onChange={e=>setAction(e.target.value)}><option value="ban">Ban</option><option value="mute">Mute</option><option value="warn">Warn</option><option value="kick">Kick</option></select></Field>
          <Field label="Duration in minutes" hint="Optional; used for timed bans or mutes."><input className={inputClass} type="number" min="1" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="No expiry"/></Field></div>
        <Field label="Reason"><textarea className={areaClass} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="A short, factual reason for the audit trail"/></Field>
        <Button className="w-full" disabled={!currentId||create.isPending}><ShieldAlert size={15}/>{create.isPending?'Applying action…':'Apply moderation action'}</Button>
        {!currentId&&<div className="text-xs text-accent">Connect a group before applying moderation.</div>}
      </form></Panel>
      <Panel><PanelHeading title="Sanction history" hint="Active and past actions for the selected community" right={<select className="rounded-lg border border-input bg-background px-2.5 py-2 text-xs" aria-label="Sanction status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="reversed">Reversed</option></select>}/>
        {sanctions.isLoading ? <div className="space-y-3 p-5"><div className="h-16 animate-pulse rounded bg-muted"/><div className="h-16 animate-pulse rounded bg-muted"/></div> : sanctions.isError ? <QueryState query={sanctions} noun="sanctions"><></></QueryState> : sanctions.data?.length ? <div className="divide-y divide-border">{sanctions.data.map((s:any)=><div key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.status==='active'?'bg-destructive/10 text-destructive':'bg-secondary text-muted-foreground'}`}><Shield size={16}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{pretty(s.action)} · {s.username?`@${s.username}`:`${s.userId}`}<Pill tone={s.status==='active'?'red':s.status==='reversed'?'green':'neutral'}>{pretty(s.status)}</Pill></div><div className="mt-1 text-xs text-muted-foreground">{s.reason||'No reason recorded'} · Applied {niceDate(s.createdAt)}{s.expiresAt?` · Expires ${niceDate(s.expiresAt)}`:''}</div></div>{s.status==='active'&&<Button variant="quiet" disabled={restore.isPending} onClick={()=>setConfirm(s)}><RotateCcw size={14}/> Restore</Button>}</div>)}</div> : <Empty title="No sanctions recorded" text="Moderation actions for this group will appear here, with their current status."/>}
      </Panel>
    </div>
    {confirm&&<div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"><div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent"><RotateCcw size={18}/></div><h2 className="text-lg font-semibold">Restore this member?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Kaguya will restore the permissions saved when this sanction was applied to {confirm.username?`@${confirm.username}`:`user ${confirm.userId}`}. This changes access in Telegram.</p><div className="mt-6 flex justify-end gap-2"><Button variant="quiet" onClick={()=>setConfirm(null)}>Cancel</Button><Button disabled={restore.isPending} onClick={doRestore}>{restore.isPending?'Restoring…':'Confirm restore'}</Button></div></div></div>}
    {pendingSanction&&<div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"><div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive"><ShieldAlert size={18}/></div><h2 className="text-lg font-semibold">Confirm {pretty(pendingSanction.data.action).toLowerCase()}?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This will apply a Telegram action to {pendingSanction.data.username?`@${pendingSanction.data.username}`:`user ${pendingSanction.data.userId}`} in {groups.find(g=>g.chatId===currentId)?.title||'the selected group'}. The result will be recorded in the sanction history.</p><div className="mt-6 flex justify-end gap-2"><Button variant="quiet" onClick={()=>setPendingSanction(null)}>Cancel</Button><Button variant="danger" disabled={create.isPending} onClick={applySanction}>{create.isPending?'Applying…':'Confirm action'}</Button></div></div></div>}
  </>;
}
function Messages() {
  const q=useListTemplates({query:{queryKey:getListTemplatesQueryKey(),retry:false}});
  const update=useUpdateTemplate(); const client=useQueryClient(); const [draft,setDraft]=useState<Record<string,{text:string;imageFileId:string}>>({});const [saved,setSaved]=useState('');
  const types=['welcome','goodbye','ban','mute','warn','kick'];
  const save=(template:any)=>{const value=draft[template.type]??{text:template.text,imageFileId:template.imageFileId||''};update.mutate({templateType:template.type,data:{text:value.text,imageFileId:value.imageFileId||null}},{onSuccess:()=>{setSaved(template.type);client.invalidateQueries({queryKey:getListTemplatesQueryKey()});},onError:()=>setSaved('error')});};
  return <><PageTitle eyebrow="Voice & tone" title="Message templates" description="Keep Kaguya's messages useful, warm, and unmistakably yours. Telegram placeholders are preserved as written."/>
    <QueryState query={q} noun="message templates">{q.data?.length===0?<Panel><Empty title="No templates available" text="Templates have not been configured by the service yet. Check back after setup." /></Panel>:<div className="grid gap-4 xl:grid-cols-2">{(q.data??[]).map((t:any)=>{const value=draft[t.type]??{text:t.text,imageFileId:t.imageFileId||''};return <Panel key={t.type}><PanelHeading title={pretty(t.type)} hint={`Last saved ${niceDate(t.updatedAt)}`} right={saved===t.type?<Pill tone="green">Saved</Pill>:null}/><div className="space-y-4 p-5"><Field label="Message text"><textarea className={`${areaClass} min-h-32`} maxLength={2000} value={value.text} onChange={e=>setDraft(old=>({...old,[t.type]:{...value,text:e.target.value}}))} placeholder="Write a message for this moment…"/></Field><Field label="Telegram image file ID" hint="Optional. Store a Telegram file ID only; this field does not upload media."><input className={inputClass} value={value.imageFileId} onChange={e=>setDraft(old=>({...old,[t.type]:{...value,imageFileId:e.target.value}}))} placeholder="No image attached"/></Field><div className="flex justify-end"><Button disabled={update.isPending} onClick={()=>save(t)}><Save size={14}/>{update.isPending?'Saving…':'Save template'}</Button></div></div></Panel>})}</div>}</QueryState>
  </>;
}
function Phrases() {
  const create=useCreatePhrase();const client=useQueryClient();
  const [category,setCategory]=useState('');const [tone,setTone]=useState('');const [text,setText]=useState('');const [filter,setFilter]=useState('');const [filterCategory,setFilterCategory]=useState('');const [page,setPage]=useState(0);const [notice,setNotice]=useState('');
  const q=useListPhrases({category:filterCategory||undefined,search:filter.trim()||undefined,limit:100,offset:page*100},{query:{retry:false}});
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editDraft,setEditDraft]=useState<{category:string;tone:string;text:string;enabled:boolean}|null>(null);
  const updatePhrase=useMutation({mutationFn:(payload:{id:string;category:string;tone:string;text:string;enabled:boolean})=>customFetch(`/api/phrases/${encodeURIComponent(payload.id)}`,{method:'PATCH',body:JSON.stringify({category:payload.category,tone:payload.tone,text:payload.text,enabled:payload.enabled})}),onSuccess:async()=>{setEditingId(null);setEditDraft(null);setNotice('Phrase updated.');await client.invalidateQueries({queryKey:getListPhrasesQueryKey()});},onError:()=>setNotice('Phrase was not updated. Check duplicates and administrator access.')});
  const deletePhrase=useMutation({mutationFn:(id:string)=>customFetch(`/api/phrases/${encodeURIComponent(id)}`,{method:'DELETE'}),onSuccess:async()=>{setNotice('Phrase deleted.');await client.invalidateQueries({queryKey:getListPhrasesQueryKey()});},onError:()=>setNotice('Phrase could not be deleted.')});
  const filtered=q.data??[];
  const phraseCategories=['personalidad_conversacion_general','especial_kiu','especial_kalu','moderacion_administracion','pokemon_pokedex','gifs_bromas_reacciones','recordatorios_clientes_rentas_pagos','bdsm_educativo','eventos_bienvenidas_despedidas_concursos','ayuda_errores_comandos','ia_estados_animo_contexto'];
  const add=(e:React.FormEvent)=>{e.preventDefault();create.mutate({data:{category:category.trim(),tone:tone.trim()||undefined,text:text.trim()}},{onSuccess:()=>{setCategory('');setTone('');setText('');setNotice('Phrase saved to the library.');client.invalidateQueries({queryKey:getListPhrasesQueryKey()});},onError:()=>setNotice('Phrase was not saved. Check administrator access and duplicate text.')})};
  const beginEdit=(p:any)=>{setEditingId(p.id);setEditDraft({category:p.category,tone:p.tone??'',text:p.text,enabled:Boolean(p.enabled)});};
  const saveEdit=()=>{if(!editingId||!editDraft)return;if(!editDraft.category.trim()||!editDraft.text.trim()){setNotice('Category and phrase text are required.');return;}updatePhrase.mutate({id:editingId,...editDraft,category:editDraft.category.trim(),tone:editDraft.tone.trim(),text:editDraft.text.trim()});};
  const toggleEnabled=(p:any)=>updatePhrase.mutate({id:p.id,category:p.category,tone:p.tone??'',text:p.text,enabled:!p.enabled});
  return <><PageTitle eyebrow="Response library" title="Phrases" description="Search, add, edit, disable or remove responses. The bot selects enabled phrases from the category that matches the situation."/>
    {notice&&<div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.72fr_1.28fr]"><Panel><PanelHeading title="Add a phrase" hint="The server rejects duplicate text."/><form onSubmit={add} className="space-y-4 p-5"><Field label="Category"><input className={inputClass} required maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} placeholder="personalidad_conversacion_general"/></Field><Field label="Tone" hint="Optional cue for how this phrase should sound."><input className={inputClass} maxLength={80} value={tone} onChange={e=>setTone(e.target.value)} placeholder="Warm, concise…"/></Field><Field label="Phrase"><textarea className={areaClass} required maxLength={2000} value={text} onChange={e=>setText(e.target.value)} placeholder="Write the response…"/></Field><Button className="w-full" disabled={create.isPending}><Plus size={15}/>{create.isPending?'Adding phrase…':'Add phrase'}</Button></form></Panel>
      <Panel><PanelHeading title="Phrase library" hint={`${filtered.length} phrases on this page · page ${page+1}`} right={<div className="flex flex-wrap gap-2"><select aria-label="Filter phrase category" className="max-w-48 rounded-lg border border-input bg-background px-2 py-2 text-xs" value={filterCategory} onChange={e=>{setFilterCategory(e.target.value);setPage(0)}}><option value="">All categories</option>{phraseCategories.map(item=><option key={item} value={item}>{pretty(item)}</option>)}</select><div className="relative"><Search className="absolute left-2.5 top-2.5 text-muted-foreground" size={14}/><input className="w-44 rounded-lg border border-input bg-background py-2 pl-8 pr-2 text-xs outline-none focus:border-primary" placeholder="Search all phrases" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0)}}/></div></div>}/>
        <QueryState query={q} noun="phrases">{filtered.length? <div className="divide-y divide-border">{filtered.map((p:any)=><div key={p.id} className="p-5">{editingId===p.id&&editDraft?<div className="space-y-3"><Field label="Category"><input className={inputClass} maxLength={80} value={editDraft.category} onChange={e=>setEditDraft({...editDraft,category:e.target.value})}/></Field><Field label="Tone"><input className={inputClass} maxLength={80} value={editDraft.tone} onChange={e=>setEditDraft({...editDraft,tone:e.target.value})}/></Field><Field label="Phrase text"><textarea className={areaClass} maxLength={4000} value={editDraft.text} onChange={e=>setEditDraft({...editDraft,text:e.target.value})}/></Field><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editDraft.enabled} onChange={e=>setEditDraft({...editDraft,enabled:e.target.checked})}/>Available to the bot</label><div className="flex flex-wrap gap-2"><Button disabled={updatePhrase.isPending} onClick={saveEdit}><Save size={14}/>{updatePhrase.isPending?'Saving…':'Save changes'}</Button><Button variant="quiet" onClick={()=>{setEditingId(null);setEditDraft(null)}}>Cancel</Button></div></div>:<><div className="mb-2 flex flex-wrap items-center gap-2"><Pill tone="green">{p.category}</Pill>{p.tone&&<Pill>{p.tone}</Pill>}<span className="ml-auto text-[10px] text-muted-foreground">{p.enabled?'Available':'Disabled'}</span></div><p className="text-sm leading-6">{p.text}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="quiet" onClick={()=>beginEdit(p)}><Pencil size={13}/>Edit</Button><Button variant="quiet" disabled={updatePhrase.isPending} onClick={()=>toggleEnabled(p)}>{p.enabled?'Disable':'Enable'}</Button><Button variant="danger" disabled={deletePhrase.isPending} onClick={()=>{if(window.confirm('Delete this phrase permanently?'))deletePhrase.mutate(p.id)}}><Trash2 size={13}/>Delete</Button></div></>}</div>)}</div>:<Empty title={filter?'No phrases match':'The library is quiet for now'} text={filter?'Try a shorter search.':'Add the first response above to begin the phrase library.'}/>}</QueryState>
        <div className="flex items-center justify-between border-t border-border px-5 py-3"><span className="text-xs text-muted-foreground">Search and category filters run on the server across the full phrase library.</span><div className="flex gap-2"><Button variant="quiet" disabled={page===0||q.isFetching} onClick={()=>setPage(value=>Math.max(0,value-1))}>Previous</Button><Button variant="quiet" disabled={filtered.length<100||q.isFetching} onClick={()=>setPage(value=>value+1)}>Next</Button></div></div>
      </Panel></div>
  </>;
}
function Gifs() {
  const q=useListGifs({query:{queryKey:getListGifsQueryKey(),retry:false}});const create=useCreateGif();const client=useQueryClient();const [category,setCategory]=useState('');const [fileId,setFileId]=useState('');const [notice,setNotice]=useState('');
  const remove=useMutation({mutationFn:(id:string)=>customFetch(`/api/gifs/${encodeURIComponent(id)}`,{method:'DELETE'}),onSuccess:async()=>{setNotice('GIF reference removed.');await client.invalidateQueries({queryKey:getListGifsQueryKey()});},onError:()=>setNotice('GIF reference could not be removed.')});
  const submit=(e:React.FormEvent)=>{e.preventDefault();create.mutate({data:{category:category.trim(),fileId:fileId.trim()}},{onSuccess:()=>{setCategory('');setFileId('');setNotice('Telegram reference saved.');client.invalidateQueries({queryKey:getListGifsQueryKey()});},onError:()=>setNotice('Reference was not saved. Check the file ID and administrator access.')})};
  return <><PageTitle eyebrow="Telegram media" title="GIF library" description="Catalog Telegram animation file IDs by category. Kaguya stores references; it does not upload or preview media here."/>
    {notice&&<div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.72fr_1.28fr]"><Panel><PanelHeading title="Save a file ID" hint="Use an ID copied from Telegram."/><form onSubmit={submit} className="space-y-4 p-5"><Field label="Category"><input className={inputClass} required maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} placeholder="Celebration, welcome…"/></Field><Field label="Telegram file ID" hint="File IDs are operational references and are shown only to administrators."><input className={inputClass} required maxLength={512} value={fileId} onChange={e=>setFileId(e.target.value)} placeholder="Paste Telegram file ID"/></Field><Button className="w-full" disabled={create.isPending}><Plus size={15}/>{create.isPending?'Saving…':'Add to library'}</Button></form></Panel>
      <Panel><PanelHeading title="Saved references" hint={`${q.data?.length??0} file IDs cataloged`}/>
        <QueryState query={q} noun="GIF references">{q.data?.length?<div className="divide-y divide-border">{q.data.map((item:any)=><div key={item.id} className="flex items-center gap-3 px-5 py-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Image size={17}/></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{item.category}</div><div className="mono mt-1 truncate text-[11px] text-muted-foreground">{item.fileId}</div></div><div className="text-right"><div className="mono text-sm">{item.usageCount}</div><div className="text-[10px] text-muted-foreground">uses</div></div><Button variant="danger" disabled={remove.isPending} onClick={()=>{if(window.confirm('Remove this GIF from the library?'))remove.mutate(item.id)}} aria-label="Delete GIF"><Trash2 size={13}/></Button></div>)}</div>:<Empty title="Nothing cataloged yet" text="Save a Telegram file ID above. No media is invented or displayed without a Telegram preview endpoint."/>}</QueryState>
      </Panel></div>
  </>;
}
function Reminders() {
  const q=useListReminders({query:{queryKey:getListRemindersQueryKey(),retry:false}});const groups=useListGroups({query:{queryKey:getListGroupsQueryKey(),retry:false}});const create=useCreateReminder();const client=useQueryClient();const cancel=useMutation({mutationFn:(id:string)=>customFetch(`/api/reminders/${encodeURIComponent(id)}`,{method:'DELETE'}),onSuccess:async()=>{setNotice('Reminder cancelled.');await client.invalidateQueries({queryKey:getListRemindersQueryKey()});await client.invalidateQueries({queryKey:getGetDashboardQueryKey()});},onError:()=>setNotice('Reminder could not be cancelled because it may already be sending or complete.')});const retry=useMutation({mutationFn:(id:string)=>customFetch(`/api/reminders/${encodeURIComponent(id)}/retry`,{method:'POST'}),onSuccess:async()=>{setNotice('Reminder queued for manual retry.');await client.invalidateQueries({queryKey:getListRemindersQueryKey()});await client.invalidateQueries({queryKey:getGetDashboardQueryKey()});},onError:()=>setNotice('Reminder was not retried. Refresh the delivery state and review the error.')});const [chatId,setChatId]=useState('');const [text,setText]=useState('');const [dueAt,setDueAt]=useState('');const [notice,setNotice]=useState('');
  const submit=(e:React.FormEvent)=>{e.preventDefault();create.mutate({data:{chatId:chatId.trim(),text:text.trim(),dueAt:new Date(dueAt).toISOString()}},{onSuccess:()=>{setText('');setDueAt('');setNotice('Reminder scheduled and persisted.');client.invalidateQueries({queryKey:getListRemindersQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});},onError:()=>setNotice('Reminder was not scheduled. Check the group and administrator access.')})};
  return <><PageTitle eyebrow="Keep the promise" title="Reminders" description="Schedule a message for a Telegram group and verify its delivery status here."/>
    {notice&&<div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.72fr_1.28fr]"><Panel><PanelHeading title="Schedule a message" hint="Times are interpreted in your browser's local timezone."/><form onSubmit={submit} className="space-y-4 p-5"><Field label="Telegram group"><select className={inputClass} required value={chatId} onChange={e=>setChatId(e.target.value)}><option value="">Select a group</option>{(groups.data??[]).map(g=><option key={g.chatId} value={g.chatId}>{g.title}</option>)}</select></Field><Field label="Message"><textarea className={areaClass} required maxLength={2000} value={text} onChange={e=>setText(e.target.value)} placeholder="What should Kaguya remind them about?"/></Field><Field label="Send at"><input className={inputClass} type="datetime-local" required value={dueAt} onChange={e=>setDueAt(e.target.value)} min={new Date().toISOString().slice(0,16)}/></Field><Button className="w-full" disabled={create.isPending||groups.isLoading}><Clock3 size={15}/>{create.isPending?'Scheduling…':'Schedule reminder'}</Button></form></Panel>
      <Panel><PanelHeading title="Scheduled messages" hint="Delivery state returned by Kaguya"/>
        <QueryState query={q} noun="reminders">{q.data?.length?<div className="divide-y divide-border">{q.data.map((r:any)=><div key={r.id} className="flex items-start gap-3 px-5 py-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Bell size={15}/></div><div className="min-w-0 flex-1"><p className="text-sm leading-5">{r.text}</p><div className="mono mt-1 text-[10px] text-muted-foreground">{r.chatId} · {niceDate(r.dueAt)}</div>{r.status==='failed'&&r.lastError&&<p className="mt-1 text-xs text-red-600">{r.lastError}</p>}</div><Pill tone={r.status==='sent'?'green':r.status==='failed'?'red':r.status==='pending'?'amber':'neutral'}>{pretty(r.status)}</Pill>{r.status==='pending'&&<Button variant="quiet" disabled={cancel.isPending} onClick={()=>{if(window.confirm('Cancel this reminder?'))cancel.mutate(r.id)}}><X size={13}/>Cancel</Button>}{r.status==='failed'&&<Button variant="quiet" disabled={retry.isPending} onClick={()=>{if(window.confirm('The previous send may have reached Telegram before Kaguya stopped. Check the chat first; retrying without checking may duplicate the message. Queue a manual retry anyway?'))retry.mutate(r.id)}}><RefreshCw size={13}/>Retry after checking</Button>}</div>)}</div>:<Empty title="Nothing scheduled" text="Once you schedule a message, its time and delivery status will be tracked here."/>}</QueryState>
      </Panel></div>
  </>;
}
function Settings() {
  const bot=useGetBotSettings({query:{queryKey:getGetBotSettingsQueryKey(),retry:false}});
  const groups=useListGroups({query:{queryKey:getListGroupsQueryKey(),retry:false}});
  const updateBot=useUpdateBotSettings(); const client=useQueryClient();
  const [groupId,setGroupId]=useState('');const activeId=groupId||groups.data?.[0]?.chatId||'';
  const groupSettings=useGetGroupSettings(activeId,{query:{queryKey:getGetGroupSettingsQueryKey(activeId),enabled:!!activeId,retry:false}});
  const updateGroup=useUpdateGroupSettings();
  const [botDraft,setBotDraft]=useState<any>(null);const [groupDraft,setGroupDraft]=useState<any>(null);const [message,setMessage]=useState('');
  const bd=botDraft??bot.data;const gd=groupDraft??groupSettings.data;
  const saveBot=()=>{if(!bd)return;updateBot.mutate({data:{aiEnabled:bd.aiEnabled,personality:bd.personality,timezone:bd.timezone}},{onSuccess:()=>{setBotDraft(null);setMessage('Bot settings saved.');client.invalidateQueries({queryKey:getGetBotSettingsQueryKey()});},onError:()=>setMessage('Bot settings were not saved. Check your administrator access.')});};
  const saveGroup=()=>{if(!gd||!activeId)return;updateGroup.mutate({groupId:activeId,data:{enabled:gd.enabled,aiEnabled:gd.aiEnabled,moderationEnabled:gd.moderationEnabled,antiFloodEnabled:gd.antiFloodEnabled,welcomeText:gd.welcomeText,goodbyeText:gd.goodbyeText}},{onSuccess:()=>{setGroupDraft(null);setMessage('Community settings saved.');client.invalidateQueries({queryKey:getGetGroupSettingsQueryKey(activeId)});client.invalidateQueries({queryKey:getListGroupsQueryKey()});},onError:()=>setMessage('Community settings were not saved.')});};
  const flip=(obj:any,setter:any,key:string)=>setter({...obj,[key]:!obj[key]});
  return <><PageTitle eyebrow="Bot configuration" title="Settings" description="Set Kaguya's global behavior and group-level safeguards. Setup checks report status only; credentials are never shown here."/>
    {message&&<div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</div>}
    <div className="space-y-5">
      <Panel><PanelHeading title="Bot behavior" hint="Applies across the service. Secret values are never displayed."/>
        <QueryState query={bot} noun="bot settings">{bd&&<div className="grid gap-6 p-5 lg:grid-cols-[1fr_.85fr]"><div className="space-y-5"><SwitchRow title="AI responses" description="Allow Kaguya to use its configured AI behavior." checked={bd.aiEnabled} onChange={()=>setBotDraft({...bd,aiEnabled:!bd.aiEnabled})}/>
          <Field label="Personality" hint="Describe the response style. Do not include credentials or private member information."><textarea className={`${areaClass} min-h-40`} maxLength={12000} value={bd.personality} onChange={e=>setBotDraft({...bd,personality:e.target.value})} placeholder="Describe how Kaguya should speak…"/></Field>
          <div className="max-w-sm"><Field label="Timezone" hint="Used when interpreting scheduled tasks."><input className={inputClass} maxLength={100} value={bd.timezone} onChange={e=>setBotDraft({...bd,timezone:e.target.value})} placeholder="For example, Europe/London"/></Field></div><Button disabled={updateBot.isPending} onClick={saveBot}><Save size={14}/>{updateBot.isPending?'Saving…':'Save bot settings'}</Button></div>
          <div className="rounded-xl bg-muted/70 p-5"><div className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-primary"/>Setup status</div><div className="space-y-3"><SetupLine label="Telegram connection" ready={bd.telegramConfigured}/><SetupLine label="AI provider configuration" ready={bd.groqConfigured}/></div><p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Only configuration status is shown. Tokens and provider credentials remain private and are not returned to this screen.</p></div>
        </div>}</QueryState>
      </Panel>
      <Panel><PanelHeading title="Group modules" hint="Individual switches apply only to the selected community." right={<select className="max-w-[220px] rounded-lg border border-input bg-background px-3 py-2 text-xs" value={activeId} onChange={e=>{setGroupId(e.target.value);setGroupDraft(null)}}><option value="">Select a group</option>{(groups.data??[]).map(g=><option key={g.chatId} value={g.chatId}>{g.title}</option>)}</select>}/>
        {!activeId?<Empty title="No community selected" text="Connect a Telegram group to manage its modules."/>:<QueryState query={groupSettings} noun="group settings">{gd&&<div className="grid gap-5 p-5 lg:grid-cols-2"><div className="space-y-1">{[['enabled','Kaguya enabled','Allow Kaguya to operate in this group.'],['aiEnabled','AI responses','Use configured AI behavior for this community.'],['moderationEnabled','Moderation','Apply configured moderation safeguards.'],['antiFloodEnabled','Anti-flood','Detect rapid message bursts.']].map(([key,title,description]:any)=><SwitchRow key={key} title={title} description={description} checked={gd[key]} onChange={()=>flip(gd,setGroupDraft,key)}/>)}</div><div className="space-y-4"><Field label="Welcome message"><textarea className={areaClass} maxLength={2000} value={gd.welcomeText} onChange={e=>setGroupDraft({...gd,welcomeText:e.target.value})}/></Field><Field label="Goodbye message"><textarea className={areaClass} maxLength={2000} value={gd.goodbyeText} onChange={e=>setGroupDraft({...gd,goodbyeText:e.target.value})}/></Field><Button disabled={updateGroup.isPending} onClick={saveGroup}><Save size={14}/>{updateGroup.isPending?'Saving…':'Save group settings'}</Button></div></div>}</QueryState>}
      </Panel>
    </div>
  </>;
}
function SwitchRow({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:()=>void}) {
  return <button type="button" onClick={onChange} role="switch" aria-checked={checked} className="flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition hover:bg-muted"><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked?'bg-primary':'bg-muted-foreground/30'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${checked?'translate-x-[18px] translate-x-4':'translate-x-0.5'}`}/></span><span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span></span><span className={`text-[10px] font-semibold ${checked?'text-primary':'text-muted-foreground'}`}>{checked?'On':'Off'}</span></button>;
}
function SetupLine({label,ready}:{label:string;ready:boolean}) {
  return <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-3"><span className="text-xs font-medium">{label}</span><Pill tone={ready?'green':'amber'}>{ready?'Configured':'Setup required'}</Pill></div>;
}
function makeClientUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : ((random & 0x3) | 0x8)).toString(16);
  });
}

type ClientRecord = {
  id: string; name: string; contact: string | null; telegramChatId: string | null; notes: string;
  rentAmountCents: number; dueDay: number; status: 'active' | 'inactive'; createdAt: string;
  currentPeriod?: string; currentDueAt?: string | null; currentPaidCents?: number; currentBalanceCents?: number; currentOverpaymentCents?: number;
};
type PaymentRecord = {
  id: string; clientId: string; amountCents: number; period: string | null; method: string;
  notes: string; paidAt: string; actor: string | null; idempotencyKey?: string;
};
const formatMoney = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

function ClientsPage() {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['kaguya-clients'], queryFn: () => customFetch<ClientRecord[]>('/api/clients'), retry: false });
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [rent, setRent] = useState('0');
  const [dueDay, setDueDay] = useState('1');
  const [notes, setNotes] = useState('');
  const [payingClient, setPayingClient] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentPeriod, setPaymentPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentKey, setPaymentKey] = useState(() => makeClientUuid());
  const [notice, setNotice] = useState('');
  const payments = useQuery({
    queryKey: ['kaguya-client-payments', payingClient],
    queryFn: () => customFetch<PaymentRecord[]>(`/api/clients/${encodeURIComponent(payingClient)}/payments`),
    enabled: Boolean(payingClient), retry: false,
  });
  const createClient = useMutation({
    mutationFn: (payload: Record<string, unknown>) => customFetch<ClientRecord>('/api/clients', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      setName(''); setContact(''); setTelegramChatId(''); setRent('0'); setDueDay('1'); setNotes('');
      setNotice('Cliente registrado.'); await client.invalidateQueries({ queryKey: ['kaguya-clients'] });
    }, onError: () => setNotice('No se pudo guardar el cliente; revisa los datos y tu acceso administrativo.'),
  });
  const createPayment = useMutation({
    mutationFn: (payload: { clientId: string; amountCents: number; period: string; method: string; notes: string; idempotencyKey: string }) => customFetch<PaymentRecord>(`/api/clients/${encodeURIComponent(payload.clientId)}/payments`, { method: 'POST', body: JSON.stringify({ amountCents: payload.amountCents, period: payload.period || null, method: payload.method, notes: payload.notes, idempotencyKey: payload.idempotencyKey }) }),
    onSuccess: async () => {
      setPaymentAmount(''); setPaymentNotes(''); setPaymentKey(makeClientUuid()); setNotice('Pago registrado en el historial.');
      await client.invalidateQueries({ queryKey: ['kaguya-client-payments', payingClient] }); await client.invalidateQueries({ queryKey: ['kaguya-clients'] });
    }, onError: () => setNotice('No se pudo registrar el pago; no se muestra como confirmado.'),
  });
  const addClient = (event: React.FormEvent) => {
    event.preventDefault();
    const rentNumber = Number(rent);
    const due = Number(dueDay);
    if (!name.trim() || !Number.isFinite(rentNumber) || rentNumber < 0 || !Number.isInteger(due) || due < 1 || due > 31) {
      setNotice('Verifica el nombre, la renta mensual y un día de vencimiento entre 1 y 31.'); return;
    }
    createClient.mutate({ name: name.trim(), contact: contact.trim() || null, telegramChatId: telegramChatId.trim() || null, rentAmountCents: Math.round(rentNumber * 100), dueDay: due, notes: notes.trim() });
  };
  const addPayment = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!payingClient || !Number.isFinite(amount) || amount <= 0) { setNotice('Indica un importe de pago positivo.'); return; }
    createPayment.mutate({ clientId: payingClient, amountCents: Math.round(amount * 100), period: paymentPeriod, method: paymentMethod, notes: paymentNotes.trim(), idempotencyKey: paymentKey });
  };
  return <><PageTitle eyebrow="Client records" title="Clients & rent" description="Manage client records, monthly rent values, due dates and the payment history. Amounts are stored as integer cents." />
    {notice && <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.72fr_1.28fr]">
      <Panel><PanelHeading title="Add a client" hint="Create a persistent record in PostgreSQL."/><form onSubmit={addClient} className="space-y-4 p-5">
        <Field label="Name"><input className={inputClass} required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Client or tenant name"/></Field>
        <Field label="Contact (optional)"><input className={inputClass} maxLength={200} value={contact} onChange={e=>setContact(e.target.value)} placeholder="Email or phone"/></Field>
        <Field label="Telegram chat ID (optional)" hint="Use a numeric chat ID only; no bot token or password."><input className={inputClass} maxLength={24} value={telegramChatId} onChange={e=>setTelegramChatId(e.target.value)} placeholder="-100…"/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Monthly rent (MXN)"><input className={inputClass} type="number" min="0" step="0.01" required value={rent} onChange={e=>setRent(e.target.value)}/></Field><Field label="Due day"><input className={inputClass} type="number" min="1" max="31" step="1" required value={dueDay} onChange={e=>setDueDay(e.target.value)}/></Field></div>
        <Field label="Notes"><textarea className={areaClass} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
        <Button className="w-full" disabled={createClient.isPending}><Plus size={15}/>{createClient.isPending?'Saving…':'Save client'}</Button>
      </form></Panel>
      <Panel><PanelHeading title="Client register" hint={`${q.data?.length ?? 0} records`} right={<Button variant="quiet" onClick={()=>q.refetch()}><RefreshCw size={14}/>Refresh</Button>}/>
        <QueryState query={q} noun="clients">{q.data?.length ? <div className="divide-y divide-border">{q.data.map(record=><div key={record.id} className="px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><WalletCards size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{record.name}</span><Pill tone={record.status==='active'?'green':'neutral'}>{pretty(record.status)}</Pill></div><p className="mt-1 text-xs text-muted-foreground">{record.contact || 'No contact'}{record.telegramChatId?` · Telegram ${record.telegramChatId}`:''}</p><p className="mt-2 text-sm">{formatMoney(record.rentAmountCents)} monthly · Due day {record.dueDay}</p>{record.currentPeriod&&<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="text-muted-foreground">Period {record.currentPeriod}</span><span>Paid: <strong>{formatMoney(record.currentPaidCents??0)}</strong></span><span className={(record.currentBalanceCents??0)>0?'text-destructive':'text-primary'}>Balance: <strong>{formatMoney(record.currentBalanceCents??0)}</strong></span>{(record.currentOverpaymentCents??0)>0&&<span>Credit: <strong>{formatMoney(record.currentOverpaymentCents??0)}</strong></span>}</div>}{record.notes&&<p className="mt-1 text-xs leading-5 text-muted-foreground">{record.notes}</p>}</div><Button variant="quiet" onClick={()=>setPayingClient(old=>old===record.id?'':record.id)}><ReceiptIcon/>{payingClient===record.id?'Hide payments':'Payments'}</Button></div>
          {payingClient===record.id&&<div className="mt-4 rounded-lg border border-border bg-muted/30 p-4"><div className="mb-3 text-xs font-semibold">Payment history</div>
            {payments.isLoading?<p className="text-xs text-muted-foreground">Loading payments…</p>:payments.isError?<p className="text-xs text-destructive">Could not retrieve payment history.</p>:payments.data?.length?<div className="mb-4 space-y-2">{payments.data.map(payment=><div key={payment.id} className="flex flex-wrap justify-between gap-2 text-xs"><span>{payment.period || 'Unspecified period'} · {pretty(payment.method)} · {niceDate(payment.paidAt)}</span><strong>{formatMoney(payment.amountCents)}</strong></div>)}</div>:<p className="mb-4 text-xs text-muted-foreground">No payments recorded for this client.</p>}
            <form onSubmit={addPayment} className="grid gap-3 sm:grid-cols-2"><Field label="Amount (MXN)"><input className={inputClass} type="number" min="0.01" step="0.01" required value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></Field><Field label="Period"><input className={inputClass} type="month" value={paymentPeriod} onChange={e=>setPaymentPeriod(e.target.value)}/></Field><Field label="Method"><select className={inputClass} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></Field><Field label="Notes"><input className={inputClass} maxLength={1000} value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)} placeholder="Optional"/></Field><div className="sm:col-span-2"><Button disabled={createPayment.isPending}><Plus size={14}/>{createPayment.isPending?'Registering…':'Register payment'}</Button></div></form>
          </div>}
        </div>)}</div>:<Empty title="No clients recorded" text="Create a client to track the agreed monthly rent and save payment history."/>}</QueryState>
      </Panel>
    </div>
  </>;
}
function ReceiptIcon() { return <FileText size={14}/>; }

type FilterRecord = { id: string; groupId: string; pattern: string; isException: boolean; enabled: boolean; createdAt: string };
function FiltersPage() {
  const groups = useListGroups({ query: { queryKey: getListGroupsQueryKey(), retry: false } });
  const client = useQueryClient();
  const [groupId, setGroupId] = useState('');
  const activeGroupId = groupId || groups.data?.[0]?.chatId || '';
  const [pattern, setPattern] = useState('');
  const [isException, setIsException] = useState(false);
  const [notice, setNotice] = useState('');
  const q = useQuery({ queryKey: ['kaguya-filters', activeGroupId], queryFn: () => customFetch<FilterRecord[]>(`/api/groups/${encodeURIComponent(activeGroupId)}/filters`), enabled: Boolean(activeGroupId), retry: false });
  const add = useMutation({
    mutationFn: (payload: { pattern: string; isException: boolean }) => customFetch<FilterRecord>(`/api/groups/${encodeURIComponent(activeGroupId)}/filters`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => { setPattern(''); setIsException(false); setNotice('Filter saved for this group.'); await client.invalidateQueries({ queryKey: ['kaguya-filters', activeGroupId] }); },
    onError: () => setNotice('Filter was not saved. Check the rule and administrator permissions.'),
  });
  const remove = useMutation({
    mutationFn: (filterId: string) => customFetch(`/api/groups/${encodeURIComponent(activeGroupId)}/filters/${encodeURIComponent(filterId)}`, { method: 'DELETE' }),
    onSuccess: async () => { setNotice('Filter deleted.'); await client.invalidateQueries({ queryKey: ['kaguya-filters', activeGroupId] }); },
    onError: () => setNotice('Filter could not be deleted.'),
  });
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!pattern.trim() || !activeGroupId) return; add.mutate({ pattern: pattern.trim(), isException }); };
  return <><PageTitle eyebrow="Group safeguards" title="Group filters" description="Manage literal text filters and exceptions independently for each Telegram group. Matching messages are removed only when Telegram grants delete-message permissions." />
    {notice && <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <Panel><PanelHeading title="Filter rules" hint="Exceptions take precedence when their text also appears in a message." right={<select aria-label="Telegram group" className="max-w-[260px] rounded-lg border border-input bg-background px-3 py-2 text-xs" value={activeGroupId} onChange={e=>setGroupId(e.target.value)}><option value="">Select a group</option>{(groups.data??[]).map(group=><option key={group.chatId} value={group.chatId}>{group.title}</option>)}</select>}/>
      {!activeGroupId?<Empty title="No group detected" text="Add Kaguya to a Telegram group and send a message before configuring filters."/>:<div className="grid items-start gap-5 p-5 xl:grid-cols-[.65fr_1.35fr]">
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border p-4"><Field label="Text to match"><input className={inputClass} required maxLength={120} value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="Example: a prohibited phrase"/></Field><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={isException} onChange={e=>setIsException(e.target.checked)} className="mt-1"/><span><strong className="block">Exception</strong><span className="text-xs leading-5 text-muted-foreground">If enabled, this phrase exempts the matching message from all text filters.</span></span></label><Button className="w-full" disabled={add.isPending}><Plus size={14}/>{add.isPending?'Saving…':'Add rule'}</Button></form>
        <QueryState query={q} noun="group filters">{q.data?.length?<div className="divide-y divide-border rounded-lg border border-border">{q.data.map(rule=><div key={rule.id} className="flex items-start gap-3 p-4"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${rule.isException?'bg-primary/10 text-primary':'bg-destructive/10 text-destructive'}`}><ListFilter size={15}/></div><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{rule.pattern}</div><div className="mt-1 text-xs text-muted-foreground">{rule.isException?'Exception':'Block rule'} · {rule.enabled?'Enabled':'Disabled'} · {niceDate(rule.createdAt)}</div></div><Button variant="danger" disabled={remove.isPending} onClick={()=>{if(window.confirm(`Delete rule “${rule.pattern}”?`))remove.mutate(rule.id)}}>Delete</Button></div>)}</div>:<Empty title="No filters configured" text="Add a literal phrase to create the first rule for this group."/>}</QueryState>
      </div>}
    </Panel>
  </>;
}

type EventRecord = {
  id: string; groupId: string; title: string; description: string; kind: 'event'|'contest';
  status: 'open'|'closed'; closesAt: string|null; winnerUserId: string|null; createdAt: string; participantCount: number; recurrenceRule?: 'none'|'daily'|'weekly'|'monthly'; drawSeed?: string|null; drawSeedCommitment?: string|null; participantHash?: string|null; drawAlgorithm?: string|null;
};
function EventsPage() {
  const client = useQueryClient();
  const groups = useListGroups({ query: { queryKey: getListGroupsQueryKey(), retry: false } });
  const events = useQuery({ queryKey: ['kaguya-events'], queryFn: () => customFetch<EventRecord[]>('/api/events'), retry: false });
  const [selectedEventId,setSelectedEventId] = useState('');
  const participants = useQuery({ queryKey: ['kaguya-event-participants',selectedEventId], queryFn: () => customFetch<Array<{userId:string;username:string|null;fullName:string;joinedAt:string}>>(`/api/events/${encodeURIComponent(selectedEventId)}/participants`), enabled:Boolean(selectedEventId), retry:false });
  const [groupId,setGroupId] = useState('');
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [kind,setKind] = useState<'event'|'contest'>('event');
  const [closesAt,setClosesAt] = useState('');
  const [recurrenceRule,setRecurrenceRule] = useState<'none'|'daily'|'weekly'|'monthly'>('none');
  const [notice,setNotice] = useState('');
  const create = useMutation({
    mutationFn: (body:Record<string,unknown>) => customFetch<EventRecord>('/api/events',{method:'POST',body:JSON.stringify(body)}),
    onSuccess:async()=>{setTitle('');setDescription('');setClosesAt('');setRecurrenceRule('none');setNotice('Event saved.');await client.invalidateQueries({queryKey:['kaguya-events']});},
    onError:()=>setNotice('Event was not saved. Check the group, title, close time and administrator access.'),
  });
  const close = useMutation({
    mutationFn:(input:{id:string;winnerUserId:string|null})=>customFetch<EventRecord>(`/api/events/${encodeURIComponent(input.id)}/close`,{method:'POST',body:JSON.stringify({winnerUserId:input.winnerUserId})}),
    onSuccess:async()=>{setNotice('Event closed and result persisted.');await client.invalidateQueries({queryKey:['kaguya-events']});},
    onError:()=>setNotice('Event was not closed. It remains visible with its previous status.'),
  });
  const draw = useMutation({
    mutationFn:(id:string)=>customFetch<{winnerUserId:string; participantUserIds:string[]; seed:string; participantHash:string; algorithm:string}>(`/api/events/${encodeURIComponent(id)}/draw`,{method:'POST',body:JSON.stringify({})}),
    onSuccess:async(result)=>{setNotice(`Verifiable draw saved. Winner ${result.winnerUserId}; ${result.participantUserIds.length} participants. Seed and participant hash are stored for reproducibility.`);await client.invalidateQueries({queryKey:['kaguya-events']});},
    onError:()=>setNotice('The draw was not performed. The event and current result were left unchanged.'),
  });
  const setWinner = useMutation({
    mutationFn:(input:{id:string;winnerUserId:string})=>customFetch<EventRecord>(`/api/events/${encodeURIComponent(input.id)}/winner`,{method:'PATCH',body:JSON.stringify({winnerUserId:input.winnerUserId})}),
    onSuccess:async()=>{setNotice('Contest winner recorded.');await client.invalidateQueries({queryKey:['kaguya-events']});},
    onError:()=>setNotice('Winner was not recorded. The ID must belong to a registered participant.'),
  });
  const submit=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!groupId||!title.trim()){setNotice('Choose a group and enter a title.');return;}
    let closeValue:string|null=null;
    if(closesAt){const parsed=new Date(closesAt);if(!Number.isFinite(parsed.getTime())||parsed.getTime()<=Date.now()){setNotice('The close time must be in the future.');return;}closeValue=parsed.toISOString();}
    create.mutate({groupId,title:title.trim(),description:description.trim(),kind,closesAt:closeValue,recurrenceRule});
  };
  const closeEvent=(event:EventRecord)=>{
    if(!window.confirm(`Close “${event.title}”? This prevents new participants.`))return;
    let winnerUserId:string|null=null;
    if(event.kind==='contest'){
      const input=window.prompt('Optional: Telegram numeric ID of the winner. Leave empty to close without recording a winner.');
      if(input===null)return;
      winnerUserId=input.trim()||null;
    }
    close.mutate({id:event.id,winnerUserId});
  };
  return <><PageTitle eyebrow="Community activities" title="Events & contests" description="Create persistent group events, accept participant registrations through Telegram commands, and close contests with a verifiable winner ID." />
    {notice&&<div role="status" className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.72fr_1.28fr]">
      <Panel><PanelHeading title="Create an event" hint="The group must already have been detected by Kaguya."/><form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Telegram group"><select className={inputClass} required value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Select a group</option>{(groups.data??[]).map(group=><option key={group.chatId} value={group.chatId}>{group.title}</option>)}</select></Field>
        <Field label="Title"><input className={inputClass} required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Community game night"/></Field>
        <Field label="Type"><select className={inputClass} value={kind} onChange={e=>setKind(e.target.value as 'event'|'contest')}><option value="event">Event</option><option value="contest">Contest</option></select></Field>
        <Field label="Description"><textarea className={areaClass} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Explain the activity and participation rules."/></Field>
        <Field label="Registration closes (optional)"><input className={inputClass} type="datetime-local" value={closesAt} onChange={e=>setClosesAt(e.target.value)} min={new Date().toISOString().slice(0,16)}/></Field>
        <Field label="Recurrence"><select className={inputClass} value={recurrenceRule} onChange={e=>setRecurrenceRule(e.target.value as 'none'|'daily'|'weekly'|'monthly')}><option value="none">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
        {recurrenceRule!=='none'&&<p className="text-xs leading-5 text-muted-foreground">A recurrence requires a closing date. The next instance will be created after the current instance closes; participants are not copied.</p>}
        <Button className="w-full" disabled={create.isPending||groups.isLoading}><Plus size={14}/>{create.isPending?'Saving…':'Create event'}</Button>
      </form></Panel>
      <Panel><PanelHeading title="Events register" hint="Latest 100 events" right={<Button variant="quiet" onClick={()=>events.refetch()}><RefreshCw size={14}/>Refresh</Button>}/>
        <QueryState query={events} noun="events">{events.data?.length?<div className="divide-y divide-border">{events.data.map(event=><div key={event.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">{event.kind==='contest'?<Trophy size={17}/>:<CalendarDays size={17}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{event.title}</span><Pill tone={event.status==='open'?'green':'neutral'}>{pretty(event.status)}</Pill><Pill>{pretty(event.kind)}</Pill></div><p className="mt-1 text-xs text-muted-foreground">Group {event.groupId} · Created {niceDate(event.createdAt)}</p><p className="mt-2 text-sm leading-6">{event.description||'No additional description.'}</p><p className="mt-2 text-xs text-muted-foreground">ID {event.id.slice(0,8)} · {event.participantCount} participants{event.closesAt?` · Closes ${niceDate(event.closesAt)}`:''}</p>{event.winnerUserId&&<p className="mt-1 text-xs font-semibold">Winner Telegram ID: {event.winnerUserId}{event.drawSeed&&event.participantHash?' · verifiable draw':''}</p>}{event.recurrenceRule&&event.recurrenceRule!=='none'&&<p className="mt-1 text-xs text-muted-foreground">Recurring: {pretty(event.recurrenceRule)}</p>}{event.kind==='contest'&&event.drawSeedCommitment&&<p className="mt-1 break-all text-xs text-muted-foreground">Seed commitment (record before entries close): {event.drawSeedCommitment}</p>}{event.drawSeed&&event.participantHash&&<details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-primary">View draw proof</summary><p className="mt-1 break-all">Algorithm: {event.drawAlgorithm}</p><p className="mt-1 break-all">Seed: {event.drawSeed}</p><p className="mt-1 break-all">Participant hash: {event.participantHash}</p><p className="mt-1 text-muted-foreground">Verify SHA-256(seed) against the commitment, SHA-256(sorted participant IDs) against the participant hash, then replay the rejection-sampling algorithm to confirm the winner.</p></details>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Telegram: <code>/eventos</code>, <code>/evento {event.id.slice(0,8)}</code>, <code>/participar {event.id.slice(0,8)}</code></span><button className="font-semibold text-primary underline" onClick={()=>setSelectedEventId(old=>old===event.id?'':event.id)}>{selectedEventId===event.id?'Hide participants':'View participants'}</button></div></div><div className="flex flex-col gap-2">{event.status==='open'&&<Button variant="quiet" disabled={close.isPending} onClick={()=>closeEvent(event)}><Check size={13}/>Close</Button>}{event.status==='closed'&&event.kind==='contest'&&!event.winnerUserId&&<><Button variant="primary" disabled={draw.isPending} onClick={()=>{if(window.confirm(`Run and permanently record a draw using the seed committed before registrations for “${event.title}”?`))draw.mutate(event.id)}}><Trophy size={13}/>{draw.isPending?'Drawing…':'Verifiable draw'}</Button><Button variant="quiet" disabled={setWinner.isPending} onClick={()=>{const id=window.prompt('Telegram numeric ID of a registered winner (manual result, not a random draw)');if(id===null||!id.trim())return;setWinner.mutate({id:event.id,winnerUserId:id.trim()});}}>Set manual winner</Button></>}</div></div>
        </div>)}</div>:<Empty title="No events yet" text="Create an event or contest above, then members can register using its short ID in Telegram."/>}</QueryState>
        {selectedEventId&&<div className="border-t border-border"><PanelHeading title="Participant register" hint="Telegram IDs are shown to help verify contest results." right={<Button variant="quiet" onClick={()=>participants.refetch()}><RefreshCw size={13}/>Refresh</Button>}/><QueryState query={participants} noun="participants">{participants.data?.length?<div className="divide-y divide-border">{participants.data.map(person=><div key={`${selectedEventId}:${person.userId}`} className="flex flex-wrap justify-between gap-2 px-5 py-3"><div><div className="text-sm font-semibold">{person.fullName}</div><div className="text-xs text-muted-foreground">{person.username?`@${person.username} · `:''}Telegram ID {person.userId}</div></div><div className="text-xs text-muted-foreground">{niceDate(person.joinedAt)}</div></div>)}</div>:<Empty title="No participants" text="Registrations made with /participar will appear here."/>}</QueryState></div>}
      </Panel>
    </div>
  </>;
}

function DataToolsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const exportBackup = useMutation({
    mutationFn: () => customFetch<any>('/api/backup/export'),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `kaguya-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setStatus('Backup downloaded. Store it encrypted and outside the public repository; it may contain memory and financial records.');
    },
    onError: () => setStatus('Backup export failed. No file was claimed as downloaded.'),
  });
  const validateBackup = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a JSON backup first.');
      const parsed = JSON.parse(await file.text());
      if (parsed?.kind !== 'kaguya-backup' || parsed?.schemaVersion !== 1 || !parsed?.tables || typeof parsed.tables !== 'object') throw new Error('Unsupported backup format.');
      const report = await customFetch<any>('/api/backup/restore', { method: 'POST', body: JSON.stringify({ ...parsed, dryRun: true, confirm: false }) });
      return { parsed, report };
    },
    onSuccess: ({ parsed, report }) => { setPayload(parsed); setPreview(report); setStatus('Validation passed. No database rows have changed. Review counts before confirming merge.'); },
    onError: (error:any) => { setPayload(null); setPreview(null); setStatus(error?.message || 'Backup validation failed. No database rows were changed.'); },
  });
  const restoreBackup = useMutation({
    mutationFn: () => customFetch<any>('/api/backup/restore', { method: 'POST', body: JSON.stringify({ ...payload, dryRun: false, confirm: true }) }),
    onSuccess: (report) => { setPreview(report); setStatus(`Merge completed. ${Object.values(report.imported ?? {}).reduce((sum:any, count:any)=>sum+Number(count),0)} new rows imported. Existing rows were not overwritten.`); setPayload(null); setFile(null); },
    onError: () => setStatus('Restore failed and the database transaction was rolled back. Existing data was not intentionally overwritten.'),
  });
  return <><PageTitle eyebrow="Data safety" title="Backups & data" description="Export an authorized logical backup and validate a merge-only restore before changing PostgreSQL."/>
    {status&&<div role="status" className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{status}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Panel><PanelHeading title="Create a backup" hint="Includes configuration, phrases, GIF references, sanctions, reminders, events, clients, payments and conversation memory."/><div className="space-y-4 p-5"><p className="text-sm leading-6 text-muted-foreground">This is a logical JSON backup. Telegram file IDs remain references to Telegram-owned media; the export does not download the media itself. Polling offsets and temporary anti-flood counters are excluded intentionally.</p><Button disabled={exportBackup.isPending} onClick={()=>exportBackup.mutate()}><FileText size={14}/>{exportBackup.isPending?'Exporting…':'Download backup JSON'}</Button><p className="text-xs leading-5 text-muted-foreground">The file may contain private conversation memory, personal contact data and financial information. Encrypt it at rest and never commit it to Git.</p></div></Panel>
      <Panel><PanelHeading title="Restore a backup" hint="Two-step validation, then additive import only."/><div className="space-y-4 p-5"><Field label="Backup JSON"><input className={inputClass} type="file" accept=".json,application/json" onChange={event=>{setFile(event.target.files?.[0]??null);setPayload(null);setPreview(null);setStatus('');}}/></Field><Button variant="quiet" disabled={!file||validateBackup.isPending} onClick={()=>validateBackup.mutate()}><ShieldCheck size={14}/>{validateBackup.isPending?'Validating…':'Validate without changing data'}</Button>
        {preview&&<div className="rounded-lg border border-border bg-muted/30 p-3"><div className="text-xs font-semibold">Validation report</div><p className="mt-1 text-sm">{preview.totalRows??preview.rowCount??0} rows in the backup</p>{preview.tableCounts&&<div className="mt-2 max-h-44 space-y-1 overflow-auto">{Object.entries(preview.tableCounts).map(([name,count]:any)=><div key={name} className="flex justify-between gap-3 text-xs"><code>{name}</code><span>{count}</span></div>)}</div>}{preview.imported&&<p className="mt-2 text-xs text-primary">Import result saved.</p>}</div>}
        {payload&&<div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-4"><p className="text-xs leading-5">The restore adds rows that do not already exist. It does not update, replace or delete existing rows. Rows with missing foreign-key dependencies will abort the whole transaction.</p><Button variant="danger" disabled={restoreBackup.isPending} onClick={()=>{if(window.confirm('Import new records from this backup? Existing records will not be overwritten, but new imported rows may add private data.'))restoreBackup.mutate()}}><RotateCcw size={14}/>{restoreBackup.isPending?'Restoring…':'Confirm additive restore'}</Button></div>}
      </div></Panel>
    </div>
  </>;
}

function ActivityPage() {
  const q=useListActivity({limit:100},{query:{queryKey:getListActivityQueryKey({limit:100}),retry:false}});
  return <><PageTitle eyebrow="Accountability" title="Activity history" description="A readable audit trail of administrative and bot actions. Review what happened, when, and where."/>
    <Panel><PanelHeading title="Recent events" hint="Latest 100 entries returned by the service" right={<Button variant="quiet" onClick={()=>q.refetch()}><RefreshCw size={14}/>Refresh</Button>}/>
      <QueryState query={q} noun="activity history">{q.data?.length?<div className="divide-y divide-border">{q.data.map((item:any)=><ActivityRow key={item.id} item={item}/>)}</div>:<Empty title="No events to review" text="Once actions are performed, Kaguya's audit record will appear here."/>}</QueryState>
    </Panel>
  </>;
}
function AuthScreen({signup=false}:{signup?:boolean}) {
  return <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5 py-10"><div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-primary/10"/><div className="absolute -right-12 -top-8 h-56 w-56 rounded-full border border-primary/10"/><div className="absolute bottom-0 left-0 h-1/3 w-full bg-gradient-to-t from-secondary/40 to-transparent"/>
    <div className="relative w-full max-w-[440px]"><Link href="/" className="mb-9 inline-flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><AudioLines size={20}/></span><span className="serif text-3xl">Kaguya</span></Link>
      <Panel className="p-7 md:p-9"><div className="mb-6 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">Administrator access</div><h1 className="serif text-4xl">{signup?'Request an account':'Welcome back'}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{signup?'Kaguya administration is restricted to approved administrators. Account provisioning is managed by your service owner.':'Sign-in is handled by the administrator identity provider configured for this deployment.'}</p>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <div className="mt-6 flex justify-center"><SignIn routing="hash" /></div> : <div className="mt-7 rounded-lg border border-accent/25 bg-accent/5 p-4"><div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-accent"/><div><div className="text-xs font-semibold">Clerk configuration required</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Set VITE_CLERK_PUBLISHABLE_KEY at build time and CLERK_SECRET_KEY on the server. The API will continue rejecting unauthenticated requests until Clerk and the administrator allowlist are configured.</p></div></div></div>}
        <Link href="/" className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:brightness-95"><ArrowDownRight size={15}/> Return to overview</Link>
      </Panel><p className="mt-5 text-center text-[11px] text-muted-foreground">Private administrator surface · Never share access links</p>
    </div></div>;
}
function NotFound() { return <div className="py-24 text-center"><div className="serif text-6xl">404</div><h1 className="mt-3 text-lg font-semibold">This page is outside the map.</h1><Link href="/" className="mt-5 inline-flex text-sm font-semibold text-primary underline">Back to overview</Link></div>; }

function ProtectedRoutes() {
  const [location] = useLocation();
  if(location.startsWith('/sign-in')) return <AuthScreen/>;
  if(location.startsWith('/sign-up')) return <AuthScreen signup/>;
  let content:ReactNode;
  switch(location){
    case '/': content=<Overview/>;break;
    case '/groups':content=<Groups/>;break;
    case '/moderation':content=<Moderation/>;break;
    case '/messages':content=<Messages/>;break;
    case '/phrases':content=<Phrases/>;break;
    case '/gifs':content=<Gifs/>;break;
    case '/reminders':content=<Reminders/>;break;
    case '/events':content=<EventsPage/>;break;
    case '/clients':content=<ClientsPage/>;break;
    case '/data':content=<DataToolsPage/>;break;
    case '/filters':content=<FiltersPage/>;break;
    case '/settings':content=<Settings/>;break;
    case '/activity':content=<ActivityPage/>;break;
    default:content=<NotFound/>;
  }
  return <PageShell>{content}</PageShell>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Switch><Route path="/:rest*" component={ProtectedRoutes}/><Route component={NotFound}/></Switch></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
