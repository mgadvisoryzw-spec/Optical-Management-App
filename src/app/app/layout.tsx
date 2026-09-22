import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LogOut, Search } from "lucide-react";
import { getContext, BRANCH_COOKIE } from "@/lib/auth";
import { PERMISSIONS, ROLE_LABELS, can } from "@/lib/constants";
import { Sidebar } from "./sidebar";
import { logoutAction } from "../(auth)/actions";
import { AutoSubmitSelect } from "@/components/client";

async function switchBranch(fd: FormData) {
  "use server";
  const jar = await cookies();
  jar.set(BRANCH_COOKIE, String(fd.get("branch") ?? "all"), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/app", "layout");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const allowed = Object.keys(PERMISSIONS).filter((p) => can(ctx.user.role, p as keyof typeof PERMISSIONS));
  const initials = ctx.user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <Sidebar allowed={allowed} orgName={ctx.org.name} />
      <div className="lg:pl-64">
        {ctx.subscription.reason && (
          <div className={`no-print px-6 py-2 text-center text-xs font-semibold ${ctx.subscription.ok ? "bg-brand-50 text-brand-900" : "bg-rose-600 text-white"}`}>
            {ctx.subscription.reason}{" "}
            {can(ctx.user.role, "billing") && (
              <Link href="/app/billing" className="underline">
                {ctx.subscription.ok ? "Choose a plan" : "Renew now"}
              </Link>
            )}
          </div>
        )}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200/70 bg-white/85 px-6 pl-16 backdrop-blur lg:pl-6">
          <form action="/app/patients" className="relative hidden max-w-md flex-1 md:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" placeholder="Search patients by name, phone, patient no. or medical aid no.…" className="input pl-9" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {ctx.canSwitchBranch ? (
              <form action={switchBranch}>
                <AutoSubmitSelect
                  name="branch"
                  defaultValue={ctx.branchId ?? "all"}
                  className="w-48 py-1.5 font-semibold"
                  options={[{ value: "all", label: "All branches" }, ...ctx.branches.map((b) => ({ value: b.id, label: b.name }))]}
                />
              </form>
            ) : (
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{ctx.branches.find((b) => b.id === ctx.branchId)?.name}</span>
            )}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-bold text-white">{initials}</div>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-semibold text-slate-900">{ctx.user.name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[ctx.user.role]}</p>
              </div>
              <form action={logoutAction}>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sign out">
                  <LogOut size={17} />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
