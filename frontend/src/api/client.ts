export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("csrf_token="))
        ?.slice("csrf_token=".length);
    const method = (options.method ?? "GET").toUpperCase();

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(csrf && method !== "GET" && method !== "HEAD" ? { "X-CSRF-Token": csrf } : {}),
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.detail ?? `API error: ${response.status}`;
        throw new Error(message);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const responseText = await response.text();

    if (!responseText) {
        return undefined as T;
    }

    return JSON.parse(responseText) as T;
}
