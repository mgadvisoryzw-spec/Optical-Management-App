import { LoginForm } from "../forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; demo?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-8 mt-2 text-slate-500">Sign in to your practice.</p>
      {sp.demo && (
        <p className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          The demo account details are filled in below. Just press <b>Sign in</b>.
        </p>
      )}
      <LoginForm next={sp.next} demo={!!sp.demo} />
    </>
  );
}
