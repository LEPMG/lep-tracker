"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/downtime", label: "Down Wells", icon: "▼" },
  { href: "/workorders", label: "Work Orders", icon: "✎" },
  { href: "/production", label: "Production", icon: "▮" },
  { href: "/vendors", label: "Vendors & Costs", icon: "$" },
  { href: "/wells", label: "Wells & Batteries", icon: "◉" },
];

export default function Nav({
  user,
}: {
  user: { name: string; role: Role; email: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isAdmin = user.role === "ADMIN";
  const links = isAdmin
    ? [...LINKS, { href: "/admin/users", label: "Users", icon: "◧" }]
    : LINKS;

  return (
    <>
      {/* top bar (mobile) */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            LEP
          </div>
          <span className="font-bold">LEP Tracker</span>
        </div>
        <button className="btn-ghost" onClick={() => setOpen(!open)}>
          Menu
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full shrink-0 border-r border-slate-200 bg-white md:block md:w-60`}
      >
        <div className="hidden items-center gap-2 px-5 py-5 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            LEP
          </div>
          <div>
            <div className="font-bold leading-tight">LEP Tracker</div>
            <div className="text-xs text-slate-400">Field Ops</div>
          </div>
        </div>
        <nav className="px-3 pb-4">
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="w-4 text-center text-slate-400">{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-200 px-4 py-4">
          <div className="text-sm font-semibold text-slate-800">
            {user.name}
          </div>
          <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
          <form action="/api/logout" method="post" className="mt-3">
            <button className="btn-ghost w-full text-xs">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
