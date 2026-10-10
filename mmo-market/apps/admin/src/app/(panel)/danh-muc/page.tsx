'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Switch, TD, TH, Table, Textarea, cn, num, pct } from '@mmo/ui';
import { ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

type Node = { id: string; parentId: string | null; slug: string; name: string; icon: string | null; description: string | null; feeBps: number; defaultDelivery: 'AUTO' | 'MANUAL'; sortOrder: number; isActive: boolean; productCount: number; children: Node[] };
type Attr = { id: string; categoryId: string; key: string; label: string; type: string; options: { value: string; label: string }[] | null; unit: string | null; isRequired: boolean; isFilterable: boolean; sortOrder: number };

const TYPES: Record<string, string> = { SELECT: 'Chọn 1', MULTISELECT: 'Chọn nhiều', NUMBER: 'Số', BOOLEAN: 'Có / không', TEXT: 'Văn bản' };
const emptyCat = { name: '', slug: '', icon: '', description: '', fee: '5', defaultDelivery: 'AUTO', sortOrder: '0', isActive: true };
const emptyAttr = { key: '', label: '', type: 'SELECT', options: '', unit: '', isRequired: false, isFilterable: true, sortOrder: '0' };

function flatten(nodes: Node[], depth = 0, out: { n: Node; depth: number }[] = []) {
  for (const n of [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)) {
    out.push({ n, depth });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

export default function CategoriesPage() {
  const { run, busy } = useRun();
  const { data, refetch } = useQuery({ queryKey: ['adm-categories'], queryFn: () => api<{ tree: Node[]; attributes: Attr[] }>('/admin/categories') });
  const [sel, setSel] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [catModal, setCatModal] = useState<null | { id?: string; parentId?: string | null }>(null);
  const [cat, setCat] = useState(emptyCat);
  const [attrModal, setAttrModal] = useState<null | { id?: string; categoryId: string }>(null);
  const [attr, setAttr] = useState(emptyAttr);

  const rows = useMemo(() => flatten(data?.tree ?? []), [data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.n.id, r.n])), [rows]);
  const selected = sel ? byId.get(sel) : null;
  const chain = useMemo(() => {
    const out: Node[] = [];
    let c = selected ?? null;
    while (c) {
      out.unshift(c);
      c = c.parentId ? byId.get(c.parentId) ?? null : null;
    }
    return out;
  }, [selected, byId]);
  const own = (data?.attributes ?? []).filter((a) => a.categoryId === sel).sort((a, b) => a.sortOrder - b.sortOrder);
  const inherited = (data?.attributes ?? []).filter((a) => chain.slice(0, -1).some((c) => c.id === a.categoryId));
  const hiddenBy = (n: Node) => {
    let p = n.parentId ? byId.get(n.parentId) : null;
    while (p) {
      if (collapsed.has(p.id)) return true;
      p = p.parentId ? byId.get(p.parentId) : null;
    }
    return false;
  };

  const openCat = (id?: string, parentId?: string | null) => {
    const n = id ? byId.get(id) : null;
    setCat(n ? { name: n.name, slug: n.slug, icon: n.icon ?? '', description: n.description ?? '', fee: String(n.feeBps / 100), defaultDelivery: n.defaultDelivery, sortOrder: String(n.sortOrder), isActive: n.isActive } : { ...emptyCat, defaultDelivery: parentId ? byId.get(parentId)?.defaultDelivery ?? 'AUTO' : 'AUTO', fee: parentId ? String((byId.get(parentId)?.feeBps ?? 500) / 100) : '5' });
    setCatModal({ id, parentId });
  };
  const saveCat = async () => {
    const body = { name: cat.name, slug: cat.slug || undefined, icon: cat.icon || null, description: cat.description || null, feeBps: Math.round(Number(cat.fee) * 100), defaultDelivery: cat.defaultDelivery, sortOrder: Number(cat.sortOrder) || 0, isActive: cat.isActive, ...(catModal?.id ? {} : { parentId: catModal?.parentId ?? null }) };
    const ok = await run('cat', () => (catModal?.id ? api(`/admin/categories/${catModal.id}`, { method: 'PATCH', body }) : api('/admin/categories', { body })), 'Đã lưu danh mục');
    if (ok) {
      setCatModal(null);
      refetch();
    }
  };
  const openAttr = (categoryId: string, a?: Attr) => {
    setAttr(a ? { key: a.key, label: a.label, type: a.type, options: (a.options ?? []).map((o) => `${o.value}|${o.label}`).join('\n'), unit: a.unit ?? '', isRequired: a.isRequired, isFilterable: a.isFilterable, sortOrder: String(a.sortOrder) } : emptyAttr);
    setAttrModal({ id: a?.id, categoryId });
  };
  const saveAttr = async () => {
    const options = ['SELECT', 'MULTISELECT'].includes(attr.type)
      ? attr.options.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [value, ...rest] = l.split('|');
          return { value: value.trim(), label: (rest.join('|') || value).trim() };
        })
      : undefined;
    const body: any = { label: attr.label, type: attr.type, options, unit: attr.unit || null, isRequired: attr.isRequired, isFilterable: attr.isFilterable, sortOrder: Number(attr.sortOrder) || 0 };
    const ok = await run('attr', () => (attrModal?.id ? api(`/admin/categories/attributes/${attrModal.id}`, { method: 'PATCH', body }) : api(`/admin/categories/${attrModal!.categoryId}/attributes`, { body: { ...body, key: attr.key } })), 'Đã lưu thuộc tính');
    if (ok) {
      setAttrModal(null);
      refetch();
    }
  };

  return (
    <div>
      <PageHeader title="Danh mục & thuộc tính" subtitle="Thuộc tính quyết định bộ lọc bên trái trang danh mục và form đăng sản phẩm. Danh mục con kế thừa thuộc tính của danh mục cha." actions={<Button onClick={() => openCat(undefined, null)}><FolderPlus className="h-4 w-4" /> Danh mục gốc</Button>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="h-fit">
          <ul className="py-2">
            {rows.filter((r) => !hiddenBy(r.n)).map(({ n, depth }) => (
              <li key={n.id}>
                <div className={cn('group flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-subtle', sel === n.id && 'bg-primary-soft')} style={{ paddingLeft: 12 + depth * 18 }}>
                  <button type="button" className={cn('rounded p-0.5 text-muted', !n.children.length && 'invisible')} aria-label="Mở rộng" onClick={() => setCollapsed((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; })}>
                    <ChevronRight className={cn('h-4 w-4 transition', !collapsed.has(n.id) && 'rotate-90')} />
                  </button>
                  <button type="button" onClick={() => setSel(n.id)} className={cn('flex-1 truncate text-left', !n.isActive && 'text-muted line-through')}>{n.name}</button>
                  <span className="text-[11px] text-muted tabular">{num(n.productCount)}</span>
                  <button type="button" className="rounded p-1 text-muted opacity-0 hover:bg-card hover:text-primary group-hover:opacity-100" title="Thêm danh mục con" aria-label={`Thêm danh mục con của ${n.name}`} onClick={() => openCat(undefined, n.id)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {!selected ? (
          <Card><EmptyState title="Chọn một danh mục" description="Bấm vào danh mục bên trái để sửa thông tin và thuộc tính lọc." /></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title={<span className="flex flex-wrap items-center gap-2">{chain.map((c, i) => <span key={c.id} className={cn(i < chain.length - 1 && 'text-muted')}>{c.name}{i < chain.length - 1 && ' /'}</span>)} {!selected.isActive && <Badge>Đang ẩn</Badge>}</span>}
                subtitle={`/${selected.slug} · ${num(selected.productCount)} sản phẩm`}
                action={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => openCat(selected.id)}><Pencil className="h-4 w-4" /> Sửa</Button>
                    <Button size="sm" variant="ghost" className="text-danger" disabled={selected.productCount > 0 || selected.children.length > 0} title={selected.productCount || selected.children.length ? 'Chỉ xoá được danh mục trống – hãy ẩn thay vì xoá' : undefined} onClick={() => confirm(`Xoá danh mục ${selected.name}?`) && run('del', () => api(`/admin/categories/${selected.id}`, { method: 'DELETE' }), 'Đã xoá').then((ok): unknown => ok && (setSel(null), refetch()))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                }
              />
              <CardBody className="grid gap-3 pt-0 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Phí sàn</p><p className="font-semibold">{pct(selected.feeBps / 100)}</p></div>
                <div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Giao hàng mặc định</p><p className="font-semibold">{selected.defaultDelivery === 'AUTO' ? 'Tự động' : 'Thủ công'}</p></div>
                <div className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">Thứ tự</p><p className="font-semibold">{selected.sortOrder}</p></div>
                {selected.description && <p className="text-fg2 sm:col-span-3">{selected.description}</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Thuộc tính & bộ lọc" subtitle={inherited.length ? `Kế thừa từ cha: ${inherited.map((a) => a.label).join(', ')}` : 'Không kế thừa thuộc tính nào'} action={<Button size="sm" variant="outline" onClick={() => openAttr(selected.id)}><Plus className="h-4 w-4" /> Thuộc tính</Button>} />
              {!own.length ? (
                <EmptyState title="Chưa có thuộc tính riêng" description="Thêm thuộc tính như Quốc gia, Thời hạn, Loại tài khoản để người mua lọc nhanh." />
              ) : (
                <Table>
                  <thead><tr><TH>Tên</TH><TH>Khoá URL</TH><TH>Kiểu</TH><TH>Giá trị</TH><TH>Lọc</TH><TH>Bắt buộc</TH><TH /></tr></thead>
                  <tbody>
                    {own.map((a) => (
                      <tr key={a.id}>
                        <TD className="font-medium">{a.label}{a.unit && <span className="text-muted"> ({a.unit})</span>}</TD>
                        <TD><code className="text-xs">a.{a.key}</code></TD>
                        <TD>{TYPES[a.type]}</TD>
                        <TD className="max-w-[260px] text-xs text-fg2">{a.options?.map((o) => o.label).join(', ') ?? '—'}</TD>
                        <TD>{a.isFilterable ? <Badge tone="success">Có</Badge> : <Badge>Không</Badge>}</TD>
                        <TD>{a.isRequired ? 'Có' : '—'}</TD>
                        <TD align="right">
                          <div className="flex justify-end gap-1">
                            <button type="button" className="rounded p-1.5 text-muted hover:bg-subtle hover:text-primary" aria-label={`Sửa ${a.label}`} onClick={() => openAttr(a.categoryId, a)}><Pencil className="h-4 w-4" /></button>
                            <button type="button" className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Xoá ${a.label}`} onClick={() => confirm(`Xoá thuộc tính ${a.label}? Dữ liệu cũ trên sản phẩm vẫn giữ nhưng không còn lọc được.`) && run(a.id, () => api(`/admin/categories/attributes/${a.id}`, { method: 'DELETE' }), 'Đã xoá').then((ok): unknown => ok && refetch())}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </div>

      <Modal open={!!catModal} onClose={() => setCatModal(null)} title={catModal?.id ? 'Sửa danh mục' : catModal?.parentId ? `Danh mục con của ${byId.get(catModal.parentId)?.name}` : 'Danh mục gốc mới'} footer={<><Button variant="ghost" onClick={() => setCatModal(null)}>Huỷ</Button><Button loading={busy === 'cat'} disabled={cat.name.trim().length < 2} onClick={saveCat}>Lưu</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên danh mục">{(id) => <Input id={id} value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />}</Field>
            <Field label="Đường dẫn (slug)" hint="Để trống để tự tạo">{(id) => <Input id={id} value={cat.slug} onChange={(e) => setCat({ ...cat, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />}</Field>
            <Field label="Phí sàn (%)">{(id) => <Input id={id} type="number" min={0} max={50} step={0.1} value={cat.fee} onChange={(e) => setCat({ ...cat, fee: e.target.value })} />}</Field>
            <Field label="Kiểu giao mặc định">{(id) => <Select id={id} value={cat.defaultDelivery} onChange={(e) => setCat({ ...cat, defaultDelivery: e.target.value })}><option value="AUTO">Tự động (kho mã hoá)</option><option value="MANUAL">Thủ công (dịch vụ)</option></Select>}</Field>
            <Field label="Biểu tượng (tên icon lucide)" hint="vd: mail, globe, key-round">{(id) => <Input id={id} value={cat.icon} onChange={(e) => setCat({ ...cat, icon: e.target.value })} />}</Field>
            <Field label="Thứ tự hiển thị">{(id) => <Input id={id} type="number" value={cat.sortOrder} onChange={(e) => setCat({ ...cat, sortOrder: e.target.value })} />}</Field>
          </div>
          <Field label="Mô tả ngắn">{(id) => <Textarea id={id} rows={2} value={cat.description} onChange={(e) => setCat({ ...cat, description: e.target.value })} maxLength={500} />}</Field>
          <Switch checked={cat.isActive} onChange={(v) => setCat({ ...cat, isActive: v })} label="Hiển thị trên sàn" />
        </div>
      </Modal>

      <Modal open={!!attrModal} onClose={() => setAttrModal(null)} title={attrModal?.id ? 'Sửa thuộc tính' : 'Thêm thuộc tính'} footer={<><Button variant="ghost" onClick={() => setAttrModal(null)}>Huỷ</Button><Button loading={busy === 'attr'} disabled={!attr.label || (!attrModal?.id && !/^[a-z][a-z0-9_]{0,39}$/.test(attr.key))} onClick={saveAttr}>Lưu</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên hiển thị">{(id) => <Input id={id} value={attr.label} onChange={(e) => setAttr({ ...attr, label: e.target.value })} placeholder="Quốc gia" />}</Field>
            <Field label="Khoá (dùng trên URL bộ lọc)" hint={attrModal?.id ? 'Không đổi được sau khi tạo' : 'chữ thường, số, gạch dưới'}>{(id) => <Input id={id} value={attr.key} disabled={!!attrModal?.id} onChange={(e) => setAttr({ ...attr, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="country" />}</Field>
            <Field label="Kiểu dữ liệu">{(id) => <Select id={id} value={attr.type} onChange={(e) => setAttr({ ...attr, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Đơn vị" hint="vd: tháng, GB (không bắt buộc)">{(id) => <Input id={id} value={attr.unit} onChange={(e) => setAttr({ ...attr, unit: e.target.value })} />}</Field>
          </div>
          {['SELECT', 'MULTISELECT'].includes(attr.type) && (
            <Field label="Các giá trị (mỗi dòng: giá_trị|Nhãn hiển thị)" hint="Giá trị chỉ gồm chữ, số, _ . + -">
              {(id) => <Textarea id={id} rows={5} className="font-mono text-xs" value={attr.options} onChange={(e) => setAttr({ ...attr, options: e.target.value })} placeholder={'vn|Việt Nam\nus|Hoa Kỳ'} />}
            </Field>
          )}
          <div className="flex flex-wrap gap-5">
            <Switch checked={attr.isFilterable} onChange={(v) => setAttr({ ...attr, isFilterable: v })} label="Dùng làm bộ lọc" />
            <Switch checked={attr.isRequired} onChange={(v) => setAttr({ ...attr, isRequired: v })} label="Bắt buộc khi đăng sản phẩm" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
