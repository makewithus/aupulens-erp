import { create } from "zustand";
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

  // 1. Reset Zustand Stores
  useAuthStore.getState().setUser(null);
  useTenantStore.getState().setTenantId(null);
  useThemeStore.getState().setTheme("dark");

  // 2. Wipe Storage (localStorage + sessionStorage)
  if (typeof window !== "undefined") {
    try {
      // Remove all known auth/session keys (including legacy persist key)
      const AUTH_KEYS = [
        "auth-storage",
        "tenant-storage",
        "theme-storage",
        "next-auth.session-token",
        "next-auth.csrf-token",
        "next-auth.callback-url",
      ];
      AUTH_KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
        try { sessionStorage.removeItem(k); } catch (_) {}
      });
      // Belt-and-suspenders: wipe everything
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}
    } catch (e) {
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
  (set, get) => ({
    user: null,
    isLoading: false,
    setUser: (user) => set({ user }),
    logout: async () => {
      clearAllStores();
    },
    checkSession: async (force = false) => {
      const { user } = get();
      if (user && !force) return;

      set({ isLoading: true });
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          if (session?.user) {
            const sessionTenantId = session.user.tenantId || "default-tenant";
            const currentTenantId = useTenantStore.getState().tenantId;

            if (
              currentTenantId &&
              sessionTenantId !== currentTenantId &&
              sessionTenantId !== "default" &&
              currentTenantId !== "default-tenant"
            ) {
              clearAllStores();
              signOut({ callbackUrl: "/auth" });
              return;
            }

            set({ user: session.user as User });
          } else {
            set({ user: null });
          }
        } else {
          set({ user: null });
        }
      } catch {
        set({ user: null });
      } finally {
        set({ isLoading: false });
      }
    },
  }),
);
