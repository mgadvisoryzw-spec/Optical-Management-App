import { Trash2 } from "lucide-react";
import { deleteRecordAction, type DeletableKind } from "@/app/app/record-actions";
import { ConfirmButton } from "./client";
import { cn } from "@/lib/utils";

/** A confirm-then-delete button. Render it only for users with the "delete" permission. */
export function DeleteButton({
  kind,
  id,
  back,
  confirm,
  label = "Delete",
  compact,
  className,
}: {
  kind: DeletableKind;
  id: string;
  back: string;
  confirm: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <form action={deleteRecordAction.bind(null, kind, id)} className={cn("inline-block", className)}>
      <input type="hidden" name="back" value={back} />
      <ConfirmButton variant="ghost" message={confirm} className={cn("text-rose-600 hover:bg-rose-50 hover:text-rose-700", compact && "px-2 py-1 text-xs")}>
        <Trash2 size={compact ? 13 : 15} /> {label}
      </ConfirmButton>
    </form>
  );
}
