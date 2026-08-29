# Configure WSL for Direct SSH Development

Execute autonomously. You are authorized to make normal reversible changes inside this WSL distro: install packages, edit sshd config, create directories/files, set permissions, enable services, and install tmux. Do not pause for confirmation or narrate routine work.

Hard stops only: do not reboot Windows, disable firewalls, expose services publicly, modify UniFi, destroy existing configuration, or make unrelated destructive changes.

## Goal

Configure this WSL Linux distribution as the AI/ML development SSH endpoint. Windows OpenSSH already owns TCP/22. WSL should use TCP/2222.

Desired endpoints:
- Windows TCP/22 -> PowerShell
- WSL TCP/2222 -> Linux shell

## Execute

1. Inspect distro/version, current Linux user, hostname, systemd status, WSL networking mode/IPs, existing OpenSSH configuration, listeners on 22/2222, and Windows host reachability.
2. Install OpenSSH Server if required.
3. Configure sshd on TCP/2222 with public-key auth enabled, empty passwords prohibited, sane defaults, and no unnecessary root SSH access. Keep password auth temporarily until Mac key authentication is proven.
4. Preserve/back up existing configuration before modification.
5. Create/validate `~/.ssh` and `~/.ssh/authorized_keys`; ownership must be the current Linux user, modes 700 and 600 respectively.
6. Enable/start sshd persistently, preferably via systemd where supported.
7. Install `tmux` if absent. Do not install or modify the ML/CUDA/Python stack.
8. Determine how another LAN/VPN machine should reach WSL: prefer existing WSL mirrored networking if appropriate; otherwise determine the minimal Windows-side firewall/forwarding required. Do not blindly create Windows networking rules from Linux.
9. Validate sshd config, service status, TCP/2222 listener, local SSH connectivity, authorized_keys location/permissions, and tmux.

## Windows Handoff

If Windows-side configuration is needed, provide exact elevated PowerShell commands for the Windows Codex session. Account for WSL IP changes and prefer a durable solution over a brittle static-IP portproxy when possible.

## Output

Save `~/WSL-SSH-HANDOFF.md` and copy it to the Windows Desktop if the correct Desktop path can be reliably identified.

Include distro/user, port, sshd status, authorized_keys path, networking mode, Windows-side work required, expected Mac SSH command, and WSL restart/persistence caveats.

End with only:
- WSL SSH: PASS/FAIL
- PORT: 2222
- WINDOWS FOLLOW-UP: YES/NO
- NEXT ACTION: one sentence

Do not declare remote reachability unless actually validated.