from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException, Request, status


_hits: dict[str, deque[float]] = defaultdict(deque)


def enforce_rate_limit(request: Request, scope: str, limit: int, window_seconds: int, identity: str | None = None) -> None:
    key = f"{scope}:{identity or (request.client.host if request.client else 'unknown')}"
    now = monotonic()
    bucket = _hits[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again later.",
            headers={"Retry-After": str(window_seconds)},
        )
    bucket.append(now)
