import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table } from "@/components/ui";
import { age, fmtDate, fullName } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Patients" };
const PAGE = 25;

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; aid?: string; recall?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.PatientWhereInput = { orgId: ctx.orgId };
  if (q) {
    const parts = q.split(/\s+/);
    where.AND = parts.map((p) => ({
      OR: [{ firstName: { contains: p } }, { lastName: { contains: p } }, { phone: { contains: p } }, { patientNo: { contains: p } }, { medicalAidNo: { contains: p } }, { nationalId: { contains: p } }],
    }));
  }
  if (sp.aid) where.medicalAidId = sp.aid;
  if (sp.recall === "due") where.nextRecallDate = { lte: new Date() };

  const [patients, total, aids] = await Promise.all([
    db.patient.findMany({ where, include: { medicalAid: true, branch: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.patient.count({ where }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.ceil(total / PAGE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.aid ? { aid: sp.aid } : {}), ...(sp.recall ? { recall: sp.recall } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Patients" subtitle={`${total.toLocaleString()} patient records`} actions={<LinkButton href="/app/patients/new"><Plus size={16} /> New patient</LinkButton>} />
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-64 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Name, phone, patient no., ID or medical aid no." className="input pl-9" />
          </div>
          <select name="aid" defaultValue={sp.aid ?? ""} className="input w-48">
            <option value="">All funders</option>
            {aids.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select name="recall" defaultValue={sp.recall ?? ""} className="input w-44">
            <option value="">Any recall status</option>
            <option value="due">Recall overdue</option>
          </select>
          <button className="rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Filter</button>
        </form>
        {patients.length ? (
          <Table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Contact</th>
                <th>Medical aid</th>
                <th>Last exam</th>
                <th>Recall due</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => {
                const overdue = p.nextRecallDate && p.nextRecallDate < new Date();
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/app/patients/${p.id}`} className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                          {p.firstName[0]}
                          {p.lastName[0]}
                        </span>
                        <span>
                          <span className="block font-semibold text-slate-900 hover:text-brand-700">{fullName(p)}</span>
                          <span className="text-xs text-slate-500">
                            {p.patientNo}
                            {age(p.dob) !== null && ` · ${age(p.dob)} yrs`}
                            {p.gender && ` · ${p.gender}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-sm">
                      {p.phone ?? "—"}
                      {p.email && <span className="block text-xs text-slate-400">{p.email}</span>}
                    </td>
                    <td>{p.medicalAid ? <span className="text-sm">{p.medicalAid.name}<span className="block text-xs text-slate-400">{p.medicalAidNo}</span></span> : <span className="text-slate-400">Private</span>}</td>
                    <td>{fmtDate(p.lastExamDate)}</td>
                    <td>{p.nextRecallDate ? <Badge tone={overdue ? "red" : "slate"}>{fmtDate(p.nextRecallDate)}</Badge> : "—"}</td>
                    <td className="text-sm text-slate-500">{p.branch?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={q ? "No patients match your search" : "No patients yet"} text="Register patients to record prescriptions, orders and recalls." action={<LinkButton href="/app/patients/new">Register a patient</LinkButton>} />
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between p-4 text-sm">
            <span className="text-slate-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <LinkButton variant="secondary" href={qs(page - 1)}>Previous</LinkButton>}
              {page < pages && <LinkButton variant="secondary" href={qs(page + 1)}>Next</LinkButton>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
