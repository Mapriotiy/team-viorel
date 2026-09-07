import { useState } from "react";
import { apiRequest } from "../../api/client";

type GoogleLoginUrlResponse = {
    auth_url: string;
    state: string;
};

export type AuthFormProps = {
    errorMessage: string | null;
    isRedirecting: boolean;
    onLogin: () => void;
};

export function useGoogleLogin(
    initialError: string | null,
    onClearError?: () => void,
): AuthFormProps {
    const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
    const [isRedirecting, setIsRedirecting] = useState(false);

    async function handleLogin() {
        setErrorMessage(null);
        onClearError?.();
        setIsRedirecting(true);
        try {
            const res = await apiRequest<GoogleLoginUrlResponse>("/auth/google/login-url");
            window.location.href = res.auth_url;
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "Something went wrong",
            );
            setIsRedirecting(false);
        }
    }

    return { errorMessage, isRedirecting, onLogin: handleLogin };
}
