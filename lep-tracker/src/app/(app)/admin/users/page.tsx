import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAdminUsers, ROLE_LABELS, type Role } from "@/lib/permissions";
import { PageHeader, Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { createUser, updateUser, resetPassword } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["FIELD", "ADMIN", "MGMT_RW", "MGMT_RO"];

export default async function UsersPage() {
  const me = await getSessionUser();
  if (!canAdminUsers(me!.role)) redirect("/");

  const users = await query<any>(
    `select id, email, name, role, active, created_at from users order by name`
  );

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage who can log in and what they can do."
        action={
          <details className="relative">
            <summary className="btn-primary cursor-pointer list-none">
              + Add User
            </summary>
            <form
              action={createUser}
              className="card absolute right-0 z-20 mt-2 w-80 space-y-3 p-4"
            >
              <div>
                <label className="label">Name *</label>
                <input name="name" className="input" required />
              </div>
              <div>
                <label className="label">Email *</label>
                <input name="email" type="email" className="input" required />
              </div>
              <div>
                <label className="label">Temp password *</label>
                <input name="password" className="input" required />
              </div>
              <div>
                <label className="label">Role</label>
                <select name="role" className="input">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn-primary w-full">Create user</button>
            </form>
          </details>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Active</th>
              <th className="th">Update</th>
              <th className="th">Reset password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  <Badge value={u.role} />
                </td>
                <td className="td">
                  {u.active ? (
                    <span className="text-emerald-600">●</span>
                  ) : (
                    <span className="text-slate-300">●</span>
                  )}
                </td>
                <td className="td">
                  <form action={updateUser} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="input !py-1 !text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={u.active}
                      />
                      on
                    </label>
                    <button className="btn-ghost !py-1 !text-xs">Save</button>
                  </form>
                </td>
                <td className="td">
                  <form action={resetPassword} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="password"
                      placeholder="new password"
                      className="input !py-1 !text-xs"
                    />
                    <button className="btn-ghost !py-1 !text-xs">Reset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
