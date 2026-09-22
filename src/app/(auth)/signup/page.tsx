import { SignupForm } from "../forms";

export const metadata = { title: "Start your free trial" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Create your practice</h1>
      <p className="mb-8 mt-2 text-slate-500">Start your 14-day free trial. You can add branches and staff later.</p>
      <SignupForm plan={sp.plan} />
    </>
  );
}
