# Configure This Windows PC for Secure Remote SSH Administration

You are configuring this Windows PC so I can securely administer it remotely from my MacBook over my private home network/VPN.

This machine is a dual-purpose Windows gaming and AI/ML workstation. It also runs WSL2. I am leaving on a trip shortly, so prioritize reliability, reversibility, and avoiding lockout over cleverness.

## Objectives

Configure Microsoft OpenSSH Server on Windows and prepare this machine for SSH key-based administration from my MacBook.

I ultimately want two independent SSH destinations:

1. Windows host SSH → PowerShell
2. WSL SSH → Linux shell

This task is specifically responsible for the WINDOWS HOST. Inspect WSL and gather information needed for its separate setup, but do not unnecessarily modify WSL networking here.

## Safety Rules

- Determine the current Windows version, hostname, username, network interfaces, LAN IP addresses, WSL installation/status, and relevant firewall configuration before changing anything.
- Verify Administrator privileges. If not elevated, stop and explain how to relaunch elevated.
- Do NOT disable Windows Firewall.
- Do NOT expose SSH to the public Internet.
- Do NOT configure router port forwarding or alter UniFi/UDM settings.
- Do NOT install third-party remote-access software.
- Do NOT disable password authentication until public-key authentication has actually been tested successfully.
- Preserve existing SSH keys, authorized_keys files, sshd configuration, and firewall rules. Back up configuration before modification.
- Prefer native Microsoft/OpenSSH mechanisms and idempotent changes.

## Phase 1 — Inspect

Determine and report Windows version/build, hostname, current username/admin status, LAN IPv4 addresses, network profile, OpenSSH Client/Server installation, sshd status/start mode/configuration, SSH firewall rules, TCP/22 usage, installed/default WSL distributions, WSL version/mode, and current WSL networking/IP if discoverable.

Reconcile existing configuration with the desired state rather than blindly reinstalling things.

## Phase 2 — Configure Windows OpenSSH Server

Using Microsoft's supported Windows OpenSSH implementation:

1. Install OpenSSH Server if necessary.
2. Ensure `sshd` exists, starts automatically, and is running.
3. Enable public-key authentication.
4. Preserve password authentication temporarily as recovery until key auth is proven.
5. Configure PowerShell as the default SSH shell using Microsoft's supported mechanism if practical.
6. Create/validate the correct authorized_keys location for the current account.
7. Account for Microsoft's `administrators_authorized_keys` behavior for Administrator accounts and apply required ACLs.
8. Ensure Windows Defender Firewall permits inbound TCP/22 from private/local networks as appropriate, reusing Microsoft's existing rule if suitable rather than creating duplicates.
9. Do not create unnecessarily broad public-network exposure.

## Phase 3 — Prepare for Mac Key Registration

Do NOT generate the Mac's private key here.

Determine exactly where the Mac PUBLIC key belongs for this Windows account. Prepare the target file and ACLs so registration is trivial, and provide a safe append/idempotent procedure that does not destroy existing keys.

## Phase 4 — Local Validation

Validate that sshd configuration parses, service is running, TCP/22 is listening, firewall configuration exists, localhost reaches the Windows SSH server, PowerShell works through SSH, automatic service startup is configured, and authorized_keys path/permissions are correct.

Do not reboot automatically. If a reboot is truly required, explain why and ask first.

## Phase 5 — WSL Handoff

Inspect WSL and provide a compact handoff for a Codex session running inside the default WSL distribution. Include distro, Linux username if discoverable, Windows hostname/LAN IP, WSL networking mode/IP, mirrored-networking status, TCP/22 collision considerations, and recommended WSL SSH port.

Windows normally owns TCP/22, so prefer TCP/2222 for WSL unless the network architecture provides a clean separate address.

## Phase 6 — Produce Handoff Report

Print and save a report titled `WINDOWS SSH HANDOFF` to the Desktop as `WINDOWS-SSH-HANDOFF.md`.

Include Windows hostname, username, LAN IP, SSH port, sshd status, authorized_keys location, firewall status, PowerShell default-shell status, exact expected Mac SSH command, WSL handoff information, remaining manual actions, and anything that could prevent remote access.

Do not declare success merely because installation commands succeeded. Validate the resulting state.
