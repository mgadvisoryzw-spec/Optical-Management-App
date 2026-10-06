import { redirect } from "next/navigation";

/** The platform admin area moved to /platform (the MG Advisory owner console). */
export default function AdminRedirect() {
  redirect("/platform");
}
