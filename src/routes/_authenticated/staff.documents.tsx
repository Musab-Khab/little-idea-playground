import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Eye, Archive } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Field, SelectField } from "@/components/shared/Field";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction, useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import {
  archiveStaffDocument,
  listStaffDocuments,
  uploadStaffDocument,
} from "@/server/functions/hr";
import { STAFF_DOCUMENT_TYPES } from "@/shared/masters";

export const Route = createFileRoute("/_authenticated/staff/documents")({
  head: () => ({ meta: [{ title: "Staff Documents – MFAHH" }] }),
  component: DocumentsPage,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

function toBase64(file: File) {
  return new Promise<string>((ok, fail) => {
    const reader = new FileReader();
    reader.onload = () => ok(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => fail(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function DocumentsPage() {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const q = useApi(["staff-docs"], () => listStaffDocuments());
  const [staffId, setStaffId] = useState("");
  const [type, setType] = useState<(typeof STAFF_DOCUMENT_TYPES)[number]>("CNIC Copy");
  const [file, setFile] = useState<File | null>(null);
  const upload = useAction(async () => {
    if (!file) throw new Error("Choose a file.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Files must be 5 MB or smaller.");
    return uploadStaffDocument({
      data: { staffId, type, fileName: file.name, base64: await toBase64(file) },
    });
  }, "Document uploaded");
  const archive = useAction(
    (id: string) => archiveStaffDocument({ data: { id } }),
    "Document archived",
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Staff Documents" crumbs={["Home", "Staff & HR", "Documents"]} />
      {can("staff.manage") && (
        <section className="card-surface flex flex-wrap items-end gap-3 p-4">
          <Field label="Employee" className="w-72">
            <SearchSelect
              options={(lk?.staff ?? []).map((x) => ({ value: x.id, label: x.name, hint: x.code }))}
              value={staffId}
              onChange={setStaffId}
            />
          </Field>
          <SelectField
            label="Document type"
            className="w-52"
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={STAFF_DOCUMENT_TYPES}
          />
          <Field label="File (PDF, JPG or PNG, max 5 MB)">
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            disabled={!staffId || !file || upload.isPending}
            onClick={() => upload.mutate(undefined, { onSuccess: () => setFile(null) })}
          >
            <Upload />
            Upload
          </Button>
        </section>
      )}
      <section className="card-surface p-4">
        <DataTable
          rows={q.data ?? []}
          exportName="staff-documents"
          columns={[
            { key: "staff", header: "Employee", value: (r) => `${s(r, "empId")} ${s(r, "staff")}` },
            { key: "type", header: "Type", value: (r) => s(r, "type") },
            { key: "fileName", header: "File", value: (r) => s(r, "fileName") },
            {
              key: "size",
              header: "Size",
              value: (r) => Number(r["size"]),
              render: (r) => `${Math.ceil(Number(r["size"]) / 1024)} KB`,
              align: "right",
            },
            {
              key: "uploadedAt",
              header: "Uploaded",
              value: (r) => s(r, "uploadedAt"),
              render: (r) => formatDateTime(s(r, "uploadedAt")),
            },
            {
              key: "status",
              header: "Status",
              value: (r) => s(r, "status"),
              render: (r) => <StatusBadge status={s(r, "status")} />,
            },
            {
              key: "actions",
              header: "Actions",
              value: () => "",
              render: (r) => (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Open"
                    aria-label="Open document"
                    asChild
                  >
                    <a
                      href={`/api/files/staff-document/${s(r, "id")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye className="size-4" />
                    </a>
                  </Button>
                  {can("staff.manage") && r["status"] === "Active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Archive"
                      aria-label="Archive"
                      onClick={() => archive.mutate(s(r, "id"))}
                    >
                      <Archive className="size-4" />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
