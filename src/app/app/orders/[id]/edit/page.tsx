import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, PageHeader } from "@/components/ui";
import { OrderBuilder } from "../../new/order-builder";
import { updateOrder } from "../../actions";
import { dioptre, fmtDate, fullName, isoDate } from "@/lib/utils";

export const metadata = { title: "Edit order" };

export default async function EditOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const order = await db.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { items: true, patient: { include: { prescriptions: { orderBy: { examDate: "desc" }, take: 5 } } } },
  });
  if (!order) notFound();
  if (order.status === "CANCELLED") redirect(`/app/orders/${id}`);

  const [products, currencies, aids, labs] = await Promise.all([
    db.product.findMany({ where: { orgId: ctx.orgId, active: true, category: { not: "CONSUMABLE" } }, include: { stock: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { orgId: ctx.orgId, isLab: true }, select: { name: true } }),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${order.orderNo}`} subtitle={`${fullName(order.patient)} · ${order.patient.patientNo}`} back={{ href: `/app/orders/${id}`, label: "Back to order" }} />
      {sp.error && <div className="mb-4"><Alert tone="red">{sp.error}</Alert></div>}
      {order.status === "COLLECTED" && <div className="mb-4"><Alert tone="amber">This order has already been collected. Only change it to correct a mistake.</Alert></div>}
      <OrderBuilder
        action={updateOrder.bind(null, id)}
        patientId={order.patientId}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          sellPrice: p.sellPrice,
          stock: p.stock.filter((s) => s.branchId === order.branchId).reduce((a, s) => a + s.quantity, 0),
          detail: [p.colour, p.reference, p.frameSize, p.lensIndex, p.coating].filter(Boolean).join(" · "),
        }))}
        currencies={currencies.map((c) => ({ code: c.code, rate: c.rate, isBase: c.isBase }))}
        baseCurrency={ctx.org.baseCurrency}
        vatRate={ctx.org.vatRate}
        prescriptions={order.patient.prescriptions.map((r) => ({ id: r.id, label: `${fmtDate(r.examDate)} · R ${dioptre(r.odSph)} / L ${dioptre(r.osSph)}${r.odAdd ? ` add ${dioptre(r.odAdd)}` : ""}` }))}
        medicalAid={null}
        aids={aids.map((a) => ({ id: a.id, name: a.name }))}
        consultationFee={ctx.org.consultationFee}
        labs={labs.map((l) => l.name)}
        initial={{
          lines: order.items.map((i) => ({ productId: i.productId, category: i.category, description: i.description, eye: i.eye ?? "", quantity: i.quantity, unitPrice: i.unitPrice })),
          currency: order.currency,
          rate: order.exchangeRate,
          discount: order.discount,
          taxRate: order.taxRate,
          medicalAidId: order.medicalAidId ?? "",
          medicalAidPortion: order.medicalAidPortion,
          prescriptionId: order.prescriptionId ?? "",
          labName: order.labName ?? "",
          promisedDate: isoDate(order.promisedDate),
          notes: order.notes ?? "",
          lockCurrency: order.amountPaid !== 0,
          posted: !!order.invoicedAt,
          cancelHref: `/app/orders/${id}`,
        }}
      />
    </>
  );
}
