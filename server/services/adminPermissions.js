const rolePermissions = {
  owner: [
    "orders:read",
    "orders:write",
    "catalog:read",
    "catalog:write",
    "audit:read",
    "backup:download",
    "admins:manage",
  ],
  orders: ["orders:read", "orders:write", "audit:read"],
  catalog: ["catalog:read", "catalog:write", "audit:read"],
  viewer: ["orders:read", "catalog:read", "audit:read"],
};

export function getAdminPermissions(role) {
  return rolePermissions[role] ?? [];
}
