'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* chế độ riêng tư */
    }
  };
  return (
    <button type="button" onClick={toggle} className="rounded-lg p-2 text-fg2 hover:bg-subtle" aria-label={dark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'} title="Đổi giao diện sáng/tối">
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
