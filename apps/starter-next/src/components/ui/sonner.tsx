"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        className: "border border-border bg-card text-card-foreground",
      }}
      {...props}
    />
  );
}