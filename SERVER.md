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
  of the space (or leave ~50 GB free to grow either later), ext4, mounted at `/data` (choose *Other* in the mount
  list and type it: the list also offers `/home`, which is easy to pick by mistake). Application data goes there
  (RetroMate's library and database, section 14): a full library can't fill the system disk.
  Ended up on `/home` (`lsblk` shows `ubuntu--vg-data` on `/home`)? Don't move it over SSH (your SSH key lives in
  `/home`): show a folder of it as `/data` instead.

  ```
  sudo mkdir -p /home/data /data
  echo '/home/data /data none bind 0 0' | sudo tee -a /etc/fstab
  sudo systemctl daemon-reload && sudo mount /data && findmnt /data
  ```
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

CPU governor `performance` instead of Ubuntu's `powersave`: RPCS3 (PS3) and LRPS2 lose speed when the CPU ramps its
clock up slowly. Idle cores still sleep, so idle power grows by a few watts at most. A service sets it at every boot:

```
sudo tee /etc/systemd/system/cpu-performance.service <<'EOF'
[Unit]
Description=CPU governor performance (emulators)

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now cpu-performance
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor | sort | uniq -c
```

The last line must print `16 performance` (one per CPU thread). Undo with
`sudo systemctl disable --now cpu-performance` and a reboot.

GPU power cap: Ampere cards draw short spikes well above their rated power, and a power supply that can't follow
drops the card off the bus mid-game (`dmesg` shows `Xid 79`: "GPU has fallen off the bus"). A lower power limit and a
clock cap (the RTX 3070 defaults to 220 W) remove most of the spikes for a few percent of speed. `nvidia-smi` forgets
both at reboot, hence the service:

```
nvidia-smi -q -d POWER | grep -i limit
sudo tee /etc/systemd/system/nvidia-power.service <<'EOF'
[Unit]
Description=GPU power limit and clock cap
After=nvidia-persistenced.service

[Service]
Type=oneshot
ExecStart=/usr/bin/nvidia-smi -pl 170
ExecStart=/usr/bin/nvidia-smi -lgc 210,1700
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now nvidia-power
nvidia-smi -q -d POWER,CLOCK | grep -i -E 'current power limit|applications clocks|locked'
```

The first line shows the card's allowed range: `-pl` must sit between its Min and Max Power Limit. Undo with
`sudo systemctl disable --now nvidia-power && sudo nvidia-smi -rgc && sudo nvidia-smi -pl 220`.

## 11. Library and firewall

- **Library:** `/data/retromate/library` (section 14), on the `data` volume, copied from Windows over Samba
  (section 15).
- **Firewall:** on a LAN behind a router, just don't forward any port to the server. With `ufw`, note that Docker's
  published ports (8100, 8443/udp) bypass it.

```
sudo ufw allow OpenSSH
sudo ufw allow 8000/tcp
sudo ufw enable
```

## 12. Backups

Worth keeping, all in `/data/retromate`: `library/saves` (Switch keys and firmware included), `library/states`,
`library/options`, `library/controls` and `retromate.db`. ROMs can be copied again. A periodic `rsync` to another machine or a NAS is enough.

## 13. Headless Xorg on the GPU

cloud-game creates its OpenGL context with GLX, so it needs an X server, and the X server decides which driver
renders. The image's Xvfb only knows Mesa's software renderer: on this host the stream uses the host's own Xorg
running on the NVIDIA driver, no monitor needed (display `:0`; `docker-compose.nvidia.yml` shares its socket).

Xorg wants the GPU's PCI address in **decimal**, while `nvidia-smi` prints it in hexadecimal (`00000000:10:00.0` is
`PCI:16:0:0`, not `PCI:10:0:0`): the first lines convert it.

```
sudo apt install -y xserver-xorg-core mesa-utils
IFS=':.' read -r _ b d f <<< "$(nvidia-smi --query-gpu=pci.bus_id --format=csv,noheader)"
BUSID=$(printf 'PCI:%d:%d:%d' 0x$b 0x$d 0x$f); echo $BUSID
sudo tee /etc/X11/xorg.conf <<EOF
Section "ServerFlags"
    Option "AutoAddDevices" "false"
EndSection
Section "Device"
    Identifier "nvidia"
    Driver     "nvidia"
    BusID      "$BUSID"
    Option     "AllowEmptyInitialConfiguration" "true"
EndSection
Section "Screen"
    Identifier   "screen"
    Device       "nvidia"
    Option       "UseDisplayDevice" "none"
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
ExecStart=/usr/lib/xorg/Xorg :0 -nolisten tcp -noreset -sharevts -novtswitch vt7
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now xorg-headless
DISPLAY=:0 glxinfo -B | grep -E 'renderer|version'
```

