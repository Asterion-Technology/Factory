"use client";

import { useState } from "react";
import { getChecklistTemplateLabel } from "@/lib/checklists";
import type { AssignmentChecklist, AssignmentChecklistItem, ChecklistTemplateType } from "@prisma/client";

type ChecklistWithItems = AssignmentChecklist & {
  items: AssignmentChecklistItem[];
};

export function ChecklistPanel({
  checklist,
  assignmentId,
}: {
  checklist: ChecklistWithItems;
  assignmentId: string;
}) {
  const [items, setItems] = useState(checklist.items);
  const [saving, setSaving] = useState<string | null>(null);

  const completed = items.filter((i) => i.completed).length;

  async function toggle(item: AssignmentChecklistItem) {
    setSaving(item.id);
    const next = !item.completed;

    try {
      const res = await fetch(
        `/api/assignments/${assignmentId}/checklist/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: next }),
        }
      );

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, completed: next } : i
          )
        );
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-700">
          {getChecklistTemplateLabel(checklist.templateType as ChecklistTemplateType)} Checklist
        </h2>
        <span className="text-xs text-slate-400">
          {completed}/{items.length} complete
        </span>
      </div>
      <ul className="divide-y divide-slate-100 px-4">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox"
              checked={item.completed}
              disabled={saving === item.id}
              onChange={() => toggle(item)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer disabled:opacity-50"
              aria-label={item.label}
            />
            <span
              className={`text-sm ${item.completed ? "line-through text-slate-400" : "text-slate-700"}`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
