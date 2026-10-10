# Linux server setup

How to prepare a dedicated Linux machine with an NVIDIA GPU to host RetroMate: the API, the built UI and the
cloud-game stream server. On a real Linux host the containers reach the NVIDIA driver directly (`/dev/nvidia*`),
so OpenGL runs natively instead of through Mesa's d3d12 translation used under Docker Desktop/WSL2
(`docker-compose.wsl.yml`), which renders some PS2/Wii effects wrong.

Target: **Ubuntu Server 26.04 LTS**, no desktop environment (24.04 LTS is the fallback if `nvidia-container-toolkit`
doesn't support 26.04 yet: the containers don't care). Written for an RTX 3070. Commands run on the server over SSH.
Before pasting a multi-line block, run `sudo -v`: otherwise `sudo` asks for the password and swallows the pasted lines.

## 1. BIOS/UEFI

- "Restore on AC power loss" -> **Power On**, so the server comes back after a power cut.
- Secure Boot can stay on: the drivers from `ubuntu-drivers` are signed. If a blue "MOK enrollment" screen appears
  after installing the driver, enroll the key with the password you chose. Or turn Secure Boot off.

## 2. Installer

- **Ubuntu Server** (not minimized).
- **Network:** a fixed IP, either a DHCP reservation on the router (preferred) or a manual IPv4 address. The browser
  must reach the stream at that address (`STREAM_HOST_IP`).
- **Storage:** whole disk with LVM, **no encryption** (it asks for a passphrase at every boot, and there is no screen).
  The installer gives the root (`ubuntu-lv`) only 100 GB of the volume group (`ubuntu-vg`) and leaves the rest free.
  Set `ubuntu-lv` to 150 GB (Edit -> Size), then on `ubuntu-vg` choose Create Logical Volume: name `data`, the rest
  of the space (or leave ~50 GB free to grow either later), ext4, mounted at `/srv/retromate`. The project and its
  library go there (section 14): a full library can't fill the system disk.
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

From Windows (PowerShell), one command at a time. Only if `%USERPROFILE%\.ssh\id_ed25519.pub` doesn't exist yet
(otherwise it offers to overwrite a key you may use elsewhere), create a key; it asks questions, so run it alone:

```
ssh-keygen -t ed25519
```

Then copy it to the server (it asks the server password one last time):

```
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh user@SERVER_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

On the server, once a key login works:

```
printf 'PasswordAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/10-retromate.conf
sudo systemctl restart ssh
```

Test a second session before closing the first one. The `10-` prefix matters: sshd keeps the first value it reads, in
file name order, and cloud-init may have written `PasswordAuthentication yes` in `50-cloud-init.conf`.

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

- **Library:** it lives in the project folder, `/srv/retromate/library` (section 14), on the `data` volume. Copy ROMs
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

## 13. Headless Xorg on the GPU

cloud-game creates its OpenGL context with GLX, so it needs an X server, and the X server decides which driver
renders. The image's Xvfb only knows Mesa's software renderer: on this host the stream uses the host's own Xorg
running on the NVIDIA driver, no monitor needed (display `:0`; `docker-compose.nvidia.yml` shares its socket).

```
sudo apt install -y xserver-xorg-core mesa-utils
nvidia-smi --query-gpu=pci.bus_id --format=csv,noheader
```

The second command prints something like `00000000:01:00.0`: bus `01`, device `00`, function `0`. Xorg wants them in
**decimal**: `PCI:1:0:0` (a bus `0a` would be `PCI:10:0:0`). Put it in the `BusID` line below:

```
sudo tee /etc/X11/xorg.conf <<'EOF'
Section "Device"
    Identifier "nvidia"
    Driver     "nvidia"
    BusID      "PCI:1:0:0"
    Option     "AllowEmptyInitialConfiguration" "true"
EndSection
Section "Screen"
    Identifier   "screen"
    Device       "nvidia"
    DefaultDepth 24
    SubSection "Display"
        Depth   24
        Virtual 1920 1080
    EndSubSection
EndSection
EOF
sudo tee /etc/systemd/system/xorg-headless.service <<'EOF'
[Unit]
Description=Headless Xorg on the NVIDIA GPU (display :0, for cloud-game)
After=systemd-user-sessions.service

[Service]
ExecStart=/usr/lib/xorg/Xorg :0 -nolisten tcp -noreset vt7
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now xorg-headless
DISPLAY=:0 glxinfo -B | grep -E 'renderer|version'
```

The last line must name the GPU (`OpenGL renderer string: NVIDIA GeForce RTX 3070/PCIe/SSE2`), not `llvmpipe`.
If it doesn't, `journalctl -u xorg-headless` and `/var/log/Xorg.0.log` say why: a wrong `BusID` is the usual one, or
the driver's Xorg module is missing (`/usr/lib/xorg/modules/drivers/nvidia_drv.so`: it comes with the full
`nvidia-driver-*-open` package of section 5, not with the `-server`/headless ones).

## 14. RetroMate

The project lives in `/srv/retromate` (the `data` volume), library included. The Python and Node tools are only needed
on the host for the API and to build the UI; the stream server runs in Docker.

The volume already holds `lost+found`, so `git clone` refuses it: fetch into it instead. A private repository asks for
a GitHub token (or use an SSH key with the `git@github.com:` URL).

```
sudo chown $USER: /srv/retromate
cd /srv/retromate
git init -b main
git remote add origin https://github.com/quellovecchio/retromate.git
git pull origin main
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo apt install -y nodejs npm
```

Log out and back in (uv adds itself to the `PATH`), then:

```
cd /srv/retromate
uv sync
npm --prefix web ci
npm --prefix web run build
```

Vite needs Node 20.19+ or 22.12+ (`node -v`); if Ubuntu's is older, install Node from NodeSource instead.

Copy the library from Windows into `/srv/retromate/library` (same layout: `roms`, `bios`, `saves`, `states`,
`options`, `controls`). Then tell Docker Compose to use the NVIDIA override and where the browser reaches the stream:

```
printf 'COMPOSE_FILE=docker-compose.yml:docker-compose.nvidia.yml\nSTREAM_HOST_IP=%s\n' "$(ip route get 1.1.1.1 | grep -o 'src [0-9.]*' | cut -d' ' -f2)" > .env
cat .env
docker compose up -d --build
```

`STREAM_HOST_IP` must be the server's LAN address (check the `cat`). The API as a service, listening on the LAN:

```
sudo tee /etc/systemd/system/retromate.service <<EOF
[Unit]
Description=RetroMate (API and UI)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=/srv/retromate
ExecStart=$HOME/.local/bin/uv run --frozen uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now retromate
```

Open `http://SERVER_IP:8000` from another machine. To update: `git pull`, `npm --prefix web run build` if the UI
changed, `sudo systemctl restart retromate`, and `docker compose up -d --build` if `stream/` changed.

To check that a streamed game renders on the GPU, start one and look for the NVIDIA renderer in the log (Dolphin
prints it: `Video Info: NVIDIA Corporation, NVIDIA GeForce RTX 3070...`):

```
docker compose logs cloud-game | grep -i -E 'video info|renderer'
```
