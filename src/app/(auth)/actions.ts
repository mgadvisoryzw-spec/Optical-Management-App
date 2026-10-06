"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { provisionOrganization } from "@/lib/tenant";
import { str } from "@/lib/utils";

export type AuthState = { error?: string } | undefined;

export async function loginAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd.get("email")).toLowerCase();
  const password = str(fd.get("password"));
  const next = str(fd.get("next"));
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "That email and password don't match. Check them and try again." };
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ uid: user.id, oid: user.orgId, sa: user.isSuperAdmin });
  if (user.isSuperAdmin && !user.orgId) redirect("/platform");
  redirect(next.startsWith("/app") ? next : "/app");
}

/**
 * Sign-in for the MG Advisory platform owner account. Separate from the practice
 * login so the console has its own front door and rejects tenant credentials outright.
 */
export async function platformLoginAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd.get("email")).toLowerCase();
  const password = str(fd.get("password"));
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Those credentials don't match a platform owner account." };
  }
  if (!user.isSuperAdmin) {
    return { error: "This is the MG Advisory platform console. Practice users sign in at the practice login." };
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ uid: user.id, oid: user.orgId, sa: true });
  redirect("/platform");
}

export async function platformLogoutAction() {
  await destroySession();
  redirect("/platform/login");
}

export async function signupAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const orgName = str(fd.get("orgName"));
  const name = str(fd.get("name"));
  const email = str(fd.get("email")).toLowerCase();
  const phone = str(fd.get("phone"));
  const password = str(fd.get("password"));
  const planCode = str(fd.get("plan")) || "PRACTICE";
  const branchName = str(fd.get("branchName"));

  if (!orgName || !name || !email || !password) return { error: "Please fill in all required fields." };
  if (password.length < 8) return { error: "Your password must be at least 8 characters long." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Please enter a valid email address." };
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists. Sign in instead." };

  const { user, org } = await provisionOrganization({
    orgName,
    ownerName: name,
    email,
    phone,
    passwordHash: await hashPassword(password),
    planCode,
    branchName,
  });
  await createSession({ uid: user.id, oid: org.id });
  redirect("/app?welcome=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
