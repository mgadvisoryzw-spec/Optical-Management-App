/* Seeds subscription plans, the MG Advisory platform owner and a fully populated demo practice. */
import { randomBytes } from "node:crypto";
import type { Product } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { PLANS } from "../src/lib/plans";
import { provisionOrganization } from "../src/lib/tenant";
import { invoiceOrder, recordAsset, recordClaimPayment, recordExpense, recordPurchase, recordReceipt, computeOrderTotals } from "../src/lib/services";
import { nextNumber, postJournal } from "../src/lib/ledger";
import { addDays, addMonths, round2 } from "../src/lib/utils";

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const q = (n: number) => Math.round(n * 4) / 4; // quarter-dioptre steps

async function main() {
  console.log("Seeding plans…");
  for (const p of PLANS) {
    const { features, ...rest } = p;
    await db.plan.upsert({ where: { code: p.code }, create: { ...rest, features: JSON.stringify(features) }, update: { ...rest, features: JSON.stringify(features) } });
  }

  // ── MG Advisory: the platform owner account that administers every client ──
  // Signs in at /platform/login, not the practice login. Override with
  // PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_NAME / PLATFORM_OWNER_PASSWORD in .env.
  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || "owner@mgadvisory.co.zw").toLowerCase();
  const ownerName = process.env.PLATFORM_OWNER_NAME || "MG Advisory";
  // There is deliberately no default password in the repo: leaving it unset gives
  // this install its own random one, printed once below.
  const chosenPassword = process.env.PLATFORM_OWNER_PASSWORD;
  const ownerPassword = chosenPassword || randomBytes(12).toString("base64url");
  const ownerExisted = !!(await db.user.findUnique({ where: { email: ownerEmail } }));

  await db.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      name: ownerName,
      passwordHash: await bcrypt.hash(ownerPassword, 10),
      role: "OWNER",
      isSuperAdmin: true,
      platformTitle: "Platform owner",
    },
    update: { name: ownerName, isSuperAdmin: true, active: true, platformTitle: "Platform owner" },
  });

  if (!ownerExisted && !chosenPassword) {
    const rule = "-".repeat(66);
    console.log(
      [
        "",
        rule,
        "  PLATFORM OWNER ACCOUNT CREATED - copy this password now.",
        "  It is shown once and cannot be recovered.",
        "",
        "    Sign in at : /platform/login",
        "    Email      : " + ownerEmail,
        "    Password   : " + ownerPassword,
        "",
        "  Change it in the console under Activity log.",
        rule,
        "",
      ].join("\n"),
    );
  } else {
    console.log("Platform owner: " + ownerEmail + " (sign in at /platform/login)");
  }

  // Legacy super-admin kept so existing installs don't lose access.
  await db.user.upsert({
    where: { email: "admin@optivault.app" },
    create: { email: "admin@optivault.app", name: "Platform Admin", passwordHash: await bcrypt.hash("admin1234", 10), role: "OWNER", isSuperAdmin: true, platformTitle: "Platform admin" },
    update: {},
  });

  if (await db.user.findUnique({ where: { email: "owner@demo-optical.co.zw" } })) {
    console.log("Demo practice already exists. Delete prisma/dev.db and run again to start fresh.");
    return;
  }

  console.log("Creating demo practice…");
  const { org, branch: hq, user: owner } = await provisionOrganization({
    orgName: "Clearview Optometrists",
    ownerName: "Dr. Tariro Moyo",
    email: "owner@demo-optical.co.zw",
    passwordHash: await bcrypt.hash("demo1234", 10),
    phone: "0242 700 123",
    branchName: "Harare CBD",
    planCode: "GROUP",
    zwgRate: 26.8,
  });
  const orgId = org.id;
  await db.organization.update({
    where: { id: orgId },
    data: { address: "2nd Floor, Karigamombe Centre, Samora Machel Ave, Harare", subscriptionStatus: "ACTIVE", currentPeriodEnd: addMonths(new Date(), 12), billingCycle: "YEARLY", vatRate: 0, consultationFee: 30, taxNumber: "200123456" },
  });
  await db.branch.update({ where: { id: hq.id }, data: { address: "Karigamombe Centre, Harare", phone: "0242 700 123" } });
  const brw = await db.branch.create({ data: { orgId, name: "Borrowdale", code: "BRW", address: "Sam Levy's Village, Borrowdale", phone: "0242 885 010" } });
  const byo = await db.branch.create({ data: { orgId, name: "Bulawayo", code: "BYO", address: "Fife Street, Bulawayo", phone: "0292 260 444" } });
  const branches = [hq, brw, byo];

  const pw = await bcrypt.hash("demo1234", 10);
  const optoms = [
    owner,
    await db.user.create({ data: { orgId, branchId: brw.id, name: "Dr. Kudzai Chikwanha", email: "kudzai@demo-optical.co.zw", passwordHash: pw, role: "OPTOMETRIST" } }),
    await db.user.create({ data: { orgId, branchId: byo.id, name: "Dr. Sipho Ndlovu", email: "sipho@demo-optical.co.zw", passwordHash: pw, role: "OPTOMETRIST" } }),
  ];
  await db.user.create({ data: { orgId, branchId: hq.id, name: "Ruvimbo Dube", email: "reception@demo-optical.co.zw", passwordHash: pw, role: "RECEPTION" } });
  await db.user.create({ data: { orgId, name: "Farai Mutasa CA(Z)", email: "accounts@demo-optical.co.zw", passwordHash: pw, role: "ACCOUNTANT" } });

  const [lab, frameSup, clSup] = await Promise.all([
    db.supplier.create({ data: { orgId, name: "Precision Optical Lab", contactName: "T. Marufu", phone: "0242 771 900", isLab: true } }),
    db.supplier.create({ data: { orgId, name: "Eyewear Distributors Zimbabwe", contactName: "N. Sibanda", phone: "0772 123 456" } }),
    db.supplier.create({ data: { orgId, name: "VisionCare Supplies (SA)", contactName: "L. Botha", email: "orders@visioncare.co.za" } }),
  ]);

  const start = addMonths(new Date(), -13);

  // Owner capital
  await db.$transaction((tx) =>
    postJournal(tx, { orgId, branchId: hq.id, date: start, memo: "Capital introduced by owner", source: "MANUAL", lines: [{ account: "1010", debit: 60000 }, { account: "3000", credit: 60000 }] }),
  );

  console.log("Products & opening stock…");
  const frameData = [
    ["Ray-Ban", "RB5154 Clubmaster", "Black/Gold", "2000", "51-21-145", "Acetate", 58, 145],
    ["Ray-Ban", "RB3447V Round", "Gunmetal", "2620", "50-21-145", "Metal", 55, 139],
    ["Ray-Ban", "RB7047 Rectangle", "Matte Black", "5196", "54-17-145", "Acetate", 50, 125],
    ["Oakley", "OX8046 Airdrop", "Satin Black", "0155", "55-18-143", "TR90", 62, 159],
    ["Oakley", "OX3217 Crosslink", "Pewter", "0356", "54-18-138", "Metal", 60, 155],
    ["Guess", "GU2632", "Havana", "052", "52-16-140", "Acetate", 32, 89],
    ["Guess", "GU1972", "Shiny Gold", "032", "53-17-140", "Metal", 30, 85],
    ["Tom Ford", "FT5401", "Dark Havana", "052", "52-18-145", "Acetate", 120, 289],
    ["Carrera", "CA8820", "Black Ruthenium", "003", "55-18-145", "Stainless steel", 45, 115],
    ["Vogue", "VO5286", "Top Black/Crystal", "W44", "51-17-140", "Acetate", 28, 79],
    ["Vogue", "VO4185", "Rose Gold", "5152", "52-17-140", "Metal", 27, 75],
    ["Silhouette", "5500 Rimless", "Titanium", "7000", "52-17-140", "Rimless", 95, 235],
    ["Clearview Essentials", "CE101", "Black", "C1", "52-18-140", "Acetate", 8, 35],
    ["Clearview Essentials", "CE102", "Tortoise", "C2", "50-19-140", "Acetate", 8, 35],
    ["Clearview Essentials", "CE201 Kids", "Blue", "C3", "44-16-125", "TR90", 7, 30],
    ["Clearview Essentials", "CE305", "Gunmetal", "C4", "54-17-140", "Metal", 9, 39],
  ] as const;
  const frames: Product[] = [];
  for (const [i, f] of frameData.entries()) {
    frames.push(
      await db.product.create({
        data: { orgId, category: "FRAME", sku: `FR-${String(i + 1).padStart(4, "0")}`, name: `${f[0]} ${f[1]} ${f[2]}`, brand: f[0], model: f[1], colour: f[2], reference: f[3], frameSize: f[4], material: f[5], costPrice: f[6], sellPrice: f[7], reorderLevel: 2, supplierId: frameSup.id },
      }),
    );
  }
  const lensData = [
    ["SINGLE_VISION", "1.56", "Hard coat", "Stock SV 1.56 HC", 6, 30],
    ["SINGLE_VISION", "1.56", "Blue light filter", "Stock SV 1.56 Blue-cut", 10, 55],
    ["SINGLE_VISION", "1.60", "Anti-reflective", "SV 1.60 AR", 16, 75],
    ["SINGLE_VISION", "1.56", "Photochromic + AR", "SV 1.56 Photochromic AR", 18, 85],
    ["BIFOCAL", "1.56", "Hard coat", "Flat-top 28 bifocal", 14, 65],
    ["BIFOCAL", "1.56", "Photochromic", "Flat-top 28 photochromic", 22, 95],
    ["MULTIFOCAL", "1.56", "Anti-reflective", "Progressive standard AR", 35, 160],
    ["MULTIFOCAL", "1.60", "Blue light filter", "Progressive premium Blue-cut", 60, 260],
    ["OFFICE", "1.56", "Anti-reflective", "Office / occupational AR", 30, 140],
  ] as const;
  const lenses: Product[] = [];
  for (const [i, l] of lensData.entries()) {
    lenses.push(
      await db.product.create({
        data: { orgId, category: "LENS", sku: `LN-${String(i + 1).padStart(4, "0")}`, name: `${l[3]} (pair)`, lensType: l[0], lensIndex: l[1], coating: l[2], costPrice: l[4], sellPrice: l[5], reorderLevel: 4, supplierId: lab.id, unit: "pair" },
      }),
    );
  }
  const cls = [
    await db.product.create({ data: { orgId, category: "CONTACT_LENS", sku: "CL-0001", name: "Acuvue Oasys 2-week (6 pack)", brand: "Johnson & Johnson", model: "Acuvue Oasys", costPrice: 18, sellPrice: 45, unit: "box", supplierId: clSup.id } }),
    await db.product.create({ data: { orgId, category: "CONTACT_LENS", sku: "CL-0002", name: "Dailies AquaComfort Plus (30 pack)", brand: "Alcon", model: "Dailies ACP", costPrice: 16, sellPrice: 38, unit: "box", supplierId: clSup.id } }),
  ];
  const acc = [
    await db.product.create({ data: { orgId, category: "ACCESSORY", sku: "AC-0001", name: "Hard spectacle case", costPrice: 1.5, sellPrice: 6, reorderLevel: 20 } }),
    await db.product.create({ data: { orgId, category: "ACCESSORY", sku: "AC-0002", name: "Opti-Free Puremoist 300ml", brand: "Alcon", costPrice: 6, sellPrice: 15, unit: "bottle", supplierId: clSup.id } }),
    await db.product.create({ data: { orgId, category: "ACCESSORY", sku: "AC-0003", name: "Lens cleaning spray + cloth kit", costPrice: 1.2, sellPrice: 5, reorderLevel: 20 } }),
  ];
  await db.product.create({ data: { orgId, category: "CONSUMABLE", sku: "CS-0001", name: "Microfibre cloths (pack of 100)", costPrice: 25, sellPrice: 0, trackStock: false } });

  const stockQty = (p: { category: string }) => (p.category === "FRAME" ? int(10, 14) : p.category === "LENS" ? int(22, 30) : p.category === "ACCESSORY" ? int(90, 120) : int(8, 16));
  for (const b of branches) {
    await db.$transaction((tx) =>
      recordPurchase(tx, {
        orgId, branchId: b.id, supplierId: frameSup.id, supplierInvoiceNo: `EDZ-${int(1000, 9999)}`, date: addDays(start, 2), currency: "USD", exchangeRate: 1, paid: true, paymentMethod: "BANK_TRANSFER",
        items: frames.map((f) => ({ productId: f.id, category: "FRAME", description: f.name, quantity: stockQty(f), unitCost: f.costPrice })),
      }),
    );
    await db.$transaction((tx) =>
      recordPurchase(tx, {
        orgId, branchId: b.id, supplierId: lab.id, supplierInvoiceNo: `POL-${int(1000, 9999)}`, date: addDays(start, 3), currency: "USD", exchangeRate: 1, paid: true, paymentMethod: "BANK_TRANSFER",
        items: [...lenses, ...cls, ...acc].map((p) => ({ productId: p.id, category: p.category, description: p.name, quantity: stockQty(p), unitCost: p.costPrice })),
      }),
    );
  }
  // Mid-year restock
  for (const b of branches) {
    await db.$transaction((tx) =>
      recordPurchase(tx, {
        orgId, branchId: b.id, supplierId: frameSup.id, supplierInvoiceNo: `EDZ-${int(1000, 9999)}`, date: addMonths(new Date(), -6), currency: "USD", exchangeRate: 1, paid: true, paymentMethod: "BANK_TRANSFER",
        items: [...frames, ...lenses].map((f) => ({ productId: f.id, category: f.category, description: f.name, quantity: f.category === "FRAME" ? int(6, 10) : int(10, 16), unitCost: f.costPrice })),
      }),
    );
  }
  // One unpaid supplier invoice and a ZWG consumables purchase
  await db.$transaction((tx) =>
    recordPurchase(tx, { orgId, branchId: hq.id, supplierId: frameSup.id, supplierInvoiceNo: "EDZ-7781", date: addDays(new Date(), -12), currency: "USD", exchangeRate: 1, paid: false, items: frames.slice(0, 4).map((f) => ({ productId: f.id, category: "FRAME", description: f.name, quantity: 4, unitCost: f.costPrice })) }),
  );
  await db.$transaction((tx) =>
    recordPurchase(tx, { orgId, branchId: hq.id, date: addDays(new Date(), -20), currency: "ZWG", exchangeRate: 26.8, paid: true, paymentMethod: "CASH", items: [{ category: "CONSUMABLE", description: "Cleaning solution & tissues", quantity: 1, unitCost: 850 }] }),
  );

  console.log("Assets…");
  const assetData = [
    ["Auto-refractor keratometer", "EQUIPMENT", 8500, 7],
    ["Slit lamp biomicroscope", "EQUIPMENT", 6200, 8],
    ["Automatic lens edger", "EQUIPMENT", 14000, 7],
    ["Reception furniture & display cabinets", "FURNITURE", 4800, 10],
    ["Computers & POS printers", "COMPUTER", 3200, 3],
  ] as const;
  for (const a of assetData) {
    await db.$transaction((tx) =>
      recordAsset(tx, { orgId, branchId: pick(branches).id, name: a[0], category: a[1], purchaseDate: addDays(start, 5), cost: a[2], currency: "USD", exchangeRate: 1, usefulLifeYears: a[3], residualValue: 0, paymentMethod: "BANK_TRANSFER" }),
    );
  }

  console.log("Patients, exams, orders…");
  const first = ["Tendai", "Rudo", "Farai", "Tatenda", "Nyasha", "Chipo", "Tafadzwa", "Kudakwashe", "Ruvimbo", "Tinashe", "Blessing", "Precious", "Munyaradzi", "Rumbidzai", "Simbarashe", "Vimbai", "Thabo", "Sipho", "Nomsa", "Themba", "Lindiwe", "Takudzwa", "Anesu", "Ropafadzo", "Tanaka", "Kundai", "Shingai", "Fadzai", "Tapiwa", "Chiedza", "Grace", "John", "Mary", "Peter", "Ruth", "Brian", "Esther", "Joseph"];
  const last = ["Moyo", "Ncube", "Sibanda", "Dube", "Ndlovu", "Mpofu", "Chikwanha", "Mutasa", "Marufu", "Chigumba", "Nyathi", "Mhlanga", "Gumbo", "Mazvimbakupa", "Makoni", "Zvobgo", "Chinembiri", "Mukanya", "Hove", "Shumba", "Banda", "Phiri", "Mapfumo", "Chirwa"];
  const aids = await db.medicalAid.findMany({ where: { orgId } });
  const occupations = ["Teacher", "Accountant", "Driver", "Nurse", "Student", "Engineer", "Retired", "Banker", "Farmer", "IT specialist", "Civil servant", "Business owner"];

  const now = new Date();
  for (let i = 0; i < 1000; i++) {
    const branch = i % 5 === 0 ? byo : i % 3 === 0 ? brw : hq;
    const optom = branch === byo ? optoms[2] : branch === brw ? optoms[1] : optoms[0];
    const ageYrs = int(8, 78);
    const aid = rnd() < 0.55 ? pick(aids) : null;
    const fn = pick(first);
    const ln = pick(last);
    const patient = await db.$transaction(async (tx) =>
      tx.patient.create({
        data: {
          orgId, branchId: branch.id, patientNo: await nextNumber(tx, orgId, "PAT", 5),
          firstName: fn, lastName: ln, gender: rnd() < 0.52 ? "Female" : "Male",
          dob: new Date(now.getFullYear() - ageYrs, int(0, 11), int(1, 28)),
          phone: `07${pick(["71", "72", "73", "74", "77", "78"])} ${int(100, 999)} ${int(100, 999)}`,
          email: rnd() < 0.4 ? `${fn.toLowerCase()}.${ln.toLowerCase()}${int(1, 99)}@gmail.com` : null,
          occupation: pick(occupations), address: pick(["Avondale, Harare", "Mabelreign, Harare", "Borrowdale, Harare", "Hillside, Bulawayo", "Suburbs, Bulawayo", "Chitungwiza", "Ruwa", "Greendale, Harare"]),
          medicalAidId: aid?.id, medicalAidNo: aid ? `${aid.code}-${int(100000, 999999)}` : null, medicalAidPlan: aid ? pick(["Standard", "Premier", "Gold", "Basic"]) : null,
          medicalHistory: rnd() < 0.2 ? pick(["Diabetic (type 2)", "Hypertension", "Family history of glaucoma", "Asthma"]) : null,
          createdAt: addDays(now, -int(30, 900)),
        },
      }),
    );

    // Exam between 1 and 30 months ago
    const examDate = addDays(now, -int(3, 900));
    examDate.setHours(int(8, 16), pick([0, 15, 30, 45]));
    const presby = ageYrs >= 42;
    const sph = q(rnd() < 0.55 ? -rnd() * 5 : rnd() * 3);
    const cyl = rnd() < 0.6 ? -q(rnd() * 2) : 0;
    const add = presby ? q(0.75 + Math.min(2.5, (ageYrs - 40) * 0.07)) : null;
    const lensType = presby ? (rnd() < 0.6 ? "MULTIFOCAL" : "BIFOCAL") : "SINGLE_VISION";
    const rx = await db.prescription.create({
      data: {
        patientId: patient.id, branchId: branch.id, optometristId: optom.id, examDate, rxType: "SPECTACLES",
        odSph: sph, odCyl: cyl || null, odAxis: cyl ? int(1, 180) : null, odAdd: add, odVa: "6/6",
        osSph: q(sph + (rnd() - 0.5)), osCyl: cyl ? -q(rnd() * 2) : null, osAxis: cyl ? int(1, 180) : null, osAdd: add, osVa: pick(["6/6", "6/9"]),
        pdDistance: int(58, 68), pdNear: presby ? int(55, 64) : null, iopOd: int(12, 20), iopOs: int(12, 20),
        chiefComplaint: pick(["Blurred distance vision", "Difficulty reading", "Headaches after screen use", "Routine check-up", "Eye strain when driving at night"]),
        diagnosis: presby ? "Presbyopia with refractive error" : sph < 0 ? "Myopia" + (cyl ? " with astigmatism" : "") : "Hyperopia",
        lensRecommendation: lensType, recommendations: pick(["Full-time wear", "Blue-cut recommended for screen use", "Photochromic advised for outdoor work", "Review in 2 years"]),
        expiresAt: addMonths(examDate, 24),
      },
    });
    await db.patient.update({ where: { id: patient.id }, data: { lastExamDate: examDate, nextRecallDate: addMonths(examDate, 24) } });

    // Most exams in the last 12 months become orders
    const daysAgo = (now.getTime() - examDate.getTime()) / 86400000;
    if (daysAgo > 380 || rnd() < 0.1) continue;
    const frame = pick(frames);
    const lens = lenses.find((l) => l.lensType === lensType && rnd() < 0.6) ?? lenses.find((l) => l.lensType === lensType)!;
    const items = [
      { productId: null, category: "CONSULTATION", description: "Comprehensive eye examination", quantity: 1, unitPrice: 30 },
      { productId: frame.id, category: "FRAME", description: frame.name, quantity: 1, unitPrice: frame.sellPrice },
      { productId: lens.id, category: "LENS", description: lens.name, eye: "OU", quantity: 1, unitPrice: lens.sellPrice },
    ];
    if (rnd() < 0.4) items.push({ productId: acc[0].id, category: "ACCESSORY", description: acc[0].name, quantity: 1, unitPrice: acc[0].sellPrice });
    const zwg = rnd() < 0.18;
    const rate = zwg ? 26.8 : 1;
    const lineItems = items.map((it) => ({ ...it, unitPrice: round2(it.unitPrice * rate) }));
    const discount = rnd() < 0.2 ? round2(10 * rate) : 0;
    const { subtotal, tax, total } = computeOrderTotals(lineItems, discount, 0);
    const maPortion = aid && !zwg ? round2(Math.min(total * 0.7, pick([120, 150, 180, 200]))) : 0;
    const recent = daysAgo < 21;
    const status = recent ? pick(["ORDERED", "IN_LAB", "READY", "READY", "AWAITING_AUTH"]) : "COLLECTED";
    const orderStatus = status === "AWAITING_AUTH" && !maPortion ? "IN_LAB" : status;

    await db.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orgId, branchId: branch.id, orderNo: await nextNumber(tx, orgId, "ORD"), patientId: patient.id, prescriptionId: rx.id,
          status: orderStatus, currency: zwg ? "ZWG" : "USD", exchangeRate: rate, subtotal, discount, tax, total,
          medicalAidId: maPortion ? aid!.id : null, medicalAidPortion: maPortion, patientPortion: round2(total - maPortion),
          labName: lab.name, promisedDate: addDays(examDate, 7), collectedAt: orderStatus === "COLLECTED" ? addDays(examDate, int(5, 12)) : null,
          createdById: optom.id, createdAt: examDate,
          items: { create: lineItems.map((it) => ({ ...it, eye: (it as { eye?: string }).eye ?? null, lineTotal: round2(it.quantity * it.unitPrice) })) },
        },
      });
      let claimId: string | null = null;
      if (maPortion) {
        const c = await tx.medicalAidClaim.create({
          data: {
            orgId, claimNo: await nextNumber(tx, orgId, "CLM"), orderId: o.id, medicalAidId: aid!.id, patientId: patient.id, memberNo: patient.medicalAidNo,
            amount: maPortion, currency: "USD", exchangeRate: 1, status: orderStatus === "AWAITING_AUTH" ? "PENDING_AUTH" : "AUTHORISED",
            authNumber: orderStatus === "AWAITING_AUTH" ? null : `AUTH${int(10000, 99999)}`, createdAt: examDate,
          },
        });
        claimId = c.id;
      }
      // deposit on the day
      const deposit = round2((total - maPortion) * pick([0.5, 0.6, 1]));
      const method = zwg ? pick(["ECOCASH", "CASH", "ZIPIT"]) : pick(["CASH", "CARD", "ECOCASH", "BANK_TRANSFER", "INNBUCKS"]);
      if (orderStatus !== "AWAITING_AUTH") await invoiceOrder(tx, o.id, examDate);
      await recordReceipt(tx, { orgId, branchId: branch.id, orderId: o.id, amount: deposit, currency: o.currency, exchangeRate: rate, method, date: examDate, userId: optom.id, reference: method === "ECOCASH" ? `MP${int(100000, 999999)}.${int(1000, 9999)}` : null });
      // balance on collection
      if (orderStatus === "COLLECTED" && deposit < total - maPortion && rnd() < 0.85) {
        await recordReceipt(tx, { orgId, branchId: branch.id, orderId: o.id, amount: round2(total - maPortion - deposit), currency: o.currency, exchangeRate: rate, method, date: addDays(examDate, int(5, 12)), userId: optom.id });
      }
      if (claimId && orderStatus === "COLLECTED") {
        await tx.medicalAidClaim.update({ where: { id: claimId }, data: { status: "SUBMITTED", submittedAt: addDays(examDate, 10) } });
        if (daysAgo > 45 && rnd() < 0.8) {
          const short = rnd() < 0.25;
          await recordClaimPayment(tx, { claimId, amount: short ? round2(maPortion * 0.85) : maPortion, method: "BANK_TRANSFER", remainder: short ? "BILL_PATIENT" : "KEEP_OPEN", reference: `REM${int(1000, 9999)}`, date: addDays(examDate, int(35, 60)) });
        }
      }
    });
  }

  // A few contact lens / repair walk-in sales
  const someone = await db.patient.findMany({ where: { orgId }, take: 12, skip: 20 });
  for (const [i, p] of someone.entries()) {
    const date = addDays(now, -int(1, 200));
    const repair = i % 2 === 0;
    const items = repair
      ? [{ productId: null, category: "REPAIR", description: pick(["Replace nose pads", "Solder bridge", "Replace hinge screw & adjust", "Temple replacement"]), quantity: 1, unitPrice: pick([5, 10, 15, 25]) }]
      : [{ productId: cls[i % 2].id, category: "CONTACT_LENS", description: cls[i % 2].name, quantity: 2, unitPrice: cls[i % 2].sellPrice }, { productId: acc[1].id, category: "ACCESSORY", description: acc[1].name, quantity: 1, unitPrice: acc[1].sellPrice }];
    const { subtotal, tax, total } = computeOrderTotals(items, 0, 0);
    await db.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: { orgId, branchId: p.branchId ?? hq.id, orderNo: await nextNumber(tx, orgId, "ORD"), patientId: p.id, status: "COLLECTED", currency: "USD", subtotal, tax, total, patientPortion: total, collectedAt: date, createdAt: date, items: { create: items.map((it) => ({ ...it, lineTotal: round2(it.quantity * it.unitPrice) })) } },
      });
      await invoiceOrder(tx, o.id, date);
      await recordReceipt(tx, { orgId, branchId: o.branchId, orderId: o.id, amount: total, currency: "USD", exchangeRate: 1, method: pick(["CASH", "ECOCASH", "CARD"]), date });
    });
  }

  console.log("Expenses…");
  for (let m = 12; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    if (d > now) continue;
    for (const b of branches) {
      const scale = b === hq ? 1 : b === brw ? 0.8 : 0.6;
      const post = (day: number, accountCode: string, description: string, amount: number, method: string, currency = "USD", rate = 1, payee?: string) => {
        const date = new Date(d.getFullYear(), d.getMonth(), day);
        if (date > now) return Promise.resolve();
        return db.$transaction((tx) => recordExpense(tx, { orgId, branchId: b.id, date, accountCode, description, amount, currency, exchangeRate: rate, method, payee }));
      };
      await post(1, "6000", `Rent – ${b.name}`, round2(550 * scale), "BANK_TRANSFER", "USD", 1, "Landlord");
      await post(25, "6010", `Salaries – ${b.name}`, round2(1000 * scale), "BANK_TRANSFER");
      await post(10, "6020", `ZESA & water – ${b.name}`, round2(2400 * scale * (0.9 + rnd() * 0.2)), "ECOCASH", "ZWG", 26.8, "ZESA / City council");
      await post(12, "6040", `Internet & airtime – ${b.name}`, round2(60 * scale), "ECOCASH");
      await post(28, "6050", `Bank charges & IMTT – ${b.name}`, round2(20 + rnd() * 15), "BANK_TRANSFER");
      const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      if (eom < now) {
        const bal = async (code: string) => {
          const a = await db.journalLine.aggregate({ where: { account: { orgId, code }, branchId: b.id, entry: { date: { lte: eom } } }, _sum: { debit: true, credit: true } });
          return round2((a._sum.debit ?? 0) - (a._sum.credit ?? 0));
        };
        for (const code of ["1000", "1020"]) {
          const amt = round2((await bal(code)) - 200);
          if (amt > 0) await db.$transaction((tx) => postJournal(tx, { orgId, branchId: b.id, date: eom, memo: code === "1000" ? `Cash banked – ${b.name}` : `EcoCash/InnBucks sweep to bank – ${b.name}`, source: "MANUAL", lines: [{ account: "1010", debit: amt }, { account: code, credit: amt }] }));
        }
      }
      if (m % 3 === 0) await post(15, "6030", `Facebook & radio ads – ${b.name}`, round2(120 * scale), "BANK_TRANSFER");
    }
  }

  console.log("Depreciation…");
  const { runDepreciation } = await import("../src/lib/services");
  await db.$transaction((tx) => runDepreciation(tx, orgId, addMonths(now, -1)), { timeout: 60000 });

  console.log("Appointments, follow-ups, messages…");
  const pats = await db.patient.findMany({ where: { orgId }, take: 40, orderBy: { nextRecallDate: "asc" } });
  for (let d = -2; d <= 5; d++) {
    const day = addDays(now, d);
    if (day.getDay() === 0) continue;
    for (let s = 0; s < int(3, 7); s++) {
      const b = pick(branches);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + s, pick([0, 30]));
      const p = pick(pats);
      await db.appointment.create({
        data: {
          orgId, branchId: b.id, patientId: s === 5 ? null : p.id, guestName: s === 5 ? "Walk-in: Memory Chari" : null, guestPhone: s === 5 ? "0773 555 010" : null,
          optometristId: b === byo ? optoms[2].id : b === brw ? optoms[1].id : optoms[0].id, startsAt: at, type: pick(["EYE_EXAM", "EYE_EXAM", "COLLECTION", "CONTACT_LENS", "FOLLOW_UP"]),
          status: d < 0 ? pick(["COMPLETED", "COMPLETED", "NO_SHOW"]) : d === 0 && s < 2 ? "ARRIVED" : pick(["BOOKED", "CONFIRMED"]),
        },
      });
    }
  }
  for (const p of pats.slice(0, 6)) {
    await db.followUp.create({ data: { orgId, patientId: p.id, assignedToId: owner.id, dueDate: addDays(now, int(-5, 10)), reason: pick(["Check adaptation to progressives", "Review IOP in 3 months", "Contact lens aftercare", "Call re: frame adjustment"]) } });
  }
  for (const p of pats.slice(0, 8)) {
    await db.message.create({ data: { orgId, patientId: p.id, channel: pick(["SMS", "WHATSAPP"]), purpose: "RECALL", to: "+263771000000", body: `Hi ${p.firstName}, it's been 2 years since your last eye test at Clearview Optometrists…`, status: "LOGGED", provider: "log", sentAt: addDays(now, -int(1, 20)), createdAt: addDays(now, -int(1, 20)) } });
    await db.patient.update({ where: { id: p.id }, data: { lastRecallSentAt: addDays(now, -int(1, 20)) } });
  }

  await db.subscriptionInvoice.create({ data: { orgId, number: "OV-2026-00001", planCode: "GROUP", cycle: "YEARLY", amount: 1590, status: "PAID", method: "PAYNOW", periodStart: now, periodEnd: addMonths(now, 12), paidAt: now } });

  const trial = await provisionOrganization({ orgName: "Sunrise Eye Care", ownerName: "Nokuthula Khumalo", email: "trial@sunrise-eyecare.co.zw", passwordHash: pw, planCode: "SOLO", branchName: "Gweru" });
  console.log(`Created trial tenant ${trial.org.name}`);
  console.log("Done ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
