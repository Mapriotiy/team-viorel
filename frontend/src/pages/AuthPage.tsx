import { useGoogleLogin } from "./auth/useGoogleLogin";
import { GoogleButton } from "./auth/GoogleButton";

type AuthPageProps = {
    initialError?: string | null;
    onClearError?: () => void;
};

export function AuthPage({ initialError = null, onClearError }: AuthPageProps) {
    const { errorMessage, isRedirecting, onLogin } = useGoogleLogin(initialError, onClearError);

    return (
        <main
            className="min-h-screen text-[#eff1f6]"
            style={{
                background:
                    "linear-gradient(180deg, #1a1614 0%, #12100d 55%, #0f0d0b 100%)",
            }}
        >
            <header className="sticky top-0 z-40 border-b border-[#2e2a26] bg-[#12100d]/90 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
                    <span className="text-lg font-black tracking-tight text-[#e6a15d]">
                        Streak<span className="text-[#eff1f6]">Map</span>
                    </span>
                    <GoogleButton
                        onLogin={onLogin}
                        isRedirecting={isRedirecting}
                        className="!w-auto !px-4 !py-2"
                    />
                </div>
            </header>

            <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-20">
                <div className="max-w-2xl">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#5a4235] bg-[#211a16] px-3 py-1 text-xs font-semibold text-[#e8b691]">
                        Free — play with friends
                    </span>
                    <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                        Solve LeetCode.
                        <br />
                        <span className="text-[#e6a15d]">Capture the map.</span>
                    </h1>
                    <p className="mt-5 max-w-md text-base leading-relaxed text-[#9d8f80]">
                        Turn your daily grind into a live territory battle. Plant flags, steal provinces,
                        and keep a streak that never lets you quit.
                    </p>
                    <div className="mt-8 max-w-sm">
                        <GoogleButton
                            onLogin={onLogin}
                            isRedirecting={isRedirecting}
                            className="!py-3.5"
                        />
                        {errorMessage ? (
                            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {errorMessage}
                            </p>
                        ) : null}
                    </div>
                    <p className="mt-6 text-xs text-[#6b5f54]">
                        An independent project, not affiliated with LeetCode.
                    </p>
                </div>
            </section>
        </main>
    );
}