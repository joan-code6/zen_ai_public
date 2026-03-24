import React from "react";
import { X, Check, HelpCircle, FileText } from 'lucide-react';

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
}

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-success/10 border-success/30 text-success dark:text-success-foreground",
  error: "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive-foreground",
  warning: "bg-warning/10 border-warning/30 text-warning dark:text-warning-foreground",
  info: "bg-primary/10 border-primary/30 text-primary dark:text-primary-foreground"
};

const variantIcons = {
  success: <Check className="w-4 h-4" />,
  error: <X className="w-4 h-4" />,
  warning: <HelpCircle className="w-4 h-4" />,
  info: <FileText className="w-4 h-4" />
};

export default function Toast({ message, variant = "info", onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className={`fixed top-4 right-4 z-[var(--z-toast)] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-in slide-in-from-right-2 fade-in duration-200 ${variantStyles[variant]}`}
      role="alert"
      aria-live="polite"
    >
      {variantIcons[variant]}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-current/70 hover:text-current transition-colors ml-2" aria-label="Close notification">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
