import { type ReactNode } from 'react';

type ConfirmDialogProps = {
    title: string;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export function ConfirmDialog({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <section className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 text-white shadow-xl shadow-black/30">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                {message ? (
                    <div className="mt-2 text-sm text-[#b3b3b3]">{message}</div>
                ) : null}
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="rounded-md border border-[#4a4a4a] bg-[#333333] px-4 py-2 text-sm text-[#d7d7d7] transition hover:bg-[#3d3d3d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            danger
                                ? 'bg-red-500/90 text-white hover:bg-red-500'
                                : 'bg-[#c86f3c] text-[#111111] hover:bg-[#d9823f]'
                        }`}
                    >
                        {busy ? 'Please wait...' : confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}
