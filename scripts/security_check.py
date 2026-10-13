"""Dependency-free repository hygiene checks. Never prints matched secrets."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = {'.exe', '.dll', '.so', '.dylib', '.com', '.scr', '.msi', '.apk',
           '.jar', '.wasm', '.zip', '.rar', '.7z', '.gz', '.tgz', '.pem',
           '.key', '.p12', '.pfx'}
MEDIA = {'.mp4', '.webm', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff2'}
PATTERNS = [
    re.compile(r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----'),
    re.compile(r'\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b'),
    re.compile(r'\bgh[pousr]_[A-Za-z0-9]{20,}\b'),
    re.compile(r'\bAKIA[A-Z0-9]{16}\b'),
    re.compile(r'''(?im)^[ \t]*(?:[A-Z_]*(?:API_KEY|API_TOKEN|SECRET|PASSWORD)|_authToken)[ \t]*[:=][ \t]*["']?[^\s"'#$<>]{12,}'''),
]


def inspect(path, data):
    errors = []
    p = Path(path)
    if (p.name == '.env' or p.name.startswith('.env.')) and p.name != '.env.example':
        errors.append('environment file is forbidden')
    if p.suffix.lower() in BLOCKED:
        errors.append('executable, archive or credential file is forbidden')
    if data.startswith((b'MZ', b'\x7fELF', b'\xcf\xfa\xed\xfe', b'PK\x03\x04')):
        errors.append('executable/archive signature is forbidden')
    if p.suffix.lower() in MEDIA:
        if not path.startswith('public/samples/'):
            errors.append('binary assets must be reviewed samples under public/samples/')
        if len(data) > 100_000_000:
            errors.append('sample exceeds 100 MB')
        return errors
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return errors + ['unapproved binary file']
    if any(pattern.search(text) for pattern in PATTERNS):
        errors.append('possible secret (value redacted)')
    if p.name == '.env.example':
        for line in text.splitlines():
            if re.match(r'^\w*(?:API_KEY|API_TOKEN|ACCOUNT_ID)=.+', line):
                errors.append('example credentials must be empty')
    if p.name == 'package.json':
        try:
            package = json.loads(text)
            for section in ('dependencies', 'devDependencies', 'optionalDependencies'):
                for name, version in package.get(section, {}).items():
                    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[\w.-]+)?', version):
                        errors.append(f'{name}: dependency must use an exact registry version')
            if not re.fullmatch(r'pnpm@\d+\.\d+\.\d+(?:\+sha(?:256|512)\.[a-f0-9]+)?', package.get('packageManager', '')):
                errors.append('packageManager must pin pnpm')
        except (ValueError, TypeError):
            errors.append('invalid package manifest')
    return errors


def main():
    result = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
                            cwd=ROOT, check=True, capture_output=True)
    failures = []
    names = set(result.stdout.decode().split('\0')) - {''}
    for name in sorted(names):
        p = ROOT / name
        if p.is_symlink():
            failures.append(f'{name}: symlinks are forbidden')
        elif p.is_file():
            failures.extend(f'{name}: {error}' for error in inspect(name, p.read_bytes()))
    if 'package.json' in names and 'pnpm-lock.yaml' not in names:
        failures.append('pnpm-lock.yaml is required')
    for failure in failures:
        print(failure, file=sys.stderr)
    print(f'Security hygiene: {len(names)} files, {len(failures)} findings.')
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
