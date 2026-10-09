# Linux server setup

How to prepare a dedicated Linux machine with an NVIDIA GPU to host RetroMate: the API, the built UI and the
cloud-game stream server. On a real Linux host the containers reach the NVIDIA driver directly (`/dev/nvidia*`),
so OpenGL runs natively instead of through Mesa's d3d12 translation used under Docker Desktop/WSL2
(`docker-compose.wsl.yml`), which renders some PS2/Wii effects wrong.

Target: **Ubuntu Server 26.04 LTS**, no desktop environment (24.04 LTS is the fallback if `nvidia-container-toolkit`
doesn't support 26.04 yet: the containers don't care). Written for an RTX 3070. Commands run on the server over SSH.

## 1. BIOS/UEFI

- "Restore on AC power loss" -> **Power On**, so the server comes back after a power cut.
- Secure Boot can stay on: the drivers from `ubuntu-drivers` are signed. If a blue "MOK enrollment" screen appears
  after installing the driver, enroll the key with the password you chose. Or turn Secure Boot off.

## 2. Installer

- **Ubuntu Server** (not minimized).
- **Network:** a fixed IP, either a DHCP reservation on the router (preferred) or a manual IPv4 address. The browser
  must reach the stream at that address (`STREAM_HOST_IP`).
- **Storage:** whole disk with LVM, **no encryption** (it asks for a passphrase at every boot, and there is no screen).
  Check the size of `ubuntu-lv` in the summary: the installer often gives the root only 100 GB. Grow it to the whole
  volume group. A second disk is best kept for the library (section 11).
- **OpenSSH server:** yes.
- **Featured snaps:** none, **especially not Docker**.
- **Third-party drivers:** no, the driver is installed by hand (section 5).

## 3. First boot

```
sudo apt update && sudo apt full-upgrade -y
sudo timedatectl set-timezone Europe/Rome
sudo apt install -y git curl htop nvtop
sudo reboot
```

## 4. SSH keys, no passwords

From Windows (PowerShell):

```
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh user@SERVER_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

On the server, once a key login works:

```
sudo tee /etc/ssh/sshd_config.d/10-retromate.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin no
EOF
sudo systemctl restart ssh
```

Test a second session before closing the first one.

## 5. NVIDIA driver

```
sudo ubuntu-drivers devices
sudo apt install -y nvidia-driver-<version>-open
sudo reboot
nvidia-smi
```

Pick the newest `-open` version listed. Install the **full** driver, not the `-server` variant nor
`ubuntu-drivers install --gpgpu`: those lack the OpenGL libraries and the Xorg module the stream server needs, even
without a monitor.

## 6. Docker (official repository)

```
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in for the `docker` group. If Docker's repository has no `resolute` yet, set `Suites: noble`.

## 7. NVIDIA Container Toolkit

```
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
docker run --rm --gpus all ubuntu nvidia-smi
```

The last command must show the GPU from inside a container. The stream container also needs the `graphics` and
`display` driver capabilities (OpenGL, Xorg module): the compute-only default isn't enough.

## 8. Docker log size

Add the log options to `/etc/docker/daemon.json`, keeping the `runtimes` entry `nvidia-ctk` wrote:

```
{
  "runtimes": { "nvidia": { "args": [], "path": "nvidia-container-runtime" } },
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
```

```
sudo systemctl restart docker
```

## 9. Updates: security yes, breakage no

Keep the automatic security updates (OpenSSH, OpenSSL...) but leave out what can break the GPU stack: a driver
updated under a running system makes containers fail with `Driver/library version mismatch` until a reboot.

```
sudo tee /etc/apt/apt.conf.d/51retromate <<'EOF'
Unattended-Upgrade::Package-Blacklist {
    "linux-";
    "nvidia-";
    "libnvidia-";
    "xserver-xorg-video-nvidia";
    "docker-";
    "containerd";
};
Unattended-Upgrade::Automatic-Reboot "false";
EOF
sudo apt-mark hold $(dpkg -l | awk '/^ii/ && /nvidia/ {print $2}')
sudo sed -i 's/^Prompt=.*/Prompt=never/' /etc/update-manager/release-upgrades
sudo snap refresh --hold
```

Respectively: no automatic kernel/NVIDIA/Docker upgrades, the driver held against a manual `apt upgrade` too, no
prompt to move to the next LTS, snaps frozen (or remove snapd if `snap list` shows only system snaps).

Maintenance, when nobody is playing (e.g. monthly), then hold the driver again:

```
sudo apt-mark unhold $(apt-mark showhold)
sudo apt update && sudo apt full-upgrade
sudo reboot
nvidia-smi
```

## 10. Always on

```
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo systemctl enable --now nvidia-persistenced
```

No suspend or hibernation; the driver stays initialized, so games start faster.

## 11. Library and firewall

- **Library:** on a second disk, mount it in `/etc/fstab` by UUID (`sudo blkid`), e.g. on `/srv/retromate`. Copy ROMs
  from Windows with WinSCP, `scp` or `rsync`.
- **Firewall:** on a LAN behind a router, just don't forward any port to the server. With `ufw`, note that Docker's
  published ports (8100, 8443/udp) bypass it.

```
sudo ufw allow OpenSSH
sudo ufw allow 8000/tcp
sudo ufw enable
```

## 12. Backups

Worth keeping: `library/saves`, `library/states`, `library/options`, `library/controls` and `retromate.db`. ROMs can
be copied again. A periodic `rsync` to another machine or a NAS is enough.

## Still to do in the project

- A compose override for NVIDIA (GPU, `NVIDIA_DRIVER_CAPABILITIES`) instead of the WSL2 one.
- `stream/Dockerfile`: Xorg with the NVIDIA driver instead of Xvfb (Xvfb's GLX is Mesa software rendering only), and
  no kisak Mesa PPA.
- `systemd` services for `server.py` serving the built UI.
