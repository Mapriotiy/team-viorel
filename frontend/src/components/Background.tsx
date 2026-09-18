import { MapBackground } from "./MapBackground";

/** Global dark base with the ambient mirrored map backdrop behind every screen. */
export function Background() {
    return (
        <>
            <div className="fixed inset-0 -z-10 bg-[#0d0e0f]" />
            <MapBackground />
        </>
    );
}
