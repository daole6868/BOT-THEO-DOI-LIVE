'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader, Select, StatusBadge, TD, TH, Table, cn, timeAgo } from '@mmo/ui';
import { Lock, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ROLE_LABEL, useStaff } from '@/lib/hooks';
import { USER_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

export default function StaffPage() {
  const { data: me } = useStaff();
  const { run, busy } = useRun();
  const { data, refetch } = useQuery({ queryKey: ['adm-staff'], queryFn: () => api<any>('/admin/staff') });
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ email: '', username: '', displayName: '', roleId: '', password: '' });
  const [role, setRole] = useState<any>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  if (!data) return null;
  const isSuper = me?.user?.role?.permissions.includes('*');

  const changeRole = (id: string, roleId: string) =>
    run(id, () => api(`/admin/staff/${id}`, { method: 'PATCH', body: { roleId: roleId || null } }), roleId ? 'Đã đổi vai trò' : 'Đã thu hồi quyền nhân sự').then((ok): unknown => ok && refetch());
  const saveRole = async () => {
    const ok = role.id
      ? await run('role', () => api(`/admin/staff/roles/${role.id}`, { method: 'PATCH', body: { permissions: perms, description: role.description ?? undefined } }), 'Đã cập nhật quyền')
      : await run('role', () => api('/admin/staff/roles', { body: { name: newRole.name, description: newRole.description || undefined, permissions: perms } }), 'Đã tạo vai trò');
    if (ok) {
      setRole(null);
      refetch();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Nhân sự & phân quyền" subtitle="Mỗi nhân sự bắt buộc 2FA. Phân quyền theo vai trò, mọi thay đổi đều được ghi nhật ký." actions={<Button onClick={() => { setForm({ email: '', username: '', displayName: '', roleId: data.roles[0]?.id ?? '', password: '' }); setCreate(true); }}><Plus className="h-4 w-4" /> Thêm nhân sự</Button>} />
      <Card>
        <Table>
          <thead><tr><TH>Nhân sự</TH><TH>Email</TH><TH>Vai trò</TH><TH>2FA</TH><TH>Trạng thái</TH><TH>Đăng nhập gần nhất</TH></tr></thead>
          <tbody>
            {data.staff.map((s: any) => {
              const self = s.id === me?.user?.id;
              const locked = s.role?.name === 'SUPER_ADMIN' && !isSuper;
              return (
                <tr key={s.id}>
                  <TD><div className="flex items-center gap-2.5"><Avatar name={s.displayName} size={32} /><div><p className="font-medium">{s.displayName} {self && <Badge tone="primary">Bạn</Badge>}</p><p className="text-xs text-muted">@{s.username}</p></div></div></TD>
                  <TD className="text-fg2">{s.email}</TD>
                  <TD>
                    {self || locked ? (
                      <Badge>{ROLE_LABEL[s.role?.name] ?? s.role?.name}</Badge>
                    ) : (
                      <Select value={s.role?.id ?? ''} disabled={busy === s.id} onChange={(e) => (e.target.value || confirm(`Thu hồi toàn bộ quyền nhân sự của ${s.displayName}?`)) && changeRole(s.id, e.target.value)} className="h-9 w-44">
                        {data.roles.filter((r: any) => isSuper || !r.permissions.includes('*')).map((r: any) => <option key={r.id} value={r.id}>{ROLE_LABEL[r.name] ?? r.name}</option>)}
                        <option value="">— Thu hồi quyền —</option>
                      </Select>
                    )}
                  </TD>
                  <TD>{s.mfaEnabled ? <ShieldCheck className="h-4 w-4 text-success" aria-label="Đã bật" /> : <span className="inline-flex items-center gap-1 text-xs text-warning"><ShieldOff className="h-4 w-4" /> Bật khi đăng nhập</span>}</TD>
                  <TD><StatusBadge map={USER_STATUS} value={s.status} /></TD>
                  <TD className="text-xs text-muted">{s.lastLoginAt ? <>{timeAgo(s.lastLoginAt)}<br />{s.lastLoginIp}</> : 'Chưa đăng nhập'}</TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Vai trò" subtitle="Bấm để xem / sửa quyền" action={<Button size="sm" variant="outline" onClick={() => { setRole({}); setPerms(['dashboard.view']); setNewRole({ name: '', description: '' }); }}><Plus className="h-4 w-4" /> Vai trò mới</Button>} />
        <CardBody className="grid gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-3">
          {data.roles.map((r: any) => {
            const all = r.permissions.includes('*');
            return (
              <button key={r.id} type="button" onClick={() => { setRole(r); setPerms(r.permissions); }} className="rounded-xl border border-border p-3 text-left hover:border-primary/50">
                <p className="flex items-center gap-2 font-semibold">{ROLE_LABEL[r.name] ?? r.name} {r.isSystem && <Badge>Hệ thống</Badge>} {all && <Lock className="h-3.5 w-3.5 text-muted" />}</p>
                <p className="text-xs text-muted">{r.description}</p>
                <p className="mt-2 text-xs"><b>{r._count.users}</b> người · {all ? 'Toàn quyền' : `${r.permissions.length} quyền`}</p>
              </button>
            );
          })}
        </CardBody>
      </Card>

      <Modal open={create} onClose={() => setCreate(false)} title="Thêm nhân sự" footer={<><Button variant="ghost" onClick={() => setCreate(false)}>Huỷ</Button><Button loading={busy === 'create'} disabled={!form.email || form.username.length < 3 || form.displayName.length < 2 || form.password.length < 10 || !form.roleId} onClick={() => run('create', () => api('/admin/staff', { body: form }), 'Đã tạo tài khoản – nhân sự sẽ phải bật 2FA ở lần đăng nhập đầu').then((ok): unknown => ok && (setCreate(false), refetch()))}>Tạo tài khoản</Button></>}>
        <div className="space-y-3">
          <Field label="Email công việc">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên đăng nhập">{(id) => <Input id={id} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })} />}</Field>
            <Field label="Tên hiển thị">{(id) => <Input id={id} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
          </div>
          <Field label="Vai trò">{(id) => <Select id={id} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>{data.roles.filter((r: any) => isSuper || !r.permissions.includes('*')).map((r: any) => <option key={r.id} value={r.id}>{ROLE_LABEL[r.name] ?? r.name}</option>)}</Select>}</Field>
          <Field label="Mật khẩu tạm" hint="Tối thiểu 10 ký tự, không chứa email/username. Gửi cho nhân sự qua kênh an toàn.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}</Field>
        </div>
      </Modal>

      <Modal open={!!role} onClose={() => setRole(null)} title={role?.id ? `Quyền của vai trò ${ROLE_LABEL[role.name] ?? role.name}` : 'Tạo vai trò mới'} size="lg" footer={!role?.permissions?.includes('*') && <><Button variant="ghost" onClick={() => setRole(null)}>Huỷ</Button><Button loading={busy === 'role'} disabled={!role?.id && !/^[A-Z_]{3,30}$/.test(newRole.name)} onClick={saveRole}>Lưu</Button></>}>
        {role && (
          <div className="space-y-3">
            {!role.id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mã vai trò" hint="CHỮ_HOA, vd: CSKH_CA_DEM">{(id) => <Input id={id} value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toUpperCase().replace(/[^A-Z_]/g, '') })} />}</Field>
                <Field label="Mô tả">{(id) => <Input id={id} value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} />}</Field>
              </div>
            )}
            {role.permissions?.includes('*') ? (
              <p className="rounded-lg bg-subtle p-3 text-sm">Super Admin có toàn quyền và không thể chỉnh sửa.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {data.permissions.map((p: any) => (
                  <label key={p.key} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm', perms.includes(p.key) ? 'border-primary bg-primary-soft' : 'border-border')}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={perms.includes(p.key)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.key] : perms.filter((x) => x !== p.key))} />
                    <span><span className="block">{p.label}</span><code className="text-[10px] text-muted">{p.key}</code></span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
