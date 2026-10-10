'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Field, Input, PageHeader, Textarea, useToast } from '@mmo/ui';
import { useEffect, useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, errMsg } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export default function ProfilePage() {
  const { data } = useMe();
  const u = data?.user;
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => {
    if (u) {
      setName(u.displayName);
      setBio(u.bio ?? '');
    }
  }, [u]);
  if (!u) return null;
  return (
    <div>
      <PageHeader title="Hồ sơ" subtitle={`@${u.username} · ${u.email}`} />
      <Card className="max-w-xl space-y-4 p-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatar[0]?.url ?? u.avatarUrl} name={u.displayName} size={64} />
          <ImageUpload purpose="avatar" value={avatar} onChange={setAvatar} label="Ảnh mới" />
        </div>
        <Field label="Tên hiển thị">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />}</Field>
        <Field label="Giới thiệu">{(id) => <Textarea id={id} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />}</Field>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('/users/me', { method: 'PATCH', body: { displayName: name, bio, ...(avatar[0] ? { avatarUploadId: avatar[0].id } : {}) } });
              toast.success('Đã lưu hồ sơ');
              setAvatar([]);
              qc.invalidateQueries({ queryKey: ['me'] });
            } catch (e) {
              toast.error('Không lưu được', errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Lưu thay đổi
        </Button>
      </Card>
    </div>
  );
}
