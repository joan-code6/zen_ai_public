"""Standalone runner for the notes Model Context Protocol server."""

from __future__ import annotations

import argparse
import asyncio
import logging
from typing import Any

from websockets.server import serve

from zen_backend.mcp.notes import (
    NOTES_MCP_SERVER_NAME,
    NOTES_MCP_VERSION,
    create_notes_fastmcp_app,
    create_notes_mcp,
)

log = logging.getLogger(__name__)


async def _serve_websocket(host: str, port: int) -> None:
    handler = create_notes_mcp()
    async with serve(handler, host, port, subprotocols=["mcp"]):
        log.info("%s MCP server listening on %s:%s", NOTES_MCP_SERVER_NAME, host, port)
        await asyncio.Future()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the notes MCP server.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="TCP port to bind (default: 8765)")
    parser.add_argument(
        "--transport",
        choices=("websocket", "stdio"),
        default="websocket",
        help="Transport to use for MCP (default: websocket)",
    )

    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    try:
        if args.transport == "stdio":
            app = create_notes_fastmcp_app()
            log.info("Starting %s MCP server over stdio", NOTES_MCP_SERVER_NAME)
            app.run(transport="stdio")
        else:
            asyncio.run(_serve_websocket(args.host, args.port))
    except KeyboardInterrupt:  # pragma: no cover - graceful shutdown
        log.info("Shutting down %s MCP server", NOTES_MCP_SERVER_NAME)


if __name__ == "__main__":  # pragma: no cover - direct invocation guard
    main()
