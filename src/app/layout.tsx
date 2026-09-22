import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OptiVault — Optical practice management & accounting", template: "%s · OptiVault" },
  description:
    "Cloud software for optometrists and optical retailers: patient records, prescriptions, orders, medical aid claims, recalls via SMS & WhatsApp, inventory and full multi-currency accounting across branches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
