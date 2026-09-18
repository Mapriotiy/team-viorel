// Single source of truth for every map-related color: topic/region colors,
// player & faction colors, capture tints, marker/hover mixing and the
// share-card sea. Kept in one place so the admin panel can later override
// them per-environment, and the backend draft generator can be fed from the
// same values (see backend/app/services/map_config.py).

export const mapColors = {
    // Topic/region colors, keyed by the stable ids used in drafts, presets
    // and the DB.
    regions: {
        isle1: "#2fb55f",
        isle2: "#4b6cb7",
        isle3: "#c7429b",
        region1: "#7ac142",
        region2: "#5b6cf0",
        region3: "#f2994a",
        region4: "#eb5757",
        region5: "#c86f3c",
        region6: "#00b5ad",
        region7: "#e0a83b",
    },

    // Used when a region has no assigned color.
    regionFallback: "#8f7458",

    // Cycled through when a generated map needs more colors than the regions above.
    regionFallbackColors: [
        "#c86f3c",
        "#4b6cb7",
        "#eb5757",
        "#27ae60",
        "#9b51e0",
        "#c7429b",
        "#00b5ad",
        "#f2994a",
        "#7ac142",
        "#5b6cf0",
        "#f2c94c",
        "#e85d9a",
    ],

    // Sides.
    player: "#2f80ed",
    enemy: "#eb5757",
    neutral: "#666666",
    unknownOwner: "#888888",
    markerNeutral: "#9d9487",

    // Faction seat colors (free-for-all seats and team colors).
    factions: ["#2f80ed", "#eb5757", "#f2994a", "#27ae60"],

    // Named options shown when creating a lobby with factions.
    factionPalette: [
        { name: "Ocean", color: "#2f80ed" },
        { name: "Ember", color: "#eb5757" },
        { name: "Amber", color: "#f2994a" },
        { name: "Meadow", color: "#27ae60" },
        { name: "Violet", color: "#9b51e0" },
        { name: "Blossom", color: "#c7429b" },
        { name: "Cinnamon", color: "#c86f3c" },
        { name: "Teal", color: "#00b5ad" },
    ],

    // Problem difficulty accents.
    difficulty: {
        Easy: "#00b8a3",
        Medium: "#ffc01e",
        Hard: "#ff375f",
    },

    // Uncaptured province body/outline (region color mixed toward these shades
    // and drawn at fillAlpha — tuned so saturated colors read clearly without
    // turning the map into flat opaque blobs).
    province: {
        fillShade: "#242827",
        fillWeight: 0.4,
        fillAlpha: 0.7,
        strokeShade: "#303332",
        strokeWeight: 0.7,
    },

    // Captured province fill/outline tints.
    capture: {
        fillShade: "#272323",
        fillWeight: 0.72,
        fillAlpha: 0.68,
        strokeShade: "#3a2528",
        strokeWeight: 0.72,
    },

    // Castle/flag markers on the map.
    marker: {
        neutral: "#9d9487",
        mixTarget: "#fff0cc",
        mixWeight: 0.64,
        castle: "#efa35f",
    },

    // Province hover highlight.
    hover: {
        fillTarget: "#f7d7ad",
        fillWeight: 0.72,
        strokeTarget: "#ffb45f",
        strokeWeight: 0.45,
    },

    // Share-card sea gradient.
    sea: {
        from: "#15191b",
        to: "#0b0c0d",
        fallback: "#101415",
    },

    // Landing/auth-page demo map accents.
    landing: {
        players: ["#e6a15d", "#b86a3c", "#7f9a6e"],
        enemy: "#8c6170",
        accents: ["#e6a15d", "#b86a3c", "#7f9a6e", "#8c6170"],
    },
};

export type MapColors = typeof mapColors;