The last line must name the GPU (`OpenGL renderer string: NVIDIA GeForce RTX 3070/PCIe/SSE2`), not `llvmpipe`.
Xorg leaves the console alone: `-sharevts` makes it neither switch to its VT nor put it in graphics mode,
`UseDisplayDevice none` keeps the GPU off a plugged-in monitor and `AutoAddDevices false` keeps the keyboard for the
text console (it would otherwise type into the games). Nothing changes for the stream: the X screen was never shown.
If it doesn't, `journalctl -u xorg-headless` and `/var/log/Xorg.0.log` say why: a wrong `BusID` is the usual one
("Start request repeated too quickly": Xorg exits at once). When it works, the log has `NVIDIA(0)` lines ending with
`[DRI2] Setup complete`. The NVIDIA Xorg module comes with the full `nvidia-driver-*-open` package of section 5, not
with the `-server`/headless ones (Ubuntu keeps it in `/usr/lib/x86_64-linux-gnu/nvidia/xorg/`).

## 14. RetroMate

The code lives in `/srv/retromate`, the data in `/data/retromate`: the library (`roms`, `bios`, `saves`, `states`,
`options`, `controls`) and the database. Both the API and Docker Compose find the data through `RETROMATE_LIBRARY`
and `RETROMATE_DB` in the project's `.env` (without them: `library/` and `retromate.db` in the project folder). The
Python and Node tools are only needed on the host for the API and to build the UI; the stream server runs in Docker.

Fetching into the folder instead of `git clone` also works when it is the root of a volume (`lost+found` makes
`git clone` refuse it). A private repository asks for a GitHub token (or use an SSH key with the `git@github.com:` URL).

```
sudo mkdir -p /srv/retromate /data/retromate/library
sudo chown $USER: /srv/retromate /data/retromate /data/retromate/library
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

The host's settings, in `.env` (not versioned): Docker Compose with the NVIDIA override, where the browser reaches
the stream, and where the data is.

```
cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.nvidia.yml
STREAM_HOST_IP=$(ip route get 1.1.1.1 | grep -o 'src [0-9.]*' | cut -d' ' -f2)
RETROMATE_LIBRARY=/data/retromate/library
RETROMATE_DB=/data/retromate/retromate.db
EOF
cat .env
```

`STREAM_HOST_IP` must be the server's LAN address (check the `cat`). Copy the library from Windows (section 15), then
start the stream server:

```
docker compose up -d --build
```

The API as a service, listening on the LAN, with the same `.env`:

```
sudo tee /etc/systemd/system/retromate.service <<EOF
[Unit]
Description=RetroMate (API and UI)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=/srv/retromate
EnvironmentFile=/srv/retromate/.env
ExecStart=$HOME/.local/bin/uv run --frozen uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now retromate
```

Open `http://SERVER_IP:8000` from another machine. For HTTPS on a name (`https://retromate.<domain>`) and access over
the VPN, the reverse proxy in `../homeserver` sends `/ws` to cloud-game and everything else here (`homeserver/GUIDA.md`). To update: `git pull`, `npm --prefix web run build` if the UI
changed, `sudo systemctl restart retromate`, and `docker compose up -d --build` if `stream/` changed.

To check that a streamed game renders on the GPU, start one and look for the NVIDIA renderer in the log (Dolphin
prints it: `Video Info: NVIDIA Corporation, NVIDIA GeForce RTX 3070...`):

```
docker compose logs cloud-game | grep -i -E 'video info|renderer'
```

The video is encoded on the GPU too (NVENC, H.264: `docker-compose.nvidia.yml`). While a game streams, the `enc`
column of `nvidia-smi dmon -s u` is above 0. A black stream with `gst pipeline error` in the log, or `no element
"nvh264enc"`, means GStreamer found no NVENC: delete the `CLOUD_GAME_ENCODER_VIDEO_CODEC` line from
`docker-compose.nvidia.yml` and `docker compose up -d` to go back to software VP8.

## 15. Copying the library over Samba

A network share on `/data/retromate`, to drag and drop from Windows. Files written through it belong to your user,
like everything else in the folder.

```
sudo apt install -y samba
sudo tee -a /etc/samba/smb.conf <<EOF

[retromate]
   path = /data/retromate
   valid users = $USER
   force user = $USER
   read only = no
   create mask = 0644
   directory mask = 0755
EOF
sudo smbpasswd -a $USER
sudo systemctl restart smbd
sudo ufw allow Samba
```

`smbpasswd` asks for a Samba password (it can differ from the login one). The last line opens the firewall of
section 11: without it Windows answers "network name not found" (error 0x80070043) although SSH works.

