from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import api_router
from app.services.leetcode_client import close_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_client()


app = FastAPI(
    title="LeetCode Streaks API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "https://mapriotiy.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/"):
        # OAuth code exchange is the unauthenticated endpoint that creates the
        # cookies; all subsequent cookie-authenticated mutations need the
        # double-submit token.
        if request.url.path != "/api/auth/google/code" and not request.headers.get("authorization"):
            cookie = request.cookies.get("csrf_token")
            header = request.headers.get("x-csrf-token")
            if not cookie or not header or cookie != header:
                return JSONResponse({"detail": "CSRF validation failed"}, status_code=403)
    return await call_next(request)

app.include_router(api_router, prefix="/api")
