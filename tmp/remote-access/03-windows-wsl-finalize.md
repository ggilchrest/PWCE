# Finalize Windows Networking for WSL SSH

Execute autonomously. You are authorized to make normal reversible Windows networking/firewall changes necessary to expose the already-configured WSL SSH endpoint to my private LAN/VPN.

Read `WINDOWS-SSH-HANDOFF.md` and locate/read `WSL-SSH-HANDOFF.md` first.

Expected endpoints:
- Windows TCP/22 -> PowerShell
- WSL TCP/2222 -> Linux SSH

Inspect and validate the WSL recommendations rather than blindly executing them.

Create only the necessary Windows firewall/forwarding configuration. Prefer durable WSL mirrored-networking/native behavior where supported over brittle static-IP forwarding. If portproxy or another forwarding mechanism is necessary, configure it robustly and document how WSL IP changes are handled.

Do not expose either endpoint through the Internet router. Do not modify UniFi. Do not disable Windows Firewall. Do not reboot unless absolutely necessary and explicitly approved.

Validate Windows TCP/22 still works and WSL TCP/2222 is reachable through the Windows LAN interface as far as can be tested locally.

Update `WINDOWS-SSH-HANDOFF.md` with final configuration and expected Mac commands.

End with only:
- WINDOWS SSH 22: PASS/FAIL
- WSL SSH 2222 ROUTING: PASS/FAIL
- MAC TEST READY: YES/NO
- NEXT ACTION: one sentence