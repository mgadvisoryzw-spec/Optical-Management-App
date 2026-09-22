import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getContext, requireWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { cn, fmtDate, fullName, optStr, str } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };

async function completeFollowUp(id: string, fd: FormData) {
  "use server";
  const ctx = await requireWrite("clinical");
  await db.followUp.update({ where: { id, orgId: ctx.orgId }, data: { status: str(fd.get("status")) || "DONE", outcome: optStr(fd.get("outcome")) } });
  revalidatePath("/app/follow-ups");
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const showDone = sp.show === "done";
  const items = await db.followUp.findMany({
    where: { orgId: ctx.orgId, status: showDone ? { in: ["DONE", "CANCELLED"] } : "PENDING" },
    include: { patient: true, assignedTo: true },
    orderBy: { dueDate: showDone ? "desc" : "asc" },
    take: 200,
  });
  const now = new Date();

  return (
    <>
      <PageHeader title="Follow-ups" subtitle="Calls and checks after dispensing, referrals and clinical reviews" />
      <div className="mb-4 flex gap-2">
        <Link href="?" className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", !showDone ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>Pending</Link>
        <Link href="?show=done" className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", showDone ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>Completed</Link>
      </div>
      <Card>
        {items.length ? (
          <Table>
            <thead><tr><th>Due</th><th>Patient</th><th>Reason</th><th>Assigned</th><th>{showDone ? "Outcome" : "Action"}</th></tr></thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id}>
                  <td>{showDone ? fmtDate(f.dueDate) : <Badge tone={f.dueDate < now ? "red" : "amber"}>{fmtDate(f.dueDate)}</Badge>}</td>
                  <td><Link href={`/app/patients/${f.patientId}`} className="font-semibold text-brand-700">{fullName(f.patient)}</Link><span className="block text-xs text-slate-400">{f.patient.phone}</span></td>
                  <td>{f.reason}</td>
                  <td className="text-slate-500">{f.assignedTo?.name ?? "—"}</td>
                  <td>
                    {showDone ? (
                      <span className="text-sm text-slate-600">{f.outcome ?? f.status}</span>
                    ) : (
                      <form action={completeFollowUp.bind(null, f.id)} className="flex gap-2">
                        <input name="outcome" placeholder="Outcome / notes" className="input py-1.5" />
                        <SubmitButton name="status" value="DONE" className="px-3 py-1.5 text-xs">Done</SubmitButton>
                        <SubmitButton name="status" value="CANCELLED" variant="ghost" className="px-2 py-1.5 text-xs">Skip</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={showDone ? "No completed follow-ups" : "You're all caught up"} text="Add follow-ups from a patient's record or when you save an eye exam." />
        )}
      </Card>
    </>
  );
}
