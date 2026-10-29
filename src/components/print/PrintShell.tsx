import type { ReactNode } from "react";

interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  ntn: string;
}

/** A4 print layout with company letterhead. */
export function PrintShell({
  company,
  title,
  status,
  children,
}: {
  company: Company | null;
  title: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print flex justify-center gap-2 p-3">
        <button
          className="rounded-md bg-blue-900 px-4 py-2 text-sm text-white"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        <button className="rounded-md border px-4 py-2 text-sm" onClick={() => window.close()}>
          Close
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-10 text-gray-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b-2 border-blue-900 pb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-blue-900">
              {company?.name ?? "Turnkey Publishers"}
            </h1>
            <p className="text-xs">{company?.address}</p>
            <p className="text-xs">
              {[company?.phone, company?.email, company?.ntn ? `NTN ${company.ntn}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold uppercase tracking-wide">{title}</h2>
            {status && status !== "Approved" && (
              <p className="mt-1 inline-block rounded border-2 border-red-600 px-2 text-sm font-bold uppercase text-red-600">
                {status}
              </p>
            )}
          </div>
        </header>
        {children}
        <footer className="mt-10 border-t pt-2 text-center text-[10px] text-gray-500">
          Computer-generated document from MFAHH · Printed {new Date().toLocaleString()}
        </footer>
      </article>
    </div>
  );
}
