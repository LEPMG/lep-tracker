export type Role = "FIELD" | "ADMIN" | "MGMT_RW" | "MGMT_RO";

export const ROLE_LABELS: Record<Role, string> = {
  FIELD: "Field / Pumper",
  ADMIN: "Office / Admin",
  MGMT_RW: "Management (read-write)",
  MGMT_RO: "Management (view-only)",
};

// Can this role create/edit records at all? (view-only management cannot)
export function canWrite(role: Role): boolean {
  return role === "ADMIN" || role === "MGMT_RW" || role === "FIELD";
}

// Full write across every module incl. admin-only things like production setup,
// tanks, wells master data, costs.
export function canManage(role: Role): boolean {
  return role === "ADMIN" || role === "MGMT_RW";
}

// Only admins manage users and system settings.
export function canAdminUsers(role: Role): boolean {
  return role === "ADMIN";
}

// Field users have a narrower write scope: they log gauges, report/resolve
// downtime, and update action items — but don't manage master data or costs.
export function isField(role: Role): boolean {
  return role === "FIELD";
}
