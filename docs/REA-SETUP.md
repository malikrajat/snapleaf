# REA setup for this analysis

This is the environment used to study the locally installed Lightshot copy. It is kept
separate from the Snapleaf application.

## Versions observed

| Tool | Version / path |
| --- | --- |
| REA CLI | `rea-agents@6.7.0` (global npm) |
| REA source | `morluto/rea` cloned under `tools/rea` (main, commit `c01c168`) |
| Ghidra | 12.1.4 at `tools/ghidra_12.1.4_PUBLIC` |
| JDK | Microsoft OpenJDK 21.0.13 |
| Node.js | 24.15.0 |
| npm | 11.12.1 |

The npm registry advertises `rea-agents@6.10.1`; npm installed 6.7.0 in this environment.
The repository docs used for reference are from main (6.10.1). Node 24.15.0 does not meet
the published 6.10.1 engine range (`>=24.22.1` for the 24.x line), so 6.7.0 is the version
that was actually exercised.

## Installation

```powershell
npm install --global rea-agents

git clone --depth 1 --recurse-submodules --shallow-submodules `
  https://github.com/morluto/rea.git D:\project\light\tools\rea
```

Four submodules checked out: `binwalk`, `ghidra-nativeaot`, `jadx-headless-mcp`, `wakaru`.
`third_party/unblob` could not be checked out on Windows because its test fixtures include a
filename that is invalid on NTFS (`a1x01.ar_extract/…`). Unblob is not used for native PE
analysis, so this does not affect Lightshot research.

Ghidra was downloaded from the official GitHub release and extracted:

```powershell
curl.exe -L -o tools\ghidra_12.1.4_PUBLIC.zip `
  https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
tar -xf tools\ghidra_12.1.4_PUBLIC.zip -C tools
```

## Environment and readiness

```powershell
$env:GHIDRA_INSTALL_DIR = 'D:\project\light\tools\ghidra_12.1.4_PUBLIC'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot'
$env:REA_ANALYSIS_PROVIDER = 'ghidra'

rea doctor --provider ghidra --json
```

The scoped report was healthy: Ghidra 12.1.4, headless launcher, native decompiler,
64-bit JDK 21, Windows native authority (Job Object, private DACL, reparse-safe handles).
The global doctor remains unhealthy only for unrelated clients, the missing REA skill, and
unconfigured Hopper/IDA/JADX/Kuna.

## Commands used

The repository exposes both inspections as npm commands. They resolve the global REA CLI,
set the bundled Ghidra/JDK paths, and never execute the target binary:

```powershell
npm run read:exe -- "C:\Program Files (x86)\Skillbrains\lightshot\5.5.0.7\Lightshot.exe"
npm run read:exe:deep -- "C:\Program Files (x86)\Skillbrains\lightshot\5.5.0.7\Lightshot.dll"
```

Equivalent direct REA commands:

```powershell
rea inspect-artifact "C:\Program Files (x86)\Skillbrains\lightshot\5.5.0.7\Lightshot.exe" `
  --format json
rea inspect "C:\Program Files (x86)\Skillbrains\lightshot\5.5.0.7\Lightshot.dll" `
  --provider ghidra --format json
```

The overview reported a 32-bit x86 PE with 9 segments, 1,679 procedures and 769 defined
strings. It also reported the RSDS PDB `Lightshot.pdb` and the Windows P0 read-only
boundary.

Additional static facts were collected with a read-only script using `pefile` and regex
string extraction. The raw evidence and screenshots stay in the local `analysis/` folder,
which is excluded from version control.

## What was not done

- No process injection, memory patching, debugging of the running app, or live API
  interception.
- No credentials or prntscr.com session used.
- No files uploaded to the vendor service.
- No Lightshot binaries or decompiled output are redistributed in this repository.

The REA repository's own `AGENTS.md` is guidance for contributing to REA; it does not
apply to Snapleaf. The REA checkout was used read-only and was not modified.
