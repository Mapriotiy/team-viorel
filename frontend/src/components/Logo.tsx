type LogoProps = {
    className?: string;
    iconClassName?: string;
    textClassName?: string;
    showText?: boolean;
};

export function Logo({
    className = "",
    iconClassName = "",
    textClassName = "",
    showText = true,
}: LogoProps) {
    return (
        <span
            className={`inline-flex items-center gap-[0.58em] leading-none ${className}`}
            aria-label="Cinnamon Code"
        >
            <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt=""
                className={`h-[2.45em] w-auto shrink-0 object-contain ${iconClassName}`}
            />
            {showText ? (
                <span
                    className={`brand-wordmark whitespace-nowrap text-[1em] font-bold text-[#f2eee9] ${textClassName}`}
                >
                    cinnamon<span className="text-[#df6a24]">.</span>code
                </span>
            ) : null}
        </span>
    );
}
