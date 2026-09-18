import asyncio
import time
from collections import deque
from typing import Any


GLOBAL_CONCURRENCY = 16
GLOBAL_RPS = 6
BURST = 20
BACKOFF_SECONDS = 180

_semaphore = asyncio.Semaphore(GLOBAL_CONCURRENCY)
_window_lock = asyncio.Lock()
_recent_requests: deque[float] = deque()
_backoff_until = 0.0


async def wait_for_slot() -> None:
    global _backoff_until

    await _semaphore.acquire()
    try:
        while True:
            now = time.monotonic()
            if _backoff_until > now:
                await asyncio.sleep(min(_backoff_until - now, 5.0))
                continue

            async with _window_lock:
                now = time.monotonic()
                while _recent_requests and now - _recent_requests[0] >= 1.0:
                    _recent_requests.popleft()

                if len(_recent_requests) < min(GLOBAL_RPS, BURST):
                    _recent_requests.append(now)
                    return

                wait_for = max(0.05, 1.0 - (now - _recent_requests[0]))

            await asyncio.sleep(wait_for)
    except Exception:
        _semaphore.release()
        raise


def release_slot() -> None:
    _semaphore.release()


def register_rate_limit(status_code: int) -> None:
    global _backoff_until
    if status_code not in {403, 429}:
        return
    _backoff_until = max(_backoff_until, time.monotonic() + BACKOFF_SECONDS)


def limiter_snapshot() -> dict[str, Any]:
    now = time.monotonic()
    return {
        "global_concurrency": GLOBAL_CONCURRENCY,
        "global_rps": GLOBAL_RPS,
        "burst": BURST,
        "backoff_seconds_remaining": max(0, round(_backoff_until - now)),
        "recent_requests": len(_recent_requests),
    }
