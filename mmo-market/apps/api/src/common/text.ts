import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

/** Bỏ dấu tiếng Việt. */
export function unaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function toSearchText(...parts: (string | null | undefined)[]): string {
  return unaccent(parts.filter(Boolean).join(' ').toLowerCase()).replace(/\s+/g, ' ').trim();
}

export function slugify(s: string, max = 80): string {
  const slug = unaccent(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'item';
}

/** Che nội dung hàng số khi hiển thị cho seller: chỉ lộ vài ký tự đầu. */
export function maskSecret(line: string): string {
  const s = line.trim();
  if (s.length <= 4) return '•'.repeat(s.length);
  return s.slice(0, 3) + '•'.repeat(Math.min(12, s.length - 3));
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });

/** Markdown -> HTML an toàn (tắt HTML thô, allowlist thẻ, link luôn nofollow/noopener). */
export function renderMarkdown(src: string): string {
  const raw = md.render(src ?? '');
  return sanitizeHtml(raw, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ul', 'ol', 'li', 'blockquote',
      'code', 'pre', 'h3', 'h4', 'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h3',
      h2: 'h3',
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow ugc noopener noreferrer', target: '_blank' }),
    },
  });
}

/** Phát hiện dấu hiệu rủ giao dịch ngoài sàn trong tin nhắn/bình luận. */
const OFF_PLATFORM_PATTERNS: RegExp[] = [
  /(?:\+?84|0)(?:[\s.-]?\d){9}\b/,
  /\bzalo\b/,
  /\btele(?:gram)?\b|t\.me\//,
  /facebook\.com|fb\.com|m\.me\//,
  /\b(?:ck|chuyen khoan)\s*(?:rieng|truc tiep|ngoai)/,
  /\bstk\b|\bso tai khoan\b/,
  /giao dich ngoai|ngoai san/,
];

export function detectOffPlatform(text: string): boolean {
  const t = unaccent(text.toLowerCase());
  return OFF_PLATFORM_PATTERNS.some((re) => re.test(t));
}
