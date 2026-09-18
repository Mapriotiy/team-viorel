import type { Region } from '../../mapRegions';

export function LegendItem({
    region,
    onHover,
}: {
    region: Region;
    onHover: (provinces: string[] | null) => void;
}) {
    return (
        <li
            onMouseEnter={() => onHover(region.provinces)}
            onMouseLeave={() => onHover(null)}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-3 py-2.5 text-sm transition hover:border-white/30 hover:bg-[#2a2a2a]"
        >
            <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: region.color }}
            />
            <span className="text-[#eff1f6]">{region.name}</span>
        </li>
    );
}

export function MapLegend({
    regions,
    onHover,
    className,
}: {
    regions: Region[];
    onHover: (provinces: string[] | null) => void;
    className: string;
}) {
    return (
        <ul className={className}>
            {regions.map((region) => (
                <LegendItem key={region.id} region={region} onHover={onHover} />
            ))}
        </ul>
    );
}
