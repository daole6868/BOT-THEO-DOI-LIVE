import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  /** Gửi email bất đồng bộ; lỗi gửi thư không làm hỏng nghiệp vụ chính. */
  send(to: string, subject: string, lines: string[], action?: { label: string; url: string }) {
    const body = lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join('');
    const button = action
      ? `<p style="margin:20px 0"><a href="${escape(action.url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${escape(action.label)}</a></p><p style="color:#64748b;font-size:12px">Nếu nút không hoạt động, mở liên kết: ${escape(action.url)}</p>`
      : '';
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h2 style="color:#4f46e5;margin-top:0">${escape(env.APP_NAME)}</h2>${body}${button}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#64748b;font-size:12px">Nhân viên ${escape(env.APP_NAME)} không bao giờ hỏi mật khẩu, mã 2FA hay yêu cầu chuyển khoản riêng.</p></div>`;
    const text = [...lines, action ? `${action.label}: ${action.url}` : ''].join('\n\n');
    if (env.APP_ENV === 'local' && action) this.logger.log(`[DEV] ${subject} -> ${to}: ${action.url}`);
    this.transporter
      .sendMail({ from: env.MAIL_FROM, to, subject: `[${env.APP_NAME}] ${subject}`, html, text })
      .catch((e) => this.logger.warn(`Không gửi được email tới ${to}: ${e.message}`));
  }
}
