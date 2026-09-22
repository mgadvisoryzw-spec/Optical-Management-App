import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/utils";
import { addUser, toggleUser } from "../actions";

export const metadata = { title: "Users & roles" };

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including billing",
  ADMIN: "Everything except billing",
  OPTOMETRIST: "Clinical records, prescriptions, orders",
  RECEPTION: "Patients, bookings, orders, receipts, stock",
  ACCOUNTANT: "Sales, receipts, expenses, ledger, reports",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("settings");
  const users = await db.user.findMany({ where: { orgId: ctx.orgId }, include: { branch: true }, orderBy: { name: "asc" } });
  const active = users.filter((u) => u.active).length;
  return (
    <>
      <PageHeader title="Users & roles" subtitle={`${active} of ${ctx.org.plan?.maxUsers || "unlimited"} active users`} back={{ href: "/app/settings", label: "Settings" }} />
      {sp.error && <div className="mb-6"><Alert tone="red">{sp.error}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <thead><tr><th>User</th><th>Role</th><th>Branch</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="font-semibold">{u.name}<span className="block text-xs font-normal text-slate-400">{u.email}</span></td>
                  <td><Badge tone={u.role === "OWNER" ? "brand" : "slate"}>{ROLE_LABELS[u.role]}</Badge></td>
                  <td className="text-sm">{u.branch?.name ?? "All"}</td>
                  <td className="text-xs text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="text-right">
                    {u.id !== ctx.user.id && (
                      <form action={toggleUser.bind(null, u.id)}><SubmitButton variant="ghost" className="px-2 py-1 text-xs">{u.active ? "Deactivate" : "Reactivate"}</SubmitButton></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Add a team member" />
          <form action={addUser} className="space-y-3 p-5">
            <Field label="Full name"><Input name="name" required /></Field>
            <Field label="Email (login)"><Input name="email" type="email" required /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Role"><Select name="role" defaultValue="RECEPTION" options={ROLES.filter((r) => r !== "OWNER" || ctx.user.role === "OWNER").map((r) => ({ value: r, label: `${ROLE_LABELS[r]} · ${ROLE_HELP[r]}` }))} /></Field>
            <Field label="Home branch" hint="Front desk and optometrists only see their home branch"><Select name="branchId" placeholder="All branches" options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
            <Field label="Temporary password"><Input name="password" type="text" minLength={8} required /></Field>
            <SubmitButton className="w-full">Add user</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
