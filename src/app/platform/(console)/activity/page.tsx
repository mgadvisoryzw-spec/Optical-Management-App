import Link from "next/link";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORM_ACTIONS, VENDOR } from "@/lib/platform";
import { envIssues, isPostgres, isSqlite } from "@/lib/env";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtDateTime } from "@/lib/utils";
import { changeOwnerPassword } from "../actions";

export const metadata = { title: "Activity log" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const owner = await requirePlatformOwner();
  const sp = await searchParams;
  // The SQLite case gets its own banner below, so keep it out of the generic list.
  const issues = envIssues().filter((i) => !i.title.includes("SQLite"));
  const [audits, platformUsers] = await Promise.all([
    db.platformAudit.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    db.user.findMany({ where: { isSuperAdmin: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Activity log" subtitle={`Everything ${VENDOR.name} has done from this console`} />

      {sp.done && <div className="mb-6"><Alert tone="green">{sp.done}</Alert></div>}
      {sp.error && <div className="mb-6"><Alert tone="red">{sp.error}</Alert></div>}

      <Card className="mb-6">
        <CardHeader
          title="Deployment health"
          subtitle="Whether this installation is shared across computers, or isolated to this one"
        />
        <div className="space-y-3 p-5">
          {isPostgres ? (
            <Alert tone="green">
              <b>Shared database.</b> Every computer that reaches this server sees the same accounts and data, so a
              password created on one machine works on all of them.
            </Alert>
          ) : isSqlite ? (
            <Alert tone="amber">
              <b>Local SQLite file — this computer only.</b> Accounts and data created here do not exist on any other
              machine. Point <code>DATABASE_URL</code> at your shared PostgreSQL database before rolling out to clients.
            </Alert>
          ) : null}
          {issues.map((i) => (
            <Alert key={i.title} tone={i.level === "error" ? "red" : "amber"}>
              <b>{i.title}.</b> {i.detail}
            </Alert>
          ))}
          {isPostgres && !issues.length && (
            <p className="text-xs text-slate-500">No configuration problems detected.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`${audits.length} most recent action${audits.length === 1 ? "" : "s"}`} />
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Client</th>
                <th>Detail</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.createdAt)}</td>
                  <td><Badge tone={a.action === "SUSPEND" ? "red" : a.action.includes("APPROVE") || a.action.includes("GRANT") ? "green" : "slate"}>{PLATFORM_ACTIONS[a.action as keyof typeof PLATFORM_ACTIONS] ?? a.action}</Badge></td>
                  <td className="text-sm">{a.orgId ? <Link href={`/platform/clients/${a.orgId}`} className="font-semibold text-brand-700 hover:underline">{a.orgName}</Link> : "—"}</td>
                  <td className="text-sm text-slate-600">{a.detail ?? "—"}</td>
                  <td className="text-xs text-slate-500">{a.actorName}</td>
                </tr>
              ))}
              {!audits.length && <tr><td colSpan={5} className="py-10 text-center text-slate-400">Nothing logged yet. Approvals, plan changes and suspensions all appear here.</td></tr>}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Platform owner accounts" subtitle="Accounts that can reach this console" />
            <Table>
              <tbody>
                {platformUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold">{u.name}<span className="block text-xs font-normal text-slate-400">{u.email}</span></td>
                    <td className="text-xs text-slate-500">{u.platformTitle ?? "Platform owner"}<span className="block">last in {fmtDateTime(u.lastLoginAt)}</span></td>
                    <td>{u.id === owner.id && <Badge tone="brand">You</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-slate-100 p-5 text-xs text-slate-500">
              Additional owner accounts are created by setting <code>isSuperAdmin</code> on a user with no practice —
              see <code>prisma/seed.ts</code>.
            </p>
          </Card>

          <Card>
            <CardHeader title="Change your console password" />
            <form action={changeOwnerPassword} className="space-y-3 p-5">
              <Field label="New password" hint="At least 10 characters"><Input name="password" type="password" minLength={10} required autoComplete="new-password" /></Field>
              <SubmitButton variant="secondary" className="w-full">Update password</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
