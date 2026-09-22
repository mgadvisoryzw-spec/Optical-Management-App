export const ROLES = ["OWNER", "ADMIN", "OPTOMETRIST", "RECEPTION", "ACCOUNTANT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  OPTOMETRIST: "Optometrist",
  RECEPTION: "Front desk",
  ACCOUNTANT: "Accountant",
};

/** Which roles can reach which area of the app. */
export const PERMISSIONS = {
  clinical: ["OWNER", "ADMIN", "OPTOMETRIST", "RECEPTION"],
  prescribe: ["OWNER", "ADMIN", "OPTOMETRIST"],
  sales: ["OWNER", "ADMIN", "OPTOMETRIST", "RECEPTION", "ACCOUNTANT"],
  inventory: ["OWNER", "ADMIN", "RECEPTION", "ACCOUNTANT"],
  accounting: ["OWNER", "ADMIN", "ACCOUNTANT"],
  settings: ["OWNER", "ADMIN"],
  billing: ["OWNER"],
  /** Permanently deleting records (receipts, orders, claims, expenses…). */
  delete: ["OWNER", "ADMIN"],
} as const;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: string, perm: Permission) {
  return (PERMISSIONS[perm] as readonly string[]).includes(role);
}

export const PRODUCT_CATEGORIES = [
  { value: "FRAME", label: "Frames" },
  { value: "LENS", label: "Spectacle lenses" },
  { value: "CONTACT_LENS", label: "Contact lenses" },
  { value: "ACCESSORY", label: "Accessories & solutions" },
  { value: "CONSUMABLE", label: "Consumables" },
];

export const LENS_TYPES = [
  { value: "SINGLE_VISION", label: "Single vision" },
  { value: "BIFOCAL", label: "Bifocal" },
  { value: "MULTIFOCAL", label: "Multifocal / progressive" },
  { value: "OFFICE", label: "Office / occupational" },
];

export const LENS_INDEXES = ["1.50", "1.56", "1.59 Polycarbonate", "1.60", "1.67", "1.74"];
export const LENS_COATINGS = ["Uncoated", "Hard coat", "Anti-reflective", "Blue light filter", "Photochromic", "Photochromic + AR", "Tinted", "Polarised"];

export const SALE_CATEGORIES = [
  { value: "FRAME", label: "Frame", account: "4000" },
  { value: "LENS", label: "Lenses", account: "4010" },
  { value: "CONTACT_LENS", label: "Contact lenses", account: "4020" },
  { value: "CONSULTATION", label: "Consultation / eye test", account: "4030" },
  { value: "REPAIR", label: "Frame repair", account: "4040" },
  { value: "ACCESSORY", label: "Accessories", account: "4050" },
  { value: "OTHER", label: "Other", account: "4050" },
];

export const ORDER_STATUSES = [
  { value: "QUOTE", label: "Quote", tone: "slate" },
  { value: "AWAITING_AUTH", label: "Awaiting medical aid", tone: "amber" },
  { value: "ORDERED", label: "Confirmed", tone: "blue" },
  { value: "IN_LAB", label: "In lab", tone: "violet" },
  { value: "READY", label: "Ready for collection", tone: "teal" },
  { value: "COLLECTED", label: "Collected", tone: "green" },
  { value: "CANCELLED", label: "Cancelled", tone: "red" },
] as const;

export const CLAIM_STATUSES = [
  { value: "PENDING_AUTH", label: "Pending authorisation", tone: "amber" },
  { value: "AUTHORISED", label: "Authorised", tone: "blue" },
  { value: "SUBMITTED", label: "Claim submitted", tone: "violet" },
  { value: "PART_PAID", label: "Part paid", tone: "teal" },
  { value: "PAID", label: "Paid", tone: "green" },
  { value: "REJECTED", label: "Rejected", tone: "red" },
] as const;

export const APPOINTMENT_TYPES = [
  { value: "EYE_EXAM", label: "Eye examination" },
  { value: "CONTACT_LENS", label: "Contact lens fitting" },
  { value: "COLLECTION", label: "Spectacle collection" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "REPAIR", label: "Repair / adjustment" },
  { value: "CONSULTATION", label: "Consultation" },
];

export const APPOINTMENT_STATUSES = [
  { value: "BOOKED", label: "Booked", tone: "slate" },
  { value: "CONFIRMED", label: "Confirmed", tone: "blue" },
  { value: "ARRIVED", label: "Arrived", tone: "violet" },
  { value: "COMPLETED", label: "Completed", tone: "green" },
  { value: "NO_SHOW", label: "No-show", tone: "amber" },
  { value: "CANCELLED", label: "Cancelled", tone: "red" },
] as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash", account: "1000" },
  { value: "CARD", label: "Card / POS swipe", account: "1010" },
  { value: "BANK_TRANSFER", label: "Bank transfer / RTGS", account: "1010" },
  { value: "ZIPIT", label: "ZIPIT", account: "1010" },
  { value: "ECOCASH", label: "EcoCash", account: "1020" },
  { value: "ONEMONEY", label: "OneMoney", account: "1020" },
  { value: "INNBUCKS", label: "InnBucks", account: "1020" },
];

export function paymentAccount(method: string) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.account ?? "1000";
}

export const ASSET_CATEGORIES = [
  { value: "EQUIPMENT", label: "Optical equipment", account: "1500" },
  { value: "FURNITURE", label: "Furniture & fittings", account: "1510" },
  { value: "VEHICLE", label: "Motor vehicles", account: "1520" },
  { value: "COMPUTER", label: "Computer equipment", account: "1530" },
];

export function labelOf(list: readonly { value: string; label: string }[], value?: string | null) {
  return list.find((x) => x.value === value)?.label ?? value ?? "";
}

export function toneOf(list: readonly { value: string; tone: string }[], value?: string | null) {
  return list.find((x) => x.value === value)?.tone ?? "slate";
}
