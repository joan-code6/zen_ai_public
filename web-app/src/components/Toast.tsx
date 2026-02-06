import React from "react";
import { X, Check, HelpCircle, FileText } from 'lucide-react';

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
}

const variantStyles = {
  success: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
  error: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
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
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-in slide-in-from-right-2 fade-in duration-200 ${variantStyles[variant]}`}>
      {variantIcons[variant]}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-current/70 hover:text-current transition-colors ml-2">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
