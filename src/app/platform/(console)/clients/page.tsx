import Link from "next/link";
import { requirePlatformOwner } from "@/lib/auth";
import { platformSnapshot } from "@/lib/platform";
import { Badge, Card, CardHeader, Table } from "@/components/ui";
import { cn, fmtDate, money } from "@/lib/utils";

export const metadata = { title: "Clients" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "paying", label: "Paying" },
  { key: "trial", label: "On trial" },
  { key: "lapsed", label: "Lapsed / expired" },
  { key: "suspended", label: "Suspended" },
] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requirePlatformOwner();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.filter) ? sp.filter! : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const { clients, stats } = await platformSnapshot();

  const counts = {
    all: clients.length,
    paying: clients.filter((c) => c.health.state === "ACTIVE" || c.health.state === "EXPIRING").length,
    trial: clients.filter((c) => c.health.state === "TRIAL").length,
    lapsed: clients.filter((c) => c.health.state === "LAPSED").length,
    suspended: clients.filter((c) => c.health.state === "SUSPENDED").length,
  };

  const rows = clients
    .filter((c) => {
      if (filter === "paying") return c.health.state === "ACTIVE" || c.health.state === "EXPIRING";
      if (filter === "trial") return c.health.state === "TRIAL";
      if (filter === "lapsed") return c.health.state === "LAPSED";
      if (filter === "suspended") return c.health.state === "SUSPENDED";
      return true;
    })
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || c.slug.includes(q));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every practice using OptiVault, with the plan they are on and where their subscription stands.
            Combined {money(stats.mrr)} per month.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search by practice, email or slug…" className="input w-72" />
          <button className="rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-800">Search</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/platform/clients?filter=${f.key}${q ? `&q=${encodeURIComponent(sp.q!)}` : ""}`}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
              filter === f.key ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title={`${rows.length} client${rows.length === 1 ? "" : "s"}`} subtitle="Click a practice to manage its plan, approve payment or extend access" />
        <Table>
          <thead>
            <tr>
              <th>Practice</th>
              <th>Plan</th>
              <th>Subscription</th>
              <th>Paid up to</th>
              <th className="num">Value</th>
              <th className="num">Branches</th>
              <th className="num">Users</th>
              <th className="num">Patients</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={c.health.state === "SUSPENDED" ? "opacity-60" : undefined}>
                <td>
                  <Link href={`/platform/clients/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  <span className="block text-xs font-normal text-slate-400">{c.email ?? c.slug}</span>
                </td>
                <td className="text-sm font-semibold">{c.plan?.name ?? "—"}</td>
                <td>
                  <Badge tone={c.health.tone}>{c.health.label}</Badge>
                  {c.health.needsAttention && <span className="ml-1 text-xs font-semibold text-amber-600">action</span>}
                </td>
                <td className="text-sm">{fmtDate(c.subscriptionStatus === "TRIALING" ? c.trialEndsAt : c.currentPeriodEnd)}</td>
                <td className="num text-sm">{c.mrr ? `${money(c.mrr)}/mo` : "—"}</td>
                <td className="num">{c._count.branches}</td>
                <td className="num">{c._count.users}</td>
                <td className="num">{c._count.patients.toLocaleString()}</td>
                <td className="text-xs text-slate-500">{fmtDate(c.createdAt)}</td>
                <td className="text-right">
                  <Link href={`/platform/clients/${c.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-slate-400">
                  No clients match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
