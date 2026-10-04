"""Exercise real Pi TUI up-arrow history with an offline TypeScript provider."""
import fcntl
import json
import os
import pathlib
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PI = os.environ.get("PI_BINARY") or shutil.which("pi")
if not PI:
    raise SystemExit("Pi CLI not found. Set PI_BINARY to a Bun-based Pi launcher.")

class Tui:
    def __init__(self, work, mode, session=None):
        self.work = pathlib.Path(work)
        self.audit = self.work / "audit.jsonl"
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
        env = os.environ | {"TERM": "xterm-256color", "PI_OFFLINE": "1",
            "PI_CODING_AGENT_DIR": str(self.work / "agent"), "GOAL_UI_AUDIT": str(self.audit)}
        args = [PI, "--offline", "--no-extensions", "--no-context-files", "--no-skills", "--no-prompt-templates",
            "--no-themes", "--tui-mode", mode, "--session-dir", str(self.work / "sessions"),
            "-e", str(ROOT / "src/index.ts"), "-e", str(ROOT / "test/ui-fixture.ts"), "--model", "goal-ui-audit/audit"]
        if session:
            args += ["--session", str(session)]
        self.log = bytearray()
        self.proc = subprocess.Popen(args, cwd=self.work, env=env, stdin=slave, stdout=slave, stderr=slave)
        os.close(slave)
        self.wait(lambda rows: any(r["kind"] == "started" for r in rows))
        self.pump(0.6)

    def pump(self, seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if select.select([self.master], [], [], 0.02)[0]:
                try:
                    self.log += os.read(self.master, 65536)
                except OSError:
                    break

    def rows(self):
        if not self.audit.exists():
            return []
        return [json.loads(line) for line in self.audit.read_text().splitlines() if line]

    def wait(self, check):
        end = time.monotonic() + 12
        while time.monotonic() < end:
            self.pump(0.05)
            if check(self.rows()):
                return
            if self.proc.poll() is not None:
                break
        raise AssertionError("TUI wait failed: " + self.log.decode(errors="replace")[-5000:])

    def submit(self, text, settled):
        os.write(self.master, text.encode())
        os.write(self.master, b"\x1b[13u")
        self.wait(lambda rows: sum(r["kind"] == "settled" for r in rows) >= settled)
        self.pump(0.2)

    def up(self):
        count = sum(r["kind"] == "up" for r in self.rows())
        os.write(self.master, b"\x1b[A")
        self.wait(lambda rows: sum(r["kind"] == "up" for r in rows) > count)
        return [r["text"] for r in self.rows() if r["kind"] == "up"][-1]

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        os.close(self.master)
        (self.work / "terminal.log").write_bytes(self.log)


def run(mode):
    work = pathlib.Path(tempfile.mkdtemp(prefix="pi-goal-tui-"))
    settings = work / "agent/settings.json"
    settings.parent.mkdir(parents=True)
    settings.write_text(json.dumps({"quietStartup": True, "collapseChangelog": True, "retry": {"enabled": False}}))
    t = Tui(work, mode)
    try:
        t.submit("HUMAN_ONLY_MESSAGE", 1)
        t.submit("/goal TUI_OBJECTIVE_ONLY_IN_STATE", 2)
        t.submit("/goal resume", 3)
        values = [t.up(), t.up(), t.up()]
        assert values == ["/goal resume", "/goal TUI_OBJECTIVE_ONLY_IN_STATE", "HUMAN_ONLY_MESSAGE"], values
        assert not any("Read get_goal" in v for v in values)
        session = next((work / "sessions").glob("**/*.jsonl"))
        entries = [json.loads(line) for line in session.read_text().splitlines()]
        user = [e for e in entries if e.get("type") == "message" and e.get("message", {}).get("role") == "user"]
        assert len(user) == 1, user
        controls = [e for e in entries if e.get("type") == "custom_message" and e.get("customType") == "pi-codex-goal/control-v1"]
        assert len(controls) == 2 and all(not e["display"] for e in controls), controls
        latest = [e["data"] for e in entries if e.get("type") == "custom" and e.get("customType") == "pi-codex-goal/state-v1"][-1]
        assert latest["goal"] is None and latest["receipt"]["status"] == "complete", latest
    finally:
        t.close()
    # Reopen: commands were typed by the human, but not persisted as messages.
    (work / "audit.jsonl").unlink()
    reopened = Tui(work, mode, session)
    try:
        value = reopened.up()
        assert value == "HUMAN_ONLY_MESSAGE", value
        assert not any(r["kind"] == "request" for r in reopened.rows())
    finally:
        reopened.close()
    print(json.dumps({"mode": mode, "result": "PASS", "live_up_history": values,
        "reopened_up": value, "generated_user_messages": 0, "evidence_dir": str(work)}, ensure_ascii=False))

for mode in ["regular", "fullscreen"]:
    run(mode)
