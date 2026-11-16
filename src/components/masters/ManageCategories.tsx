import { useState } from "react";
import { Check, Pencil, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectField } from "@/components/shared/Field";
import { useAction, useApi } from "@/lib/api";
import { listCategories, saveCategory, setCategoryStatus } from "@/server/functions/masters";
import { CATEGORY_KINDS, type CategoryKind } from "@/shared/masters";

type Category = { id: string; name: string; status: string; records: number };

/** Add, rename and (de)activate the category lists a master page uses. */
export function ManageCategories({
  kinds,
  onClose,
}: {
  kinds: CategoryKind[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CategoryKind>(kinds[0]!);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const q = useApi(["categories", kind], () => listCategories({ data: { kind } }));
  const save = useAction(
    (v: { id?: string; name: string }) => saveCategory({ data: { kind, ...v } }),
    "Category saved",
  );
  const toggle = useAction(
    (c: Category) => setCategoryStatus({ data: { kind, id: c.id, active: c.status !== "Active" } }),
    "Category updated",
  );

  const add = () => {
    if (!name.trim()) return;
    save.mutate({ name: name.trim() }, { onSuccess: () => setName("") });
  };
  const rename = () => {
    if (!editing?.name.trim()) return;
    save.mutate(
      { id: editing.id, name: editing.name.trim() },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>
        {kinds.length > 1 && (
          <SelectField
            label="List"
            value={kind}
            options={kinds.map((k) => ({ value: k, label: CATEGORY_KINDS[k] }))}
            onChange={(v) => {
              setKind(v as CategoryKind);
              setEditing(null);
            }}
          />
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            aria-label="New category"
            placeholder="New category"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            Add
          </Button>
        </form>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {q.isLoading && <li className="p-3 text-sm text-muted-foreground">Loading…</li>}
          {(q.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename();
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="Category name"
                    maxLength={100}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  />
                  <Button type="submit" size="icon" variant="ghost" aria-label="Save name">
                    <Check className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel rename"
                    onClick={() => setEditing(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span
                    className={`flex-1 ${c.status === "Active" ? "" : "text-muted-foreground line-through"}`}
                  >
                    {c.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {c.records} record{c.records === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Rename"
                    aria-label={`Rename ${c.name}`}
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={c.status === "Active" ? "Deactivate" : "Activate"}
                    aria-label={`${c.status === "Active" ? "Deactivate" : "Activate"} ${c.name}`}
                    onClick={() => toggle.mutate(c)}
                  >
                    <Power
                      className={`size-4 ${c.status === "Active" ? "text-destructive" : "text-success"}`}
                    />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Renaming updates every record that uses the category. Inactive categories stay on old
          records but cannot be chosen for new ones.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
