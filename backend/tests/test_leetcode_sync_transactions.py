from app.services.leetcode_sync import _begin_sync, _finish_sync


def test_begin_sync_does_not_leave_transaction_open(db):
    can_sync, meta = _begin_sync(
        db,
        "profile",
        "mapriotii",
        cooldown_seconds=60,
    )

    assert can_sync is True
    assert meta["status"] == "syncing"
    assert db.in_transaction() is False


def test_finish_sync_does_not_leave_transaction_open(db):
    _begin_sync(
        db,
        "profile",
        "mapriotii",
        cooldown_seconds=60,
    )

    meta = _finish_sync(
        db,
        "profile",
        "mapriotii",
        status="synced",
        cooldown_seconds=60,
        metadata={"fetched": 1},
    )

    assert meta["status"] == "synced"
    assert meta["metadata"] == {"fetched": 1}
    assert db.in_transaction() is False
