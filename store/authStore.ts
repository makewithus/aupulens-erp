import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { signOut } from "next-auth/react";
import { useTenantStore } from "./useTenantStore";
import { useThemeStore } from "./themeStore";
import { EntityStatus } from "@/lib/constants/statuses";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role:
    | "admin"
    | "finance"
    | "hr"
    | "sales"
    | "inventory"
    | "project"
    | "manufacturing"
    | "master-admin";
  tenantId: string;
  department?: string;
  employeeId?: string;
  designation?: string;
  profilePic?: string;
  dateOfJoining?: string;
  status: EntityStatus;
  permissions?: string[];
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  checkSession: (force?: boolean) => Promise<void>;
}

export const clearAllStores = () => {
  console.log("[AuthStore] clearing all stores, localStorage and cookies");

  // 1. Reset Zustand Stores
  useAuthStore.getState().setUser(null);
  useTenantStore.getState().setTenantId(null);
  useThemeStore.getState().setTheme("dark");

  // 2. Wipe Storage
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("auth-storage");
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error("[AuthStore] Error clearing storage:", e);
    }

    // 3. Clear Cookies
    const cookies = document.cookie.split(";");
    const domain = window.location.hostname;
    const baseDomain = domain.split(".").slice(-2).join(".");

    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (!cookie) continue;
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      const expireStr =
        "expires=Thu, 01 Jan 1970 00:00:00 GMT;Secure;SameSite=Lax";

      if (
        name.includes("session") ||
        name.includes("auth") ||
        name.includes("token") ||
        name.includes("callback") ||
        name.includes("_csrf")
      ) {
        document.cookie = `${name}=;${expireStr};path=/`;
        document.cookie = `${name}=;${expireStr};path=/;domain=${domain}`;
        document.cookie = `${name}=;${expireStr};path=/;domain=.${domain}`;
        document.cookie = `${name}=;${expireStr};path=/;domain=${baseDomain}`;
        document.cookie = `${name}=;${expireStr};path=/;domain=.${baseDomain}`;
      }
    }
  }
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      logout: async () => {
        clearAllStores();
      },
      checkSession: async (force = false) => {
        const { user } = get();
        if (user && !force) return; // If user exists in store, don't fetch unless forced

        set({ isLoading: true });
        try {
          // Only fetch if missing
          const res = await fetch("/api/auth/session");
          if (res.ok) {
            const session = await res.json();
            console.log(
              "[AuthStore] session check result:",
              session?.user ? "Authenticated" : "Unauthenticated",
            );
            if (session?.user) {
              const sessionTenantId = session.user.tenantId || "default-tenant";
              const currentTenantId = useTenantStore.getState().tenantId;

              // Logout if tenant IDs don't match
              if (
                currentTenantId &&
                sessionTenantId !== currentTenantId &&
                sessionTenantId !== "default" &&
                currentTenantId !== "default-tenant"
              ) {
                console.warn(
                  `Tenant mismatch: Session(${sessionTenantId}) vs Store(${currentTenantId}). Logging out.`,
                );
                clearAllStores();
                signOut({ callbackUrl: "/auth/admin" });
                return;
              }

              // The API returns 'user', we set it.
              set({ user: session.user as User });
            }
          }
        } catch (error) {
          console.error("Session fetch failed", error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }), // Don't persist isLoading
      version: 1,
      migrate: (persistedState: any, version: number) => {
        return persistedState as AuthStore;
      },
    },
  ),
);
