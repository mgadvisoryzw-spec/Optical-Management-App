import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { updateUser } from "../../actions";

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including plan & billing",
  ADMIN: "Everything except plan & billing",
  OPTOMETRIST: "Clinical records, prescriptions, orders",
  RECEPTION: "Patients, bookings, orders, receipts, stock",
  ACCOUNTANT: "Sales, receipts, expenses, ledger, reports",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const u = await db.user.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: u ? `Edit ${u.name}` : "Edit user" };
}

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission("settings");
  const user = await db.user.findFirst({ where: { id, orgId: ctx.orgId }, include: { branch: true } });
  if (!user) notFound();

  const isSelf = user.id === ctx.user.id;
  const iAmOwner = ctx.user.role === "OWNER";
  // An administrator may not edit an owner's account.
  const readOnly = user.role === "OWNER" && !iAmOwner;
  const ownerCount = await db.user.count({ where: { orgId: ctx.orgId, role: "OWNER", active: true } });
  const lastOwner = user.role === "OWNER" && user.active && ownerCount === 1;
  const roleOptions = ROLES.filter((r) => r !== "OWNER" || iAmOwner).map((r) => ({ value: r, label: `${ROLE_LABELS[r]} · ${ROLE_HELP[r]}` }));

  return (
    <>
      <PageHeader
        title={`Edit ${user.name}`}
        subtitle={
          <>
            {ROLE_LABELS[user.role] ?? user.role} · joined {fmtDate(user.createdAt)} · last sign-in {fmtDateTime(user.lastLoginAt)}
          </>
        }
        back={{ href: "/app/settings/users", label: "Users & roles" }}
        actions={
          <>
            <Badge tone={user.role === "OWNER" ? "brand" : "slate"}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
            <Badge tone={user.active ? "green" : "red"}>{user.active ? "Active" : "Deactivated"}</Badge>
          </>
        }
      />

      <div className="space-y-4">
        {sp.error && <Alert tone="red">{sp.error}</Alert>}
        {readOnly && <Alert tone="amber">Only an owner can change another owner&apos;s account. Ask the practice owner to make this change.</Alert>}
        {isSelf && <Alert tone="brand">This is your own account. You can change your details and password here, but not your role or active status.</Alert>}
        {lastOwner && !isSelf && <Alert tone="amber">This is the only active owner. Promote someone else to Owner before changing this role or deactivating the account.</Alert>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Account details" subtitle="The email address below is what this person signs in with" />
          <form action={updateUser.bind(null, user.id)} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name"><Input name="name" defaultValue={user.name} required disabled={readOnly} /></Field>
            <Field label="Email (login)"><Input name="email" type="email" defaultValue={user.email} required disabled={readOnly} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={user.phone ?? ""} disabled={readOnly} /></Field>
            <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}>
              <Select name="role" defaultValue={user.role} options={roleOptions} disabled={readOnly || isSelf} />
            </Field>
            <Field label="Home branch" hint="Front desk and optometrists only see their home branch. Leave blank for all branches.">
              <Select name="branchId" defaultValue={user.branchId ?? ""} placeholder="All branches" options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} disabled={readOnly} />
            </Field>
            <Field label="Status" hint={isSelf ? "You can't deactivate your own account" : "Deactivated users keep their records but cannot sign in"}>
              <label className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={user.active} className="accent-brand-600" disabled={readOnly || isSelf} />
                Allowed to sign in
              </label>
            </Field>
            <Field
              label="Set a new password"
              className="sm:col-span-2"
              hint="Leave blank to keep the current password. Minimum 8 characters."
            >
              <Input name="password" type="text" minLength={8} placeholder="••••••••" autoComplete="new-password" disabled={readOnly} />
            </Field>
            {/* Hidden mirrors keep disabled fields from being dropped on submit. */}
            {isSelf && <input type="hidden" name="role" value={user.role} />}
            {isSelf && user.active && <input type="hidden" name="active" value="on" />}
            <div className="sm:col-span-2 flex items-center gap-3">
              <SubmitButton disabled={readOnly}>Save changes</SubmitButton>
              <Link href="/app/settings/users" className="text-sm font-semibold text-slate-500 hover:underline">Cancel</Link>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="What this role can do" />
          <ul className="divide-y divide-slate-100 text-sm">
            {ROLES.map((r) => (
              <li key={r} className={r === user.role ? "bg-brand-50/60 px-5 py-3" : "px-5 py-3"}>
                <p className="font-semibold text-slate-800">
                  {ROLE_LABELS[r]} {r === user.role && <Badge tone="brand">Current</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{ROLE_HELP[r]}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-100 p-5 text-xs text-slate-500">
            Every change to a staff account is written to the practice audit trail.
          </p>
        </Card>
      </div>
    </>
  );
}
