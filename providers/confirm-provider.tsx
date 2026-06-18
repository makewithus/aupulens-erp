"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { AlertModal } from "@/components/ui/alert-modal";

type ConfirmOptions = {
  title?: string;
  description?: string;
};

type ConfirmContextType = {
  confirm: (options?: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [resolvePromise, setResolvePromise] = useState<(value: boolean) => void>();

  const confirm = (opts?: ConfirmOptions) => {
    setOptions(opts || {});
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve);
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(false);
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(true);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertModal
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        loading={false}
        title={options.title || "Are you sure?"}
        description={options.description || "This action cannot be undone."}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context;
};