On Windows, open `\\SERVER_IP\retromate` in Explorer (or *Map network drive* to keep it as a drive letter), sign in
with your server user name and the Samba password, and drop the contents of the project's `library` folder into
`library` there. For tens of GB `robocopy` is sturdier than drag and drop: it resumes after an interruption and copies
in parallel (PowerShell, adapt the source path):

```
robocopy C:\Progetti\Altro\retromate\library \\SERVER_IP\retromate\library /E /Z /MT:8
```

Over wired gigabit expect roughly 100 MB/s (90 GB in about 15 minutes); Wi-Fi is much slower. Copy the database too
(`retromate.db` from the project folder into `\\SERVER_IP\retromate`) to keep play time, favourites and recent games:
if RetroMate already runs on the server, stop it first (`sudo systemctl stop retromate`) so it doesn't overwrite the
file you drop in, then start it again.

The stream container runs as root: folders Docker creates for its volumes, and files the emulators write (memory
cards, Wii NAND, states), belong to root, and Samba (your user) can't overwrite them ("Access denied", error 5, in
robocopy). Give them back before copying, with the container stopped:

```
cd /srv/retromate && docker compose stop cloud-game
sudo chown -R $USER: /data/retromate && sudo chmod -R u+rwX /data/retromate
```

## 16. Updating

After a `git push` from the development machine:

```
cd /srv/retromate
git pull origin main
uv sync && npm --prefix web ci && npm --prefix web run build
sudo systemctl restart retromate
docker compose up -d --build
```

`--build` rebuilds the stream image when `stream/Dockerfile` or `stream/cloud-game.patch` changed (the Go build takes
a few minutes), and `up -d` recreates the container when its configuration changed (`stream/config.yaml`,
`docker-compose*.yml`). A failed build leaves the running container as it was: the error is in the build output.

## 17. PS3 (RPCS3)

Before the first start, as your user (so Docker doesn't create them as root):

```
mkdir -p /data/retromate/library/roms/ps3 /data/retromate/library/bios/ps3 /data/retromate/library/saves/ps3/rpcs3
```

- **Firmware:** download `PS3UPDAT.PUP` from Sony's PlayStation 3 system software update page and put it in
  `library/bios/ps3`. RPCS3 installs it on the first PS3 start (a few minutes: the browser shows the loading message
  meanwhile); the installed copy stays in `library/saves/ps3/rpcs3/dev_flash`.
- **Games:** `.iso` files in `library/roms/ps3`, decrypted, or redump images with their `.dkey` (same name) beside
  them. The first start of each game compiles it (minutes, then cached in `library/saves/ps3/rpcs3/cache`).
- **Saves:** in the PS3's own storage, `library/saves/ps3/rpcs3/dev_hdd0` (back it up with the rest). There are no
  save states: RPCS3 can't make them, so the in-game menu's Salva stato fails for PS3 games.
- RPCS3 is very CPU-heavy: expect it to be the limit, not the GPU.

## 18. Switch (Eden)

There is no libretro core for the Switch. RetroMate's own bridge core (`stream/eden_bridge.c`) runs Eden, a Switch
emulator, on the GPU's X display and streams it like any other console. Eden itself is not in the image: you provide
it, along with the keys and firmware from **your own** Switch.

Load the kernel's `uinput` module, now and at every boot: the bridge creates a virtual gamepad for Eden through it, and
`docker-compose.nvidia.yml` passes `/dev/uinput` to the container (without the module, the stream server won't start):

```
sudo modprobe uinput && echo uinput | sudo tee /etc/modules-load.d/uinput.conf
mkdir -p /data/retromate/library/roms/switch /data/retromate/library/saves/switch/user/keys
```

Then `docker compose up -d --build`. Everything Eden uses is in `library/saves/switch` (backed up with the saves):

- **Eden:** the Linux AppImage (`Eden-*.AppImage`) from the official site, https://eden-emu.dev, straight into
  `library/saves/switch`. Not from GitHub search results: many repositories there are fakes that ship malware.
  The first start after a container restart unpacks it (some seconds more).
- **Keys:** `prod.keys` (and `title.keys`, if you have them) dumped from your console, in
  `library/saves/switch/user/keys`.
- **Firmware:** dumped from your console, its `.nca` files in `library/saves/switch/user/nand/system/Contents/registered`.
- **Games:** `.nsp` or `.xci` in `library/roms/switch`. Updates and DLC aren't installed by RetroMate.
- **Saves:** the Switch's own, in `library/saves/switch/user/nand/user/save`. No save states: Eden has none to offer.

`user` is Eden's portable folder: its settings are `user/config/qt-config.ini`, where the bridge rewrites the
`player_0_*` controller entries at every start (any other setting you change there stays). Problems: the worker's
`Eden bridge:` lines (`docker compose logs cloud-game | grep -i eden`) and Eden's own log, `user/log/eden_log.txt`.
