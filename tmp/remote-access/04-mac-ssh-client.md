# Configure MacBook SSH Access to AI Workstation

Execute autonomously. You are authorized to make normal reversible SSH client changes on this Mac, generate a dedicated key if appropriate, modify `~/.ssh/config` while preserving existing entries, register PUBLIC keys on the Windows and WSL endpoints, and test connections. Do not pause for routine confirmations.

Never expose/copy private-key material. Never overwrite existing keys/config without backup. Do not weaken host-key verification globally or modify UniFi/router/firewall configuration.

## Goal

Create convenient tested SSH access to:
- `ai5090` -> Windows PowerShell on TCP/22
- `ai5090-wsl` -> WSL Linux on TCP/2222

## Execute

1. Inspect macOS version, username, `~/.ssh`, existing keys/config, ssh-agent/Keychain integration, and relevant known_hosts entries.
2. Obtain target Windows hostname/IP, Windows username, and WSL username from me only if they cannot be reliably determined from supplied handoff information. Do not guess credentials.
3. Reuse an appropriate dedicated Ed25519 key if one already exists; otherwise create `~/.ssh/id_ed25519_ai5090` with a useful comment. Use macOS Keychain integration where supported.
4. Register ONLY the public key with Windows. Determine the correct Windows OpenSSH authorized-keys destination, including Administrator-account `administrators_authorized_keys` behavior and ACL requirements. Append idempotently; do not overwrite existing keys.
5. Register the same public key with WSL on TCP/2222. Ensure Linux `.ssh` ownership/modes are correct.
6. Safely add SSH config aliases `ai5090` and `ai5090-wsl` with HostName, User, Port, IdentityFile, IdentitiesOnly yes, and appropriate macOS Keychain options.
7. Actually test `ssh ai5090`: verify expected Windows host/user, PowerShell, and PUBLIC-KEY authentication.
8. Actually test `ssh ai5090-wsl`: verify expected distro/user/shell, PUBLIC-KEY authentication, and tmux availability.
9. Use verbose SSH diagnostics if needed and fix ordinary issues autonomously.

## Travel Acceptance Test

Create a checklist requiring me to test from a non-home network (prefer iPhone hotspot): connect UniFi Teleport, then run both `ssh ai5090` and `ssh ai5090-wsl`. This off-LAN Teleport test is the final acceptance test and must not be falsely marked complete.

Save `~/Desktop/AI5090-REMOTE-ACCESS.md` containing aliases/endpoints/users/ports, public key fingerprint (never private key), connection/diagnostic commands, tmux start/reconnect commands, Teleport test checklist, remaining password dependencies, and unresolved risks.

End with only:
- WINDOWS SSH: PASS/FAIL
- WSL SSH: PASS/FAIL
- KEY AUTH: PASS/FAIL
- TELEPORT TEST: NOT TESTED/PASS/FAIL
- READY TO TRAVEL: YES/NO

Do not say READY TO TRAVEL YES until Windows and WSL key authentication pass. Teleport remains a separate final acceptance test if not yet performed.