const MAP_BG = `url(${import.meta.env.BASE_URL}map-bg.webp)`;

const OVERLAYS = [
    'linear-gradient(180deg, rgba(13,14,15,0.55) 0%, rgba(13,14,15,0.32) 35%, rgba(13,14,15,0.72) 72%, rgba(13,14,15,0.94) 100%)',
    'radial-gradient(120% 85% at 50% 42%, transparent 45%, rgba(13,14,15,0.5) 100%)',
].join(', ');

/**
 * Ambient map backdrop: the image's right half (inverted) fills the left
 * screen half, the image's left half (uninverted) fills the right screen half.
 * Gradient overlays keep content readable.
 */
export function MapBackground() {
    return (
        <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10"
            style={{ filter: 'blur(4px) brightness(0.72) saturate(0.85)' }}
        >
            <div
                className="absolute left-0 top-0 h-full w-1/2"
                style={{
                    backgroundImage: MAP_BG,
                    backgroundSize: 'cover',
                    backgroundPosition: 'right center',
                    transform: 'scaleX(-1)',
                }}
            />
            <div
                className="absolute right-0 top-0 h-full w-1/2"
                style={{
                    backgroundImage: MAP_BG,
                    backgroundSize: 'cover',
                    backgroundPosition: 'left center',
                }}
            />
            <div className="absolute inset-0" style={{ backgroundImage: OVERLAYS }} />
        </div>
    );
}
