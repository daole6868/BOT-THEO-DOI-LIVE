import Link from 'next/link';

export function Logo({ href = '/', suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold text-fg shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
      <span className="text-[17px] tracking-tight">
        MMO<span className="text-primary">Market</span>
        {suffix && <span className="ml-1.5 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary align-middle">{suffix}</span>}
      </span>
    </Link>
  );
}
