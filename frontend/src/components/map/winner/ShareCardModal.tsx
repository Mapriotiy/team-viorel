import { useEffect, useState } from "react";
import { Copy, Download, X } from "lucide-react";
import { generateShareCard, type ShareCardData } from "../../../utils/shareCard";

type ShareCardModalProps = {
    data: ShareCardData;
    replayUrl: string;
    onClose: () => void;
};

export function ShareCardModal({ data, replayUrl, onClose }: ShareCardModalProps) {
    const [cardUrl, setCardUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setCardUrl(null);

        const timeoutId = window.setTimeout(() => {
            void generateShareCard(data).then((url) => {
                if (!cancelled) setCardUrl(url);
            });
        }, 80);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [data]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(replayUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#202020] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#3a3a3a] px-4 py-2.5">
                    <p className="text-sm font-semibold text-[#eff1f6]">Share</p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#8a8a8a] transition hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>
                {cardUrl ? (
                    <img src={cardUrl} alt="Share card" className="block w-full" />
                ) : (
                    <div className="flex h-72 items-center justify-center text-sm text-[#8a8a8a]">
                        Generating...
                    </div>
                )}
                <div className="flex flex-col gap-2 p-4">
                    <a
                        href={cardUrl ?? undefined}
                        download="cinnamon-code-share.png"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#c86f3c] px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d9823f] disabled:opacity-50"
                    >
                        <Download size={16} />
                        Download image
                    </a>
                    <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-4 py-2.5 text-sm font-semibold text-[#d7d7d7] transition hover:border-[#c86f3c]/60 hover:text-[#d89a4e]"
                    >
                        <Copy size={16} />
                        {copied ? "Replay link copied!" : "Copy replay link"}
                    </button>
                </div>
            </div>
        </div>
    );
}
