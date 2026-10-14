#!/usr/bin/env python3
"""
pty-render.py — 在真实 PTY 里跑 TUI，验证渲染行为。

用途：差分渲染的正确性在于「往终端写了什么」，单元测试只能覆盖纯函数，
错位的表现（屏幕残留、光标跑飞）只有在真实 PTY 的字节流里才看得出来。

已知坑：PTY 默认开着 ONLCR，会把子进程写的 \\n 翻成 \\r\\n，于是字节流里的换行
数变成两倍，没法直接按行数判断。这里在子进程侧把 ONLCR 关掉（见 driver 的
输出设置），所以拿到的字节流与真实终端一致。

跑法：
    python3 test/pty-render.py            概览（每次写入的行号）
    python3 test/pty-render.py --raw      打印原始字节（转义序列显形）
"""

import fcntl
import os
import re
import select
import struct
import subprocess
import sys
import termios
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(ROOT, "driver.js")


def run(keys=(), cols=100, rows=30, settle=1.2, timeout=15):
    """在指定尺寸的 PTY 里跑 driver，按时机喂按键，返回全部输出字节。"""
    master, slave = pty_open(cols, rows)
    proc = subprocess.Popen(
        ["node", DRIVER, str(cols), str(rows)],
        stdin=slave, stdout=slave, stderr=slave, close_fds=True,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave)

    out = b""
    pending = list(keys)
    next_key_at = time.time() + settle
    deadline = time.time() + timeout

    while time.time() < deadline:
        r, _, _ = select.select([master], [], [], 0.1)
        if r:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            out += chunk
        elif pending and time.time() >= next_key_at:
            os.write(master, pending.pop(0))
            next_key_at = time.time() + settle
        elif not pending and proc.poll() is not None:
            break

    if proc.poll() is None:
        proc.kill()
        proc.wait()
    try:
        os.close(master)
    except OSError:
        pass
    return out


def pty_open(cols, rows):
    master, slave = os.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    # 关掉 ONLCR（输出把 \n 翻成 \r\n）。不关的话字节流里的换行数会翻倍，
    # 「渲染了多少行」就没法从字节数里读出来了。
    attrs = termios.tcgetattr(slave)
    attrs[1] &= ~termios.ONLCR  # attrs[1] 是 oflag
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    return master, slave


def describe(raw):
    """把一次运行拆成事件序列，说明整屏重写与差分写行各发生在哪。"""
    text = raw.decode("utf-8", "replace")
    events = []
    # 先匹配绝对定位（\e[<行>H），再匹配整屏重写（\e[H，后面可跟 \e[J）
    for m in re.finditer(r"\x1b\[(\d+)H|\x1b\[H", text):
        if m.group(1) is None:
            events.append("整屏重写")
        else:
            events.append(f"写第 {m.group(1)} 行")
    return events


def show_frame(raw, n=30):
    """还原屏幕上最后可见的内容：全屏重写建立底稿，差分行叠加。"""
    text = raw.decode("utf-8", "replace")
    screen = {}

    # 底稿：最后一次全屏重写
    starts = [m.start() for m in re.finditer(r"\x1b\[H", text)]
    if not starts:
        return {}
    base = text[starts[-1]:]
    # 全屏重写的内容直到第一个绝对定位或结尾
    end = re.search(r"\x1b\[\d+H", base[3:])
    body = base[3:end.start() + 3] if end else base[3:]
    for i, line in enumerate(body.split("\r\n"), start=1):
        screen[i] = strip(line)

    # 差分行叠加（只看底稿之后的）
    tail = text[starts[-1] + len(body) + 3:]
    for m in re.finditer(r"\x1b\[(\d+)H(.*?)(?=\x1b\[\d+H|\Z)", tail, re.S):
        screen[int(m.group(1))] = strip(m.group(2)).rstrip()

    return dict(sorted(screen.items())[:n])


def strip(s):
    return re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", s)


def main():
    raw_mode = "--raw" in sys.argv

    print("场景 1 · 首帧 + refresh 完成（不按键）")
    raw = run()
    if raw_mode:
        print(raw.decode("utf-8", "replace").replace("\x1b", "\\e")[:2500])
    else:
        for k, v in show_frame(raw).items():
            print(f"{k:>2} |{v[:96]}")

    print("\n场景 2 · 按一次 j（选中行下移）")
    raw2 = run(keys=[b"j"])
    events = describe(raw2)
    print(f"  整屏重写 {events.count('整屏重写')} 次；按行写入 {len(events) - events.count('整屏重写')} 次")
    # 统计每行被写几次：按 j 后只应重写选中状态变化的那几行
    counts = {}
    for e in events:
        if e.startswith("写第"):
            row = int(e.split()[1])
            counts[row] = counts.get(row, 0) + 1
    twice = sorted(r for r, c in counts.items() if c > 1)
    print(f"  被写两次以上的行（即按 j 触发的重写）: {twice or '无'}")
    print("  期望：只有「操作」面板里选中行那几行被重写")


if __name__ == "__main__":
    main()