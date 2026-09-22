import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { db } from "./db";
import { can, type Permission } from "./constants";

export const SESSION_COOKIE = "ov_session";
export const BRANCH_COOKIE = "ov_branch";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export type SessionPayload = { uid: string; oid: string | null; sa?: boolean };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(BRANCH_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Is the tenant allowed to create/modify records (trial valid or subscription active)? */
export function subscriptionState(org: { subscriptionStatus: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null }) {
  const now = Date.now();
  if (org.subscriptionStatus === "ACTIVE") {
    if (!org.currentPeriodEnd || org.currentPeriodEnd.getTime() + 7 * 86400000 > now) return { ok: true, reason: "" };
    return { ok: false, reason: "Your subscription has lapsed. Renew to continue recording transactions." };
  }
  if (org.subscriptionStatus === "TRIALING") {
    if (org.trialEndsAt && org.trialEndsAt.getTime() > now) {
      const days = Math.ceil((org.trialEndsAt.getTime() - now) / 86400000);
      return { ok: true, reason: `${days} day${days === 1 ? "" : "s"} left in your free trial.`, trial: true };
    }
    return { ok: false, reason: "Your free trial has ended. Choose a plan to keep using OptiVault." };
  }
  return { ok: false, reason: "Your subscription is inactive. Choose a plan to continue." };
}

/**
 * Loads the signed-in user, their organisation and branch scope.
 * `branchId` is null when the user is viewing all branches (owners/admins/accountants only).
 */
export const getContext = cache(async () => {
  const session = await readSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.uid },
    include: { organization: { include: { plan: true, branches: { where: { active: true }, orderBy: { name: "asc" } } } } },
  });
  if (!user || !user.active) redirect("/login");
  if (!user.organization) redirect(user.isSuperAdmin ? "/admin" : "/login");

  const org = user.organization;
  const branches = org.branches;
  const multiBranchRoles = ["OWNER", "ADMIN", "ACCOUNTANT"];
  const jar = await cookies();
  const pref = jar.get(BRANCH_COOKIE)?.value;

  let branchId: string | null;
  if (!multiBranchRoles.includes(user.role)) {
    branchId = user.branchId ?? branches[0]?.id ?? null;
  } else if (pref === "all") {
    branchId = null;
  } else if (pref && branches.some((b) => b.id === pref)) {
    branchId = pref;
  } else {
    branchId = branches.length > 1 ? null : branches[0]?.id ?? null;
  }
  const canSwitchBranch = multiBranchRoles.includes(user.role) && branches.length > 1;
  const sub = subscriptionState(org);

  return {
    user,
    org,
    orgId: org.id,
    branches,
    branchId,
    canSwitchBranch,
    /** Branch used when creating records while "All branches" is selected. */
    workingBranchId: branchId ?? user.branchId ?? branches[0]?.id ?? "",
    subscription: sub,
  };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;

export async function requirePermission(perm: Permission) {
  const ctx = await getContext();
  if (!can(ctx.user.role, perm)) redirect("/app?denied=" + perm);
  return ctx;
}

/** For server actions that write data. Blocks writes when the subscription is not in good standing. */
export async function requireWrite(perm: Permission) {
  const ctx = await requirePermission(perm);
  if (!ctx.subscription.ok) redirect("/app/billing?locked=1");
  return ctx;
}

export async function requireSuperAdmin() {
  const session = await readSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user?.isSuperAdmin) redirect("/app");
  return user;
}

/** Prisma `where` fragment that scopes a query to the active branch. */
export function branchScope(ctx: { branchId: string | null }) {
  return ctx.branchId ? { branchId: ctx.branchId } : {};
}
