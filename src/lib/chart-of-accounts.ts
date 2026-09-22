export type AccountSeed = { code: string; name: string; type: string; subtype?: string };

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  // Assets
  { code: "1000", name: "Cash on hand", type: "ASSET", subtype: "CASH" },
  { code: "1010", name: "Bank", type: "ASSET", subtype: "BANK" },
  { code: "1020", name: "Mobile money (EcoCash/OneMoney/InnBucks)", type: "ASSET", subtype: "MOBILE" },
  { code: "1100", name: "Accounts receivable – patients", type: "ASSET", subtype: "RECEIVABLE" },
  { code: "1110", name: "Accounts receivable – medical aid", type: "ASSET", subtype: "RECEIVABLE" },
  { code: "1200", name: "Inventory – frames", type: "ASSET", subtype: "INVENTORY" },
  { code: "1210", name: "Inventory – spectacle lenses", type: "ASSET", subtype: "INVENTORY" },
  { code: "1220", name: "Inventory – contact lenses & accessories", type: "ASSET", subtype: "INVENTORY" },
  { code: "1230", name: "Consumables stock", type: "ASSET", subtype: "INVENTORY" },
  { code: "1500", name: "Optical equipment", type: "ASSET", subtype: "FIXED" },
  { code: "1510", name: "Furniture & fittings", type: "ASSET", subtype: "FIXED" },
  { code: "1520", name: "Motor vehicles", type: "ASSET", subtype: "FIXED" },
  { code: "1530", name: "Computer equipment", type: "ASSET", subtype: "FIXED" },
  { code: "1590", name: "Accumulated depreciation", type: "ASSET", subtype: "CONTRA" },
  // Liabilities
  { code: "2000", name: "Accounts payable – suppliers", type: "LIABILITY" },
  { code: "2100", name: "VAT payable", type: "LIABILITY" },
  { code: "2200", name: "Patient deposits (unallocated)", type: "LIABILITY" },
  { code: "2300", name: "Loans & borrowings", type: "LIABILITY" },
  // Equity
  { code: "3000", name: "Owner's capital", type: "EQUITY" },
  { code: "3100", name: "Retained earnings", type: "EQUITY" },
  // Income
  { code: "4000", name: "Sales – frames", type: "INCOME" },
  { code: "4010", name: "Sales – spectacle lenses", type: "INCOME" },
  { code: "4020", name: "Sales – contact lenses", type: "INCOME" },
  { code: "4030", name: "Consultation & eye test fees", type: "INCOME" },
  { code: "4040", name: "Frame repairs", type: "INCOME" },
  { code: "4050", name: "Accessories & other sales", type: "INCOME" },
  { code: "4900", name: "Discounts allowed", type: "INCOME", subtype: "CONTRA" },
  { code: "4950", name: "Medical aid shortfall write-offs", type: "INCOME", subtype: "CONTRA" },
  { code: "4990", name: "Other income / FX gains", type: "INCOME" },
  // Cost of sales
  { code: "5000", name: "Cost of sales – frames", type: "EXPENSE", subtype: "COGS" },
  { code: "5010", name: "Cost of sales – lenses", type: "EXPENSE", subtype: "COGS" },
  { code: "5020", name: "Cost of sales – contact lenses & accessories", type: "EXPENSE", subtype: "COGS" },
  { code: "5030", name: "Laboratory / glazing fees", type: "EXPENSE", subtype: "COGS" },
  // Operating expenses
  { code: "6000", name: "Rent", type: "EXPENSE", subtype: "OPEX" },
  { code: "6010", name: "Salaries & wages", type: "EXPENSE", subtype: "OPEX" },
  { code: "6020", name: "Electricity & water", type: "EXPENSE", subtype: "OPEX" },
  { code: "6030", name: "Marketing & advertising", type: "EXPENSE", subtype: "OPEX" },
  { code: "6040", name: "Telephone, internet & SMS", type: "EXPENSE", subtype: "OPEX" },
  { code: "6050", name: "Bank charges & IMTT", type: "EXPENSE", subtype: "OPEX" },
  { code: "6060", name: "Consumables used", type: "EXPENSE", subtype: "OPEX" },
  { code: "6070", name: "Repairs & maintenance", type: "EXPENSE", subtype: "OPEX" },
  { code: "6080", name: "Insurance", type: "EXPENSE", subtype: "OPEX" },
  { code: "6090", name: "Professional fees & licences", type: "EXPENSE", subtype: "OPEX" },
  { code: "6100", name: "Transport & fuel", type: "EXPENSE", subtype: "OPEX" },
  { code: "6110", name: "Stationery & printing", type: "EXPENSE", subtype: "OPEX" },
  { code: "6120", name: "Cleaning & security", type: "EXPENSE", subtype: "OPEX" },
  { code: "6130", name: "Software subscriptions", type: "EXPENSE", subtype: "OPEX" },
  { code: "6140", name: "Council rates & levies", type: "EXPENSE", subtype: "OPEX" },
  { code: "6150", name: "Depreciation", type: "EXPENSE", subtype: "OPEX" },
  { code: "6160", name: "Stock write-offs", type: "EXPENSE", subtype: "OPEX" },
  { code: "6190", name: "Sundry expenses", type: "EXPENSE", subtype: "OPEX" },
];

/** Inventory + cost-of-sales account per product category. */
export const INVENTORY_ACCOUNTS: Record<string, { inventory: string; cogs: string }> = {
  FRAME: { inventory: "1200", cogs: "5000" },
  LENS: { inventory: "1210", cogs: "5010" },
  CONTACT_LENS: { inventory: "1220", cogs: "5020" },
  ACCESSORY: { inventory: "1220", cogs: "5020" },
  CONSUMABLE: { inventory: "1230", cogs: "6060" },
};
