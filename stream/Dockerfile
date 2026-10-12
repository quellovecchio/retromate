# cloud-game + RetroMate patches (stream/*.patch).
# Only the coordinator and worker binaries are rebuilt; GStreamer and the rest come from the official image,
# pinned to the same commit the patches apply to.
ARG BASE=ghcr.io/giongto35/cloud-game/cloud-game@sha256:392947530bd60b1cf92be8157194b5f82345914b504ddb5834fa4136c205cf18
ARG COMMIT=1fab9ef

FROM ubuntu:resolute AS build
ARG COMMIT
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git make gcc pkg-config \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libglib2.0-dev libx11-dev libgl1-mesa-dev libvulkan-dev
ADD https://go.dev/dl/go1.27.1.linux-amd64.tar.gz /tmp/go.tgz
RUN tar -C /usr/local -xzf /tmp/go.tgz
ENV PATH=$PATH:/usr/local/go/bin
RUN git clone https://github.com/giongto35/cloud-game /src && git -C /src checkout $COMMIT
WORKDIR /src
COPY *.patch ./
RUN git apply *.patch && make build.coordinator build.worker GIT_VERSION=$COMMIT-retromate
# Dolphin (Wii) system files, unpacked here: the runtime image has no unzip
ADD https://buildbot.libretro.com/assets/system/Dolphin.zip /tmp/Dolphin.zip
RUN apt-get install -y --no-install-recommends unzip && unzip -q /tmp/Dolphin.zip -d /dolphin

# GStreamer again, the official image's build (same version, same options) plus nvcodec: NVENC hardware encoding
# (nvh264enc) for the NVIDIA host, where software VP8 took whole CPU cores from RPCS3/LRPS2. No CUDA needed to build:
# the plugin loads libcuda and libnvidia-encode at run time (mounted by nvidia-container-toolkit) and registers
# nothing without them, so the WSL2 host keeps VP8.
FROM ubuntu:resolute AS gst
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates build-essential flex bison \
    meson ninja-build python3 libglib2.0-dev liborc-0.4-dev libopus-dev libvpx-dev
RUN git clone --single-branch --depth 1 --branch 1.29.2 https://gitlab.freedesktop.org/gstreamer/gstreamer.git /gst
WORKDIR /gst
RUN sed -i '1i if get_option('"'"'doc'"'"').disabled()\n  subdir_done()\nendif' subprojects/gst-plugins-good/docs/meson.build && \
    meson setup builddir --prefix=/usr/local --buildtype=release -Doptimization=3 -Db_lto=true \
    -Dauto_features=disabled -Dextra-checks=disabled -Dbenchmarks=disabled -Dtools=disabled -Dgstreamer:tools=disabled \
    -Dbase=enabled -Dgood=enabled -Dbad=enabled -Dugly=disabled -Dlibav=disabled -Dges=disabled -Drtsp_server=disabled \
    -Drs=disabled -Dpython=disabled -Dsharp=disabled -Dintrospection=disabled -Ddoc=disabled -Dtests=disabled \
    -Dexamples=disabled -Dnls=disabled -Dorc=enabled -Dgpl=disabled -Dlibnice=disabled -Dtls=disabled \
    -Dgst-plugins-base:app=enabled -Dgst-plugins-base:videoconvertscale=enabled \
    -Dgst-plugins-base:audioresample=enabled -Dgst-plugins-base:opus=enabled -Dgst-plugins-good:vpx=enabled \
    -Dgst-plugins-bad:nvcodec=enabled && \
    meson compile -C builddir && meson install -C builddir && find /usr/local/lib -name "*.so*" -exec strip {} \;

FROM ${BASE}
# the official GStreamer, rebuilt above with nvcodec
COPY --from=gst /usr/local/lib/x86_64-linux-gnu/libgst* /usr/local/lib/x86_64-linux-gnu/
COPY --from=gst /usr/local/lib/x86_64-linux-gnu/gstreamer-1.0/ /usr/local/lib/x86_64-linux-gnu/gstreamer-1.0/
# GL goes through glvnd (libgl1), which picks the driver of the X server it talks to:
# - Docker Desktop/WSL2: Xvfb in this container + system Mesa, d3d12 on the GPU (docker-compose.wsl.yml);
#   Mesa replaces the image's bundled llvmpipe-only libGL, which stays the fallback without it.
#   (Mesa 26.2.4 from the kisak PPA was tried: Dolphin hung at boot. Ubuntu's 26.0.8 it is.)
# - Linux with the NVIDIA driver: the host's Xorg, the NVIDIA libraries mounted by nvidia-container-toolkit
#   (docker-compose.nvidia.yml, SERVER.md). Mesa is unused there.
# libxi6, libegl1, libusb: linked by the Dolphin core (Wii), even though it renders through cloud-game's GLX context.
# libopengl0, libvulkan1, libasound2t64: linked by the RPCS3 core (PS3), even in OpenGL mode; without them dlopen fails
# ("libOpenGL.so.0: cannot open shared object file"). Check a new core's DT_NEEDED before trusting the image.
RUN rm -f /usr/lib/x86_64-linux-gnu/libGL.so* && apt-get update && \
    apt-get install -y --no-install-recommends libgl1 libglx-mesa0 libgl1-mesa-dri xvfb         libxi6 libegl1 libegl-mesa0 libusb-1.0-0 \
    libopengl0 libvulkan1 libasound2t64 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /src/bin/coordinator /src/bin/worker ./
# Dolphin's Sys folder (shaders, game settings, fonts): the core looks for it in libretro/system/dolphin-emu/Sys.
COPY --from=build /dolphin /usr/local/share/cloud-game/libretro/system
