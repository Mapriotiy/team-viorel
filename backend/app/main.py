from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import api_router


app = FastAPI(
    title="LeetCode Streaks API",
    version="0.1.0",
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
        if not request.headers.get("authorization"):
            cookie = request.cookies.get("csrf_token")
            header = request.headers.get("x-csrf-token")
            if not cookie or not header or cookie != header:
                return JSONResponse({"detail": "CSRF validation failed"}, status_code=403)
    return await call_next(request)

app.include_router(api_router, prefix="/api")