from pathlib import Path

from pydantic_settings import BaseSettings


BACKEND_DIR = Path(__file__).resolve().parents[2]
SQLITE_FILE_PREFIX = "sqlite:///"


def _normalize_sqlite_url(database_url: str) -> str:
    if not database_url.startswith(SQLITE_FILE_PREFIX):
        return database_url

    sqlite_path = database_url[len(SQLITE_FILE_PREFIX):]
    if (
        not sqlite_path
        or sqlite_path == ":memory:"
        or sqlite_path.startswith("/")
        or (len(sqlite_path) > 1 and sqlite_path[1] == ":")
    ):
        return database_url

    db_path = (BACKEND_DIR / sqlite_path).resolve().as_posix()
    return f"{SQLITE_FILE_PREFIX}{db_path}"


class Settings(BaseSettings):
    database_url: str = f"{SQLITE_FILE_PREFIX}{(BACKEND_DIR / 'leetcode_streaks.local.db').as_posix()}"
    secret_key: str = "dev-secret-key"
    environment: str = "development"
    access_token_expire_minutes: int = 60 * 24
    frontend_url: str = "http://localhost:5173"
    # Test seam: path to a JSON file of fake recent submissions per username.
    leetcode_fake_submissions_path: str | None = None

    # Google OAuth (authorization code flow with PKCE).
    google_client_id: str = ""
    google_client_secret: str = ""
    # Where Google redirects after consent. Defaults to
    # "{frontend_url}/auth/callback"; set explicitly when the app is served
    # under a sub-path (e.g. ".../cinnamon-code/auth/callback").
    google_redirect_uri: str = ""

    # LeetCode account verification.
    leetcode_verify_window_minutes: int = 15
    leetcode_verify_cooldown_seconds: int = 12
    leetcode_verify_max_attempts: int = 10
    leetcode_verify_problem_slug: str = "two-sum"

    # Fortify shield duration in hours; None/0 = permanent (no expiry).
    fortify_duration_hours: float | None = None

    @property
    def effective_google_redirect_uri(self) -> str:
        if self.google_redirect_uri:
            return self.google_redirect_uri
        return f"{self.frontend_url.rstrip('/')}/auth/callback"

    class Config:
        env_file = ".env"

    def model_post_init(self, __context: object) -> None:
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace(
                "postgres://",
                "postgresql+psycopg://",
                1,
            )
        else:
            self.database_url = _normalize_sqlite_url(self.database_url)

        production = self.environment.lower() in {"production", "prod"} or self.database_url.startswith("postgresql")
        if production and (self.secret_key == "dev-secret-key" or len(self.secret_key) < 32):
            raise ValueError("SECRET_KEY must be a random value of at least 32 characters in production")


settings = Settings()
