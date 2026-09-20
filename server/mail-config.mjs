// Separate from Supabase sign-in emails. No provider call is made unless enabled.
export function mailConfigured(){return process.env.MAIL_ENABLED==='true'&&!!process.env.RESEND_API_KEY&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.MAIL_FROM||'')&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.MAIL_REPLY_TO||'');}
