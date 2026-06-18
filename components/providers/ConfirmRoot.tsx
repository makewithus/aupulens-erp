"use client";

import { AlertModal } from "@/components/ui/alert-modal";
import { useEffect, useState } from "react";

type ConfirmOptions = {
  title?: string;
  description?: string;
};

type ConfirmEvent = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmListener = (event: ConfirmEvent) => void;

let listener: ConfirmListener | null = null;

export const confirmDialog = (options: ConfirmOptions): Promise<boolean> => {
  if (!listener) {
    console.warn("ConfirmRoot is not mounted");
    return Promise.resolve(window.confirm(options.title || "Are you sure?"));
  }
  return new Promise((resolve) => {
    listener!({ ...options, resolve });
  });
};

export default function ConfirmRoot({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [resolvePromise, setResolvePromise] = useState<(value: boolean) => void>();

  useEffect(() => {
    listener = (event) => {
      setOptions({ title: event.title, description: event.description });
      setResolvePromise(() => event.resolve);
      setIsOpen(true);
    };
    return () => {
      listener = null;
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(false);
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(true);
  };

  return (
    <>
      {children}
      <AlertModal
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        loading={false}
        title={options.title || "Are you sure?"}
        description={options.description || "This action cannot be undone."}
      />
    </>
  );
}
