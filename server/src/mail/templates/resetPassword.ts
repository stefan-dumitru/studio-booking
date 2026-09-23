import type { MailMessage } from '../mailer.js';

export function resetPasswordTemplate(
  to: string,
  link: string,
  ttlHours: number,
): MailMessage {
  return {
    to,
    subject: 'Reset your Studio Booking password',
    text:
      `We received a request to reset your Studio Booking password.\n\n` +
      `Click the link below to choose a new one:\n${link}\n\n` +
      `This link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}. If you didn't ` +
      `request this, you can ignore this email -- your password won't change.`,
    html:
      `<p>We received a request to reset your Studio Booking password.</p>` +
      `<p><a href="${link}">Click here to choose a new password</a>.</p>` +
      `<p>This link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}. If you didn't ` +
      `request this, you can ignore this email -- your password won't change.</p>`,
  };
}
