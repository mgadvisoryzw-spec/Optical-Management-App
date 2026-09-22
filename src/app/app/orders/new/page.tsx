import Link from "next/link";
import { Search } from "lucide-react";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Table } from "@/components/ui";
import { OrderBuilder } from "./order-builder";
import { createOrder } from "../actions";
import { dioptre, fmtDate, fullName } from "@/lib/utils";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ patientId?: string; rxId?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();

  if (!sp.patientId) {
    const q = (sp.q ?? "").trim();
    const patients = await db.patient.findMany({
      where: { orgId: ctx.orgId, ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { phone: { contains: q } }, { patientNo: { contains: q } }] } : {}) },
      orderBy: q ? { lastName: "asc" } : { createdAt: "desc" },
      take: 20,
    });
    return (
      <>
        <PageHeader title="New order" subtitle="Who is this order for?" back={{ href: "/app/orders", label: "Orders" }} />
        <Card>
          <form className="flex gap-3 border-b border-slate-100 p-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input name="q" defaultValue={q} autoFocus placeholder="Search patient by name, phone or number" className="input pl-9" />
            </div>
            <button className="rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Search</button>
            <Link href="/app/patients/new" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">New patient</Link>
          </form>
          <Table>
            <thead><tr><th>Patient</th><th>Phone</th><th>Last exam</th><th /></tr></thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{fullName(p)} <span className="text-xs font-normal text-slate-400">{p.patientNo}</span></td>
                  <td>{p.phone ?? "—"}</td>
                  <td>{fmtDate(p.lastExamDate)}</td>
                  <td className="text-right"><Link href={`/app/orders/new?patientId=${p.id}`} className="font-semibold text-brand-700">Select →</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </>
    );
  }

  const patient = await db.patient.findFirstOrThrow({
    where: { id: sp.patientId, orgId: ctx.orgId },
    include: { medicalAid: true, prescriptions: { orderBy: { examDate: "desc" }, take: 5 } },
  });
  const [products, currencies, aids, labs] = await Promise.all([
    db.product.findMany({
      where: { orgId: ctx.orgId, active: true, category: { not: "CONSUMABLE" } },
      include: { stock: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { orgId: ctx.orgId, isLab: true }, select: { name: true } }),
  ]);
  const branch = ctx.workingBranchId;

  return (
    <>
      <PageHeader
        title={`New order · ${fullName(patient)}`}
        subtitle={`${patient.patientNo}${patient.medicalAid ? ` · ${patient.medicalAid.name} ${patient.medicalAidNo ?? ""}` : " · Private patient"}`}
        back={{ href: `/app/patients/${patient.id}`, label: "Back to patient" }}
      />
      <OrderBuilder
        action={createOrder}
        patientId={patient.id}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          sellPrice: p.sellPrice,
          stock: p.stock.filter((s) => s.branchId === branch).reduce((a, s) => a + s.quantity, 0),
          detail: [p.colour, p.reference, p.frameSize, p.lensIndex, p.coating].filter(Boolean).join(" · "),
        }))}
        currencies={currencies.map((c) => ({ code: c.code, rate: c.rate, isBase: c.isBase }))}
        baseCurrency={ctx.org.baseCurrency}
        vatRate={ctx.org.vatRate}
        prescriptions={patient.prescriptions.map((r) => ({ id: r.id, label: `${fmtDate(r.examDate)} · R ${dioptre(r.odSph)} / L ${dioptre(r.osSph)}${r.odAdd ? ` add ${dioptre(r.odAdd)}` : ""}` }))}
        defaultRxId={sp.rxId}
        medicalAid={patient.medicalAid ? { id: patient.medicalAid.id, name: patient.medicalAid.name } : null}
        aids={aids.map((a) => ({ id: a.id, name: a.name }))}
        consultationFee={ctx.org.consultationFee}
        labs={labs.map((l) => l.name)}
      />
    </>
  );
}
