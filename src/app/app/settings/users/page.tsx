import Link from "next/link";
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

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("settings");
  const users = await db.user.findMany({ where: { orgId: ctx.orgId }, include: { branch: true }, orderBy: { name: "asc" } });
  const active = users.filter((u) => u.active).length;
  const iAmOwner = ctx.user.role === "OWNER";
  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle={`${active} of ${ctx.org.plan?.maxUsers || "unlimited"} active users`}
        back={{ href: "/app/settings", label: "Settings" }}
      />
      <div className="mb-6 space-y-4">
        {sp.error && <Alert tone="red">{sp.error}</Alert>}
        {sp.done && <Alert tone="green">{sp.done}</Alert>}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Your team" subtitle="Open a person to change their name, email, role, branch, password or access" />
          <Table>
            <thead><tr><th>User</th><th>Role</th><th>Branch</th><th>Last sign-in</th><th /><th /></tr></thead>
            <tbody>
              {users.map((u) => {
                // Administrators can edit everyone except owners; owners can edit anyone.
                const editable = iAmOwner || u.role !== "OWNER";
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td className="font-semibold">
                      {u.name}
                      {u.id === ctx.user.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
                      <span className="block text-xs font-normal text-slate-400">{u.email}</span>
                    </td>
                    <td><Badge tone={u.role === "OWNER" ? "brand" : "slate"}>{ROLE_LABELS[u.role]}</Badge></td>
                    <td className="text-sm">{u.branch?.name ?? "All"}</td>
                    <td className="text-xs text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                    <td className="text-right">
                      {editable ? (
                        <Link href={`/app/settings/users/${u.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                          Edit →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300">Owner</span>
                      )}
                    </td>
                    <td className="text-right">
                      {u.id !== ctx.user.id && editable && (
                        <form action={toggleUser.bind(null, u.id)}>
                          <SubmitButton variant="ghost" className="px-2 py-1 text-xs">{u.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="border-t border-slate-100 p-5 text-xs text-slate-500">
            The practice must always keep one active owner. To hand the practice over, promote the new owner first, then
            change the previous owner&apos;s role.
          </p>
        </Card>
        <Card>
          <CardHeader title="Add a team member" />
          <form action={addUser} className="space-y-3 p-5">
            <Field label="Full name"><Input name="name" required /></Field>
            <Field label="Email (login)"><Input name="email" type="email" required /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Role"><Select name="role" defaultValue="RECEPTION" options={ROLES.filter((r) => r !== "OWNER" || iAmOwner).map((r) => ({ value: r, label: `${ROLE_LABELS[r]} · ${ROLE_HELP[r]}` }))} /></Field>
            <Field label="Home branch" hint="Front desk and optometrists only see their home branch"><Select name="branchId" placeholder="All branches" options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
            <Field label="Temporary password"><Input name="password" type="text" minLength={8} required /></Field>
            <SubmitButton className="w-full">Add user</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
