import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

type Toast = {
    id: number;
    kind: ToastKind;
    message: string;
};

type ToastApi = {
    push: (kind: ToastKind, message: string) => void;
};

const ToastContext = createContext<ToastApi>({ push: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
    return useContext(ToastContext);
}

let nextId = 1;

const STYLES: Record<ToastKind, string> = {
    success: "border-[#2bff88]/40 bg-[#10241a]/95 text-[#7ef7bb]",
    error: "border-red-500/40 bg-[#2a1212]/95 text-red-200",
    info: "border-[#00d9ff]/40 bg-[#0f2126]/95 text-[#bfeefb]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = useCallback((kind: ToastKind, message: string) => {
        const id = nextId++;
        setToasts((prev) => [...prev, { id, kind, message }]);
        window.setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 3500);
    }, []);

    return (
        <ToastContext.Provider value={{ push }}>
            {children}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-xs flex-col gap-2">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`toast-in pointer-events-auto rounded-lg border px-3 py-2.5 text-sm shadow-2xl backdrop-blur ${STYLES[toast.kind]}`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
