"""Connect to the official COROS MCP server and list its tools.

Login happens in the browser (OAuth): you type your COROS credentials on COROS's own
page, this script only receives a token. Tokens are kept in .coros_oauth.json (secret,
never share it). Output: data/coros_tools.json (tool names + input schemas).

Usage:  .venv\\Scripts\\python.exe tools\\coros_probe.py [--region eu|us|cn]
"""
import argparse
import asyncio
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
from mcp.shared.auth import (
    AuthorizationCodeResult,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)

ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = ROOT / ".coros_oauth.json"
SERVERS = {
    "eu": "https://mcpeu.coros.com/mcp",
    "us": "https://mcpus.coros.com/mcp",
    "cn": "https://mcpcn.coros.com/mcp",
}
CALLBACK_PORT = 8765
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"


class FileTokenStorage:
    def _read(self) -> dict:
        return json.loads(TOKEN_FILE.read_text("utf-8")) if TOKEN_FILE.exists() else {}

    def _write(self, key: str, value) -> None:
        data = self._read()
        data[key] = value.model_dump(mode="json", exclude_none=True)
        TOKEN_FILE.write_text(json.dumps(data, indent=2), "utf-8")

    async def get_tokens(self):
        d = self._read().get("tokens")
        return OAuthToken(**d) if d else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self._write("tokens", tokens)

    async def get_client_info(self):
        d = self._read().get("client_info")
        return OAuthClientInformationFull(**d) if d else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self._write("client_info", client_info)


def wait_for_callback() -> dict:
    """Run a one-shot local web server that catches the OAuth redirect."""
    result: dict = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            q = parse_qs(urlparse(self.path).query)
            result.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>Connected. You can close this tab.</h2>".encode())
            done.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", CALLBACK_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    done.wait(timeout=300)
    server.shutdown()
    return result


async def main(region: str) -> None:
    server_url = SERVERS[region]

    async def redirect_handler(url: str) -> None:
        print("Opening browser for COROS login...")
        webbrowser.open(url)

    async def callback_handler() -> AuthorizationCodeResult:
        params = await asyncio.to_thread(wait_for_callback)
        if "code" not in params:
            raise RuntimeError(f"No authorization code received: {params}")
        return AuthorizationCodeResult(
            code=params["code"], state=params.get("state"), iss=params.get("iss")
        )

    auth = OAuthClientProvider(
        server_url=server_url,
        client_metadata=OAuthClientMetadata(
            client_name="Sleep Watch (personal)",
            redirect_uris=[REDIRECT_URI],
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
        ),
        storage=FileTokenStorage(),
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
    )

    async with create_mcp_http_client(auth=auth) as http_client:
        async with streamable_http_client(server_url, http_client=http_client) as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = (await session.list_tools()).tools
                out = [
                    {"name": t.name, "description": t.description, "inputSchema": t.input_schema}
                    for t in tools
                ]
                (ROOT / "data").mkdir(exist_ok=True)
                (ROOT / "data" / "coros_tools.json").write_text(
                    json.dumps(out, indent=2, ensure_ascii=False), "utf-8"
                )
                print(f"Connected to {server_url}. {len(out)} tools:")
                for t in out:
                    print(" -", t["name"])
                print("Saved data/coros_tools.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=SERVERS, default="eu")
    asyncio.run(main(ap.parse_args().region))
