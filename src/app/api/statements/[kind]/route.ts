import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth";
import { can } from "@/lib/constants";
import { STATEMENT_KINDS, buildStatement, type StatementKind } from "@/lib/statements";
import { toCsv, toPdf, toXlsx } from "@/lib/statement-export";
import { endOfDay, isoDate } from "@/lib/utils";

/** Downloads a financial statement: /api/statements/income-statement?format=pdf|xlsx|csv&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!STATEMENT_KINDS.includes(kind as StatementKind)) return new NextResponse("Unknown statement", { status: 404 });
  const ctx = await getContext();
  const allowed = kind === "inventory-valuation" ? can(ctx.user.role, "inventory") || can(ctx.user.role, "accounting") : can(ctx.user.role, "accounting");
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "pdf";
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(new Date().getFullYear(), 0, 1);
  const to = sp.get("to") ? endOfDay(new Date(sp.get("to")!)) : endOfDay();
  const branchLabel = ctx.branchId ? ctx.branches.find((b) => b.id === ctx.branchId)?.name ?? "Branch" : "All branches (consolidated)";
  const statement = await buildStatement(kind as StatementKind, { orgId: ctx.orgId, from, to, branchId: ctx.branchId, branchLabel, currency: ctx.org.baseCurrency });
  const header = { orgName: ctx.org.name, generatedBy: ctx.user.name };
  const base = `${ctx.org.slug}-${kind}-${isoDate(to)}`;

  if (format === "csv") {
    return new NextResponse("﻿" + toCsv(statement, header), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }
  if (format === "xlsx") {
    const buf = await toXlsx(statement, header);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  const pdf = toPdf(statement, header);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` } });
}
