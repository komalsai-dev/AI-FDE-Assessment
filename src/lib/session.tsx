import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { runActionFn } from "./calibra.functions";
import { can, type Role } from "./roles";

type Session = { role: Role; actor: string; setRole: (r: Role) => void; setActor: (a: string) => void };
const Ctx = createContext<Session>({ role: "ADMIN", actor: "demo.admin", setRole: () => {}, setActor: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleS] = useState<Role>("ADMIN");
  const [actor, setActorS] = useState("demo.admin");
  useEffect(() => {
    const r = localStorage.getItem("calibra.role") as Role | null;
    const a = localStorage.getItem("calibra.actor");
    if (r) setRoleS(r);
    if (a) setActorS(a);
  }, []);
  const setRole = (r: Role) => { setRoleS(r); localStorage.setItem("calibra.role", r); };
  const setActor = (a: string) => { setActorS(a); localStorage.setItem("calibra.actor", a); };
  return <Ctx.Provider value={{ role, actor, setRole, setActor }}>{children}</Ctx.Provider>;
}
export const useSession = () => useContext(Ctx);

/** Run a persisted, audited server action. Errors are shown, never swallowed. */
export function useAction() {
  const fn = useServerFn(runActionFn);
  const qc = useQueryClient();
  const { role, actor } = useSession();
  const pending = useRef(new Map<string, { requestId: string; promise?: Promise<unknown> }>());
  return {
    can: (action: string) => can(role, action),
    run: async <T = Record<string, unknown>,>(action: string, payload: Record<string, unknown>, success?: string): Promise<T | null> => {
      const key = JSON.stringify({ action, payload, role, actor });
      const previous = pending.current.get(key);
      if (previous?.promise) return previous.promise as Promise<T>;
      const entry = previous ?? { requestId: crypto.randomUUID() };
      const promise = (async () => {
        const res = await fn({ data: { action, payload, role, actor, requestId: entry.requestId } });
        if (!res.ok) { pending.current.delete(key); toast.error(res.error); throw new Error(res.error); }
        pending.current.delete(key);
        await qc.invalidateQueries();
        if (success) toast.success(success);
        return res.result as T;
      })();
      entry.promise = promise;
      pending.current.set(key, entry);
      try { return await promise; } finally { entry.promise = undefined; }
    },
  };
}
