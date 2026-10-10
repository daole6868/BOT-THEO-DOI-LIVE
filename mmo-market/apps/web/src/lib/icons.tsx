import {
  BookOpen, Bot, Briefcase, Code, FileCode, Gamepad, Gamepad2, Gift, Globe, GraduationCap, HardDrive, KeyRound, Link2, Mail,
  Megaphone, Palette, PenLine, Puzzle, Server, ShieldCheck, Sparkles, Tag, UserRound, Users, Wrench, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'user-round': UserRound, mail: Mail, users: Users, sparkles: Sparkles, 'gamepad-2': Gamepad2, wrench: Wrench, bot: Bot, puzzle: Puzzle,
  'shield-check': ShieldCheck, 'key-round': KeyRound, gamepad: Gamepad, gift: Gift, server: Server, globe: Globe, 'hard-drive': HardDrive,
  link: Link2, briefcase: Briefcase, palette: Palette, 'pen-line': PenLine, megaphone: Megaphone, code: Code, 'graduation-cap': GraduationCap,
  'book-open': BookOpen, 'file-code': FileCode,
};

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && MAP[name]) || Tag;
  return <Icon className={className} aria-hidden />;
}
