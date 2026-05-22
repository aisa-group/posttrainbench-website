#!/usr/bin/env python3
"""Serve the static website locally on an available localhost port."""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import signal
import socket
import socketserver
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PID_FILE = ROOT / ".local-server.pid"
URL_FILE = ROOT / ".local-server.url"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_START_PORT = 58926
DEFAULT_END_PORT = 59050


class DevHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with cache disabled so CSS/JS edits show up quickly."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReusableThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"host to bind, default: {DEFAULT_HOST}")
    parser.add_argument("--port", type=int, help="specific port to use instead of auto-selecting")
    parser.add_argument("--start-port", type=int, default=DEFAULT_START_PORT, help="first port to try")
    parser.add_argument("--end-port", type=int, default=DEFAULT_END_PORT, help="last port to try")
    parser.add_argument("--restart", action="store_true", help="stop the recorded server and start a fresh one")
    parser.add_argument("--no-reuse", action="store_true", help="start a new server even if one is already recorded")
    parser.add_argument(
        "--no-stop-previous",
        action="store_true",
        help="deprecated alias for --no-reuse",
    )
    return parser.parse_args()


def process_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def read_recorded_pid() -> int | None:
    if not PID_FILE.exists():
        return None

    try:
        return int(PID_FILE.read_text(encoding="utf-8").strip())
    except ValueError:
        PID_FILE.unlink(missing_ok=True)
        URL_FILE.unlink(missing_ok=True)
        return None


def read_recorded_url() -> str | None:
    if not URL_FILE.exists():
        return None

    url = URL_FILE.read_text(encoding="utf-8").strip()
    return url or None


def process_command(pid: int) -> str:
    try:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return ""

    if result.returncode != 0:
        return ""

    return result.stdout.strip()


def recorded_process_is_this_helper(pid: int) -> bool:
    command = process_command(pid)
    return "serve_local.py" in command


def cleanup_recorded_server_files(pid: int) -> None:
    removed_pid_file = False
    if PID_FILE.exists() and PID_FILE.read_text(encoding="utf-8").strip() == str(pid):
        PID_FILE.unlink(missing_ok=True)
        removed_pid_file = True
    if removed_pid_file and URL_FILE.exists():
        URL_FILE.unlink(missing_ok=True)


def wait_for_process_exit(pid: int, timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not process_is_running(pid):
            return True
        time.sleep(0.05)
    return not process_is_running(pid)


def stop_recorded_server(pid: int) -> None:
    if pid == os.getpid() or not process_is_running(pid):
        cleanup_recorded_server_files(pid)
        return

    if not recorded_process_is_this_helper(pid):
        print(f"Ignoring .local-server.pid for unrelated process {pid}.", file=sys.stderr)
        cleanup_recorded_server_files(pid)
        return

    print(f"Stopping previous local server pid {pid}...")
    os.kill(pid, signal.SIGTERM)
    if wait_for_process_exit(pid):
        cleanup_recorded_server_files(pid)
    else:
        print(f"Previous local server pid {pid} did not stop within 3s.", file=sys.stderr)


def port_is_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_port(host: str, requested_port: int | None, start_port: int, end_port: int) -> int:
    if requested_port is not None:
        if not port_is_available(host, requested_port):
            raise SystemExit(f"Port {requested_port} is already in use on {host}.")
        return requested_port

    for port in range(start_port, end_port + 1):
        if port_is_available(host, port):
            return port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def handle_shutdown(signum: int, _frame: object) -> None:
    raise KeyboardInterrupt


def main() -> None:
    args = parse_args()
    args.no_reuse = args.no_reuse or args.no_stop_previous

    recorded_pid = read_recorded_pid()
    if recorded_pid is not None and not process_is_running(recorded_pid):
        cleanup_recorded_server_files(recorded_pid)
        recorded_pid = None

    if recorded_pid is not None and not recorded_process_is_this_helper(recorded_pid):
        print(f"Ignoring .local-server.pid for unrelated process {recorded_pid}.", file=sys.stderr)
        cleanup_recorded_server_files(recorded_pid)
        recorded_pid = None

    if recorded_pid is not None:
        if args.restart:
            stop_recorded_server(recorded_pid)
        elif not args.no_reuse:
            recorded_url = read_recorded_url() or "unknown URL"
            print(f"Local server already running at {recorded_url} (pid {recorded_pid}).")
            return

    port = choose_port(args.host, args.port, args.start_port, args.end_port)
    handler = functools.partial(DevHandler, directory=ROOT)
    url = f"http://{args.host}:{port}/"

    PID_FILE.write_text(f"{os.getpid()}\n", encoding="utf-8")
    URL_FILE.write_text(f"{url}\n", encoding="utf-8")

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    try:
        with ReusableThreadingTCPServer((args.host, port), handler) as httpd:
            print(f"Serving {ROOT} at {url}", flush=True)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.", file=sys.stderr)
    finally:
        cleanup_recorded_server_files(os.getpid())


if __name__ == "__main__":
    main()
