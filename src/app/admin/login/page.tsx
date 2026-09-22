import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in — Harbourside Marine Services' };

export default async function LoginPage(props: PageProps<'/admin/login'>) {
  const { next } = await props.searchParams;
  // Sanitised again in adminLogin; a hidden field is trivially editable.
  const target = typeof next === 'string' && next.startsWith('/admin') ? next : '/admin';

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-16">
      <h1 className="font-condensed text-2xl font-semibold tracking-tight">Harbourside Marine Services</h1>
      <p className="mt-2 mb-8 muted">The job book.</p>
      <LoginForm next={target} />
    </main>
  );
}
