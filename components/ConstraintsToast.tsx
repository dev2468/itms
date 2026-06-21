import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, X, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Props {
  toast: { message: string; type: ToastType } | null;
  onClose: () => void;
}

export const ConstraintsToast: React.FC<Props> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  const styles = {
    error: {
      bg: 'bg-red-50',
      border: 'border-red-500',
      text: 'text-red-800',
      icon: <AlertCircle className="w-6 h-6 text-red-600" />,
      title: 'Constraint Violation'
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-500',
      text: 'text-green-800',
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      title: 'Success'
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-500',
      text: 'text-amber-800',
      icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
      title: 'Notice'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-500',
      text: 'text-blue-800',
      icon: <Info className="w-6 h-6 text-blue-600" />,
      title: 'Info'
    }
  };

  const style = styles[toast.type];

  return (
    <div className="fixed bottom-5 right-5 z-[100] animate-bounce-in">
      <div className={`${style.bg} border-l-4 ${style.border} ${style.text} p-4 rounded shadow-xl flex items-center gap-3 pr-10 relative min-w-[300px]`}>
        {style.icon}
        <div>
          <p className="font-bold text-sm">{style.title}</p>
          <p className="text-sm opacity-90">{toast.message}</p>
        </div>
        <button 
            onClick={onClose}
            className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity"
        >
            <X size={16} />
        </button>
      </div>
    </div>
  );
};