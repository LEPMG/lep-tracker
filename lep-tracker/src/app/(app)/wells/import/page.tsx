import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { importData } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: { imported?: string; err?: string };
}) {
  const user = await getSessionUser();
  if (!canManage(user!.role)) redirect("/wells");

  const imported = searchParams.imported?.split("-").map(Number);

  return (
    <div>
      <Link href="/wells" className="text-sm text-brand-700">
        ← Wells &amp; Batteries
      </Link>
      <PageHeader
        title="Bulk Import"
        subtitle="Load all your batteries, tanks, and wells at once from spreadsheets (CSV)."
      />

      {imported && (
        <div className="card mb-6 border-l-4 border-l-emerald-500 p-4">
          <div className="font-semibold text-emerald-700">Import complete</div>
          <div className="text-sm text-slate-600">
            Added {imported[0]} batteries, {imported[1]} tanks, {imported[2]}{" "}
            wells.
          </div>
          {searchParams.err && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Some rows were skipped: {searchParams.err}
            </div>
          )}
        </div>
      )}

      <div className="card mb-6 p-4 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">How it works</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Export your wells from Excel/Sheets as <b>CSV</b> (File → Save As /
            Download → CSV).
          </li>
          <li>
            Match the column names below (order doesn&apos;t matter, extra
            columns are ignored). Download a template to start from.
          </li>
          <li>
            Upload whichever files you have and click <b>Import</b>. You can run
            it again anytime — batteries are matched by name, wells by API #, so
            re-importing updates instead of duplicating.
          </li>
        </ol>
      </div>

      <form action={importData} className="space-y-6">
        <ImportBlock
          title="1 · Batteries"
          name="batteries"
          template="/templates/batteries.csv"
          columns="name, code, field, county, state"
          note="Create these first — tanks and wells attach to them by name."
        />
        <ImportBlock
          title="2 · Tanks"
          name="tanks"
          template="/templates/tanks.csv"
          columns="battery, tank, type (OIL/WATER/GAS_COND), size_bbls, bbls_per_inch"
          note="'battery' must match a battery name. bbls_per_inch is required — it's what converts gauges to barrels."
        />
        <ImportBlock
          title="3 · Wells"
          name="wells"
          template="/templates/wells.csv"
          columns="well, api_number, battery, field, county, state, status, test_oil_bopd, test_water_bwpd, test_gas_mcfd, test_date"
          note="'state'/'field' power the filters. test_oil_bopd / test_water_bwpd / test_gas_mcfd are the well-test rates — the oil rate auto-fills the Est. BOPD loss when a well is reported down."
        />

        <div className="flex items-center gap-3">
          <button className="btn-primary">Import</button>
          <span className="text-xs text-slate-400">
            Upload any combination — you don&apos;t need all three at once.
          </span>
        </div>
      </form>
    </div>
  );
}

function ImportBlock({
  title,
  name,
  template,
  columns,
  note,
}: {
  title: string;
  name: string;
  template: string;
  columns: string;
  note: string;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <a
          href={template}
          download
          className="text-xs font-medium text-brand-700"
        >
          ↓ Download template
        </a>
      </div>
      <p className="mb-1 text-xs text-slate-500">
        Columns: <code className="text-slate-700">{columns}</code>
      </p>
      <p className="mb-3 text-xs text-slate-400">{note}</p>
      <input
        type="file"
        name={name}
        accept=".csv,text/csv"
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
      />
    </div>
  );
}
