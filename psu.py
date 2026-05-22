#!/usr/bin/env python3
"""
NGI N36620 power supply control over LAN (via USR-IoT TCP bridge).

CLI usage:
    psu.py on                          # turn output ON
    psu.py off                         # turn output OFF
    psu.py status                      # print JSON status, exit 0
    psu.py set --volt 5.0 --curr 0.5   # set V and/or I, does not toggle output
    psu.py id                          # print *IDN?

Exit codes:
    0 = success
    1 = communication error
    2 = bad CLI arguments

stdout is JSON when --json is passed (default for `status`); otherwise human-readable.
stderr carries error messages.
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import time
from contextlib import contextmanager

HOST_DEFAULT = '192.168.0.123'
PORT_DEFAULT = 5025
TIMEOUT_DEFAULT = 2.0


class PSUError(RuntimeError):
    pass


class PSU:
    def __init__(self, host: str, port: int, timeout: float):
        self.host, self.port, self.timeout = host, port, timeout
        self.sock: socket.socket | None = None

    def connect(self) -> None:
        try:
            self.sock = socket.create_connection(
                (self.host, self.port), timeout=self.timeout
            )
            self.sock.settimeout(self.timeout)
        except OSError as e:
            raise PSUError(f'connect to {self.host}:{self.port} failed: {e}') from e

    def close(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            finally:
                self.sock = None

    def write(self, cmd: str) -> None:
        if not self.sock:
            raise PSUError('not connected')
        try:
            self.sock.sendall(cmd.encode() + b'\n')
            time.sleep(0.05)
        except OSError as e:
            raise PSUError(f'write failed: {e}') from e

    def query(self, cmd: str, wait: float = 0.15) -> str:
        if not self.sock:
            raise PSUError('not connected')
        try:
            self.sock.sendall(cmd.encode() + b'\n')
            time.sleep(wait)
            data = b''
            try:
                while True:
                    chunk = self.sock.recv(512)
                    if not chunk:
                        break
                    data += chunk
                    if b'\n' in chunk:
                        break
            except socket.timeout:
                pass
            return data.decode(errors='replace').strip()
        except OSError as e:
            raise PSUError(f'query failed: {e}') from e

    # High-level
    def idn(self) -> str:           return self.query('*IDN?')
    def output_on(self) -> None:    self.write('OUTP ON')
    def output_off(self) -> None:   self.write('OUTP OFF')
    def output_state(self) -> bool:
        r = self.query('OUTP?')
        return r.strip() in ('1', 'ON')

    def set_voltage(self, v: float) -> None:  self.write(f'VOLT {v:.3f}')
    def set_current(self, i: float) -> None:  self.write(f'CURR {i:.3f}')

    def measure_voltage(self) -> float:
        try:
            return float(self.query('MEAS:VOLT?'))
        except ValueError:
            return float('nan')

    def measure_current(self) -> float:
        try:
            return float(self.query('MEAS:CURR?'))
        except ValueError:
            return float('nan')


@contextmanager
def open_psu(host: str, port: int, timeout: float):
    psu = PSU(host, port, timeout)
    psu.connect()
    try:
        yield psu
    finally:
        psu.close()


def main() -> int:
    p = argparse.ArgumentParser(description='NGI N36620 power supply control.')
    p.add_argument('--host', default=HOST_DEFAULT)
    p.add_argument('--port', type=int, default=PORT_DEFAULT)
    p.add_argument('--timeout', type=float, default=TIMEOUT_DEFAULT)
    p.add_argument('--json', action='store_true',
                   help='emit JSON on stdout (default for `status`)')

    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('on')
    sub.add_parser('off')
    sub.add_parser('status')
    sub.add_parser('id')

    sp = sub.add_parser('set')
    sp.add_argument('--volt', type=float)
    sp.add_argument('--curr', type=float)

    args = p.parse_args()
    emit_json = args.json or args.cmd == 'status'

    try:
        with open_psu(args.host, args.port, args.timeout) as psu:
            if args.cmd == 'on':
                psu.output_on()
                state = psu.output_state()
                result = {'ok': True, 'action': 'on', 'output': state}
            elif args.cmd == 'off':
                psu.output_off()
                state = psu.output_state()
                result = {'ok': True, 'action': 'off', 'output': state}
            elif args.cmd == 'id':
                result = {'ok': True, 'idn': psu.idn()}
            elif args.cmd == 'status':
                result = {
                    'ok': True,
                    'idn': psu.idn(),
                    'output': psu.output_state(),
                    'voltage': psu.measure_voltage(),
                    'current': psu.measure_current(),
                }
            elif args.cmd == 'set':
                if args.volt is None and args.curr is None:
                    print('set: provide --volt and/or --curr', file=sys.stderr)
                    return 2
                if args.volt is not None:
                    psu.set_voltage(args.volt)
                if args.curr is not None:
                    psu.set_current(args.curr)
                result = {
                    'ok': True,
                    'action': 'set',
                    'volt': args.volt,
                    'curr': args.curr,
                }
            else:
                print(f'unknown cmd {args.cmd}', file=sys.stderr)
                return 2
    except PSUError as e:
        err = {'ok': False, 'error': str(e)}
        if emit_json:
            print(json.dumps(err))
        else:
            print(f'ERROR: {e}', file=sys.stderr)
        return 1

    if emit_json:
        print(json.dumps(result))
    else:
        if args.cmd in ('on', 'off'):
            print(f'output is now {"ON" if result["output"] else "OFF"}')
        elif args.cmd == 'id':
            print(result['idn'])
        elif args.cmd == 'set':
            bits = []
            if result['volt'] is not None: bits.append(f'V={result["volt"]}')
            if result['curr'] is not None: bits.append(f'I={result["curr"]}')
            print('set ' + ', '.join(bits))
    return 0


if __name__ == '__main__':
    sys.exit(main())
