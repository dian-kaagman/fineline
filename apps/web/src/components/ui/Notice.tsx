import type { ReactNode, Ref } from "react";
import { Icon } from "./Icon";

export type NoticeTone = "info" | "success" | "warning" | "danger";

interface NoticeProps {
  tone: NoticeTone;
  children: ReactNode;
  /** `alert` for errors that need attention now; omit for static notices. */
  role?: "alert" | "status";
  /** Notices that receive focus (errors, sold out, expired) get tabIndex -1. */
  focusable?: boolean;
  actions?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  id?: string;
}

/** A notice in the tone's colours with an icon, so meaning never rests on colour alone (UX-011). */
export function Notice({ tone, children, role, focusable, actions, ref, id }: NoticeProps) {
  return (
    <div
      ref={ref}
      id={id}
      className={`notice notice--${tone}`}
      role={role}
      tabIndex={focusable ? -1 : undefined}
    >
      <Icon name={tone} />
      <div className="notice__body">
        {children}
        {actions && <div className="notice__actions">{actions}</div>}
      </div>
    </div>
  );
}
