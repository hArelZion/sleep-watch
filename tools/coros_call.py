"""Call COROS MCP tools with the saved login and save raw results to data/raw/.

Usage:  .venv\\Scripts\\python.exe tools\\coros_call.py NAME '{"arg": 1}' [NAME '{...}' ...]
"""
import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coros_probe import ROOT, SERVERS, FileTokenStorage, REDIRECT_URI  # noqa: E402

from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
from mcp.shared.auth import OAuthClientMetadata

RAW_DIR = ROOT / "data" / "raw"


@asynccontextmanager
async def coros_session(region: str = "eu"):
    """An initialized MCP session that uses the saved COROS login (never opens a browser)."""
    server_url = SERVERS[region]

    async def no_browser(url: str) -> None:
        raise RuntimeError("Login expired: run tools/coros_probe.py to log in again")

    auth = OAuthClientProvider(
        server_url=server_url,
        client_metadata=OAuthClientMetadata(
            client_name="Sleep Watch (personal)", redirect_uris=[REDIRECT_URI]
        ),
        storage=FileTokenStorage(),
        redirect_handler=no_browser,
    )
    async with create_mcp_http_client(auth=auth) as http_client:
        async with streamable_http_client(server_url, http_client=http_client) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                await session.initialize()
                yield session


async def call_text(session: ClientSession, name: str, args: dict) -> str:
    """Call a tool and return its text. COROS wraps the text in a JSON string, so unwrap it."""
    result = await session.call_tool(name, args)
    text = "\n".join(c.text for c in getattr(result, "content", []) if hasattr(c, "text"))
    try:
        unwrapped = json.loads(text)
        if isinstance(unwrapped, str):
            return unwrapped
    except json.JSONDecodeError:
        pass
    return text


async def main(calls: list[tuple[str, dict]]) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    async with coros_session() as session:
        for name, args in calls:
            text = await call_text(session, name, args)
            tag = "_".join(str(v) for v in args.values()) or "default"
            path = RAW_DIR / f"{name}_{tag}.txt"
            path.write_text(text, "utf-8")
            print(f"== {name} {args} -> {path.name} ({len(text)} chars)")
            print(text[:1500])


if __name__ == "__main__":
    a = sys.argv[1:]
    asyncio.run(main([(a[i], json.loads(a[i + 1])) for i in range(0, len(a), 2)]))
