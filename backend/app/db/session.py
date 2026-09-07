from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

connect_args = {}

if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)

if settings.database_url.startswith("postgres"):
    # Never let a single statement hang the pool: a blocked DELETE/ALTER/... on
    # a row or table that another session holds locks forever otherwise takes
    # down the whole site (all requests wait for a free connection).
    @event.listens_for(engine, "connect")
    def _pg_connect(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("SET lock_timeout = 8000")
            cursor.execute("SET statement_timeout = 30000")
            cursor.execute("SET idle_in_transaction_session_timeout = 60000")
        finally:
            cursor.close()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
