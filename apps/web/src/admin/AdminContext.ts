import { createContext, useContext } from "react";
import type { AdminApi } from "../api/admin";

export interface AdminContextValue {
  api: AdminApi;
  /** Writes an action result into the admin status region (UX-021). */
  announce: (message: string) => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminLayout");
  return value;
}
