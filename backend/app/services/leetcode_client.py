import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.leetcode import (
    LeetCodeProfileResponse,
    RecentAcceptedSubmission,
    SolvedStats,
)
from app.services.leetcode_limiter import register_rate_limit, release_slot, wait_for_slot


logger = logging.getLogger(__name__)


LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"

USER_PUBLIC_PROFILE_QUERY = """
query userPublicProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      realName
      userAvatar
      ranking
    }
    submitStats {
      acSubmissionNum {
        difficulty
        count
      }
    }
    submissionCalendar
  }
}
"""

RECENT_ACCEPTED_SUBMISSIONS_QUERY = """
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
    lang
    runtime
    memory
    langName
  }
}
"""


def parse_runtime_ms(raw: str | None) -> int | None:
    """Parse a LeetCode runtime display string ("167 ms", "0 ms") to int ms.

    "N/A", empty, or unparseable values return None. 0 is a valid runtime.
    """
    if not raw:
        return None
    value = raw.strip().removesuffix("ms").strip()
    try:
        return int(float(value))
    except ValueError:
        return None

PROBLEMSET_LIST_QUERY = """
query problemsetQuestionList($categorySlug: String, $skip: Int, $limit: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: $categorySlug
    skip: $skip
    limit: $limit
    filters: $filters
  ) {
    total: totalNum
    questions: data {
      questionId
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags {
        name
        slug
      }
    }
  }
}
"""

_HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://leetcode.com",
    "User-Agent": "leetcode-streaks-dev",
}

_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        async with _client_lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(timeout=30.0)
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        async with _client_lock:
            if _client is not None and not _client.is_closed:
                await _client.aclose()
    _client = None


_cache: dict[str, tuple[float, Any]] = {}
_PROFILE_TTL = 300   # 5 min — avatar, calendar, historical data
_SUBS_TTL = 60       # 1 min — recent submissions should refresh quickly


def _cache_get(key: str, ttl: float) -> Any | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.monotonic() - ts > ttl:
        _cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic(), value)


def _load_fake_submissions(username: str) -> list[dict]:
    """Load fake submissions for a user from the configured JSON file.

    File shape: {"<username>": [{"id": 1, "title": "...", "titleSlug": "...",
    "timestamp": 1753700000, "lang": "python3", "runtime": "167 ms"}, ...]}
    """
    path = settings.leetcode_fake_submissions_path
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError):
        logger.warning("Could not read fake submissions file %s", path, exc_info=True)
        return []
    return data.get(username, [])


