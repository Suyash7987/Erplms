import LocaleSwitcher from '@/components/i18n/LocaleSwitcher';

/** Narrow, centered card used by the sign-in and onboarding screens. */
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      <section className="card flex flex-col gap-5" aria-labelledby="auth-card-title">
        <header className="flex flex-col gap-1">
          <h1 id="auth-card-title" className="text-xl font-semibold text-slate-900">
            {title}
          </h1>
          {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
        </header>
        {children}
      </section>
      {footer}
      <div className="mt-auto flex justify-center">
        <LocaleSwitcher />
      </div>
    </main>
  );
}