class LeetCodeClient:
    async def get_user_profile(self, username: str) -> LeetCodeProfileResponse:
        cache_key = f"profile:{username}"
        cached = _cache_get(cache_key, _PROFILE_TTL)
        if cached is not None:
            return cached

        payload = await self._post_graphql(
            query=USER_PUBLIC_PROFILE_QUERY,
            variables={"username": username},
        )

        matched_user = payload.get("data", {}).get("matchedUser")
        if matched_user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="LeetCode user not found",
            )

        result = self._normalize_profile(matched_user)
        _cache_set(cache_key, result)
        return result

    async def get_recent_accepted_submissions(
            self,
            username: str,
            limit: int = 20,
    ) -> list[RecentAcceptedSubmission]:
        # Test seam: serve submissions from a local JSON file, re-read on
        # every call and bypassing the cache so edits show up immediately.
        if settings.leetcode_fake_submissions_path:
            return self._normalize_submissions(
                _load_fake_submissions(username)[:limit]
            )

        cache_key = f"subs:{username}:{limit}"
        cached = _cache_get(cache_key, _SUBS_TTL)
        if cached is not None:
            return cached

        payload = await self._post_graphql(
            query=RECENT_ACCEPTED_SUBMISSIONS_QUERY,
            variables={"username": username, "limit": limit},
        )

        submissions = payload.get("data", {}).get("recentAcSubmissionList") or []
        result = self._normalize_submissions(submissions)

        _cache_set(cache_key, result)
        return result

    def _normalize_submissions(
            self,
            submissions: list[dict],
    ) -> list[RecentAcceptedSubmission]:
        result: list[RecentAcceptedSubmission] = []

        for submission in submissions:
            title_slug = submission.get("titleSlug")
            timestamp = submission.get("timestamp")

            if not title_slug or not timestamp:
                continue

            submitted_at = datetime.fromtimestamp(
                int(timestamp),
                tz=timezone.utc,
            ).isoformat()

            submission_id = submission.get("id")

            result.append(
                RecentAcceptedSubmission(
                    title=submission.get("title") or title_slug,
                    title_slug=title_slug,
                    url=f"https://leetcode.com/problems/{title_slug}/",
                    submitted_at=submitted_at,
                    language=submission.get("lang"),
                    submission_id=int(submission_id) if submission_id else None,
                    submission_url=f"https://leetcode.com/submissions/detail/{submission_id}/" if submission_id else None,
                    runtime_ms=parse_runtime_ms(submission.get("runtime")),
                )
            )

        return result

    async def fetch_profile_and_submissions(
            self,
            username: str,
            limit: int = 30,
    ) -> tuple[LeetCodeProfileResponse, list[RecentAcceptedSubmission]]:
        profile_task = self.get_user_profile(username)
        subs_task = self.get_recent_accepted_submissions(username, limit=limit)
        profile, submissions = await asyncio.gather(profile_task, subs_task)
        return profile, submissions

    async def get_problemset_list(
            self,
            skip: int = 0,
            limit: int = 50,
            category_slug: str = "",
    ) -> tuple[int, list[dict]]:
        cache_key = f"problemset:{skip}:{limit}:{category_slug}"
        cached = _cache_get(cache_key, _SUBS_TTL)
        if cached is not None:
            return cached

        try:
            payload = await self._post_graphql(
                query=PROBLEMSET_LIST_QUERY,
                variables={
                    "categorySlug": category_slug,
                    "skip": skip,
                    "limit": limit,
                    "filters": {},
                },
            )
        except HTTPException as exc:
            logger.warning("get_problemset_list failed at skip=%d: %s", skip, exc.detail)
            return 0, []

        problemset = payload.get("data", {}).get("problemsetQuestionList") or {}
        total = problemset.get("total") or 0
        questions = problemset.get("questions") or []

        result: list[dict] = []
        for q in questions:
            if q.get("isPaidOnly", False):
                continue
            frontend_id = q.get("questionId")
            if frontend_id is None:
                continue

            tags_raw = q.get("topicTags") or []
            topic_tags = [t.get("name", "").lower().replace(" ", "-") for t in tags_raw if t.get("name")]

            result.append({
                "frontend_id": int(frontend_id),
                "title": q.get("title", ""),
                "title_slug": q.get("titleSlug", ""),
                "difficulty": q.get("difficulty", ""),
                "topic_tags": topic_tags,
            })

        _cache_set(cache_key, (total, result))
        return total, result

    async def _post_graphql(self, query: str, variables: dict) -> dict:
        client = await _get_client()
        try:
            await wait_for_slot()
            try:
                response = await client.post(
                    LEETCODE_GRAPHQL_URL,
                    json={
                        "query": query,
                        "variables": variables,
                    },
                    headers=_HEADERS,
                )
            finally:
                release_slot()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not connect to LeetCode API",
            ) from exc

        register_rate_limit(response.status_code)
        if response.status_code != status.HTTP_200_OK:
            logger.warning(
                "LeetCode API returned %s for query %s",
                response.status_code,
                query.split("(")[0] if "(" in query else query[:60],
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LeetCode API returned status {response.status_code}",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("LeetCode API returned invalid JSON: %s", response.text[:200])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LeetCode API returned invalid JSON",
            ) from exc

        if payload.get("errors"):
            logger.warning("LeetCode API returned errors: %s", payload["errors"])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LeetCode API returned an error",
            )

        return payload

    def _normalize_profile(self, matched_user: dict) -> LeetCodeProfileResponse:
        profile = matched_user.get("profile") or {}

        return LeetCodeProfileResponse(
            username=matched_user["username"],
            real_name=profile.get("realName"),
            avatar_url=profile.get("userAvatar"),
            ranking=profile.get("ranking"),
            solved=self._parse_solved_stats(matched_user),
            submission_calendar=self._parse_submission_calendar(
                matched_user.get("submissionCalendar")
            ),
        )

    def _parse_solved_stats(self, matched_user: dict) -> SolvedStats:
        stats = SolvedStats()

        items = (
            matched_user.get("submitStats", {})
            .get("acSubmissionNum", [])
        )

        for item in items:
            difficulty = item.get("difficulty")
            count = item.get("count", 0)

            if difficulty == "All":
                stats.total = count
            elif difficulty == "Easy":
                stats.easy = count
            elif difficulty == "Medium":
                stats.medium = count
            elif difficulty == "Hard":
                stats.hard = count

        return stats

    def _parse_submission_calendar(self, raw_calendar: str | None) -> dict[str, int]:
        if not raw_calendar:
            return {}

        calendar = json.loads(raw_calendar)
        normalized: dict[str, int] = {}

        for timestamp, count in calendar.items():
            date = datetime.fromtimestamp(
                int(timestamp),
                tz=timezone.utc,
            ).date()

            normalized[date.isoformat()] = int(count)

        return normalized
