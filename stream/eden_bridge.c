// RetroMate: a libretro "core" that emulates nothing. It runs Eden, the Nintendo Switch emulator (an AppImage the user
// provides, there is no libretro Switch core), on the worker's X display and hands cloud-game what Eden shows and
// plays, so Switch games stream like any other console: same page, in-game menu, NVENC, controller.
//   video: the X screen, grabbed every retro_run through MIT-SHM (a memfd passed to the X server, so no shared IPC
//          namespace with the host is needed) as XRGB8888; Eden runs fullscreen on it.
//   audio: a private PulseAudio with a null sink as the default output; Eden plays into it, a thread records its
//          monitor into a ring buffer that retro_run drains.
//   input: a virtual gamepad (uinput) fed from RetroPad port 0. Eden reads it through SDL; its controller settings
//          (qt-config.ini, [Controls] player_0_*) are rewritten at every start to point at this pad.
// Everything Eden owns lives in <system>/switch (library/saves/switch): the AppImage and Eden's portable "user"
// folder (keys, firmware, NAND with the game saves, shader cache, config). No save states: Eden doesn't expose any.
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/uinput.h>
#include <pthread.h>
#include <signal.h>
#include <spawn.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include <pulse/error.h>
#include <pulse/simple.h>
#include <xcb/shm.h>
#include <xcb/xcb.h>

#include "libretro.h"

extern char **environ;

#define FPS 60
#define RATE 48000
#define PULSE_SOCKET "/tmp/retromate-pulse.sock"
#define RING_FRAMES (RATE / 5) // 200 ms of stereo audio; older samples are dropped rather than lag behind

static retro_environment_t env_cb;
static retro_video_refresh_t video_cb;
static retro_audio_sample_batch_t audio_cb;
static retro_input_poll_t poll_cb;
static retro_input_state_t input_cb;
static retro_log_printf_t log_cb;

static void say(enum retro_log_level level, const char *fmt, ...) {
    char msg[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);
    if (log_cb) log_cb(level, "Eden bridge: %s\n", msg);
    else fprintf(stderr, "Eden bridge: %s\n", msg);
}

// ---- processes

static pid_t eden_pid, pulse_pid;

// argv[0] is looked up in PATH; extra = "KEY=value" entries that replace or add to the worker's environment.
static pid_t spawn(char *const argv[], const char *cwd, char *const extra[]) {
    size_t n = 0, e = 0;
    while (environ[n]) n++;
    while (extra && extra[e]) e++;
    char **envp = calloc(n + e + 1, sizeof(char *));
    size_t k = 0;
    for (size_t i = 0; i < n; i++) {
        int replaced = 0;
        for (size_t j = 0; j < e && !replaced; j++)
            replaced = !strncmp(environ[i], extra[j], strcspn(extra[j], "=") + 1);
        if (!replaced) envp[k++] = environ[i];
    }
    for (size_t j = 0; j < e; j++) envp[k++] = extra[j];

    // its own session (so the whole tree is killed at once), and none of the Go runtime's blocked signals
    posix_spawnattr_t attr;
    posix_spawnattr_init(&attr);
    sigset_t none, all;
    sigemptyset(&none);
    sigfillset(&all);
    posix_spawnattr_setsigmask(&attr, &none);
    posix_spawnattr_setsigdefault(&attr, &all);
    posix_spawnattr_setflags(&attr, POSIX_SPAWN_SETSID | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF);
    posix_spawn_file_actions_t fa;
    posix_spawn_file_actions_init(&fa);
    if (cwd) posix_spawn_file_actions_addchdir_np(&fa, cwd);
    pid_t pid = 0;
    int err = posix_spawnp(&pid, argv[0], &fa, &attr, argv, envp);
    posix_spawn_file_actions_destroy(&fa);
    posix_spawnattr_destroy(&attr);
    free(envp);
    if (err) {
        say(RETRO_LOG_ERROR, "can't start %s: %s", argv[0], strerror(err));
        return 0;
    }
    return pid;
}

static void stop(pid_t *pid, const char *name) {
    if (!*pid) return;
    kill(-*pid, SIGTERM);
    for (int i = 0; i < 30 && waitpid(*pid, NULL, WNOHANG) == 0; i++) usleep(100000);
    if (kill(-*pid, SIGKILL) == 0) {
        say(RETRO_LOG_WARN, "%s didn't quit in 3 s: killed", name);
        waitpid(*pid, NULL, 0);
    }
    *pid = 0;
}

// ---- video: the X screen

static xcb_connection_t *xc;
static xcb_window_t root;
static unsigned scr_w = 1920, scr_h = 1080;
static uint8_t *frame;
static size_t frame_size;
static xcb_shm_seg_t seg;
static int shm;

static int x_open(void) {
    int num;
    xc = xcb_connect(NULL, &num);
    if (xcb_connection_has_error(xc)) {
        say(RETRO_LOG_ERROR, "can't open the X display %s", getenv("DISPLAY"));
        return 0;
    }
    xcb_screen_iterator_t it = xcb_setup_roots_iterator(xcb_get_setup(xc));
    for (int i = 0; i < num; i++) xcb_screen_next(&it);
    root = it.data->root;
    scr_w = it.data->width_in_pixels;
    scr_h = it.data->height_in_pixels;
    frame_size = (size_t)scr_w * scr_h * 4;

    xcb_shm_query_version_reply_t *v = xcb_shm_query_version_reply(xc, xcb_shm_query_version(xc), NULL);
    int fd_ok = v && (v->major_version > 1 || v->minor_version >= 2); // SHM 1.2: segments passed as file descriptors
    free(v);
    int fd = fd_ok ? memfd_create("retromate-frame", MFD_CLOEXEC) : -1;
    if (fd >= 0 && ftruncate(fd, frame_size) == 0 &&
        (frame = mmap(NULL, frame_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)) != MAP_FAILED) {
        seg = xcb_generate_id(xc);
        xcb_generic_error_t *e = xcb_request_check(xc, xcb_shm_attach_fd_checked(xc, seg, fd, 0)); // xcb closes fd
        shm = !e;
        free(e);
    } else {
        if (fd >= 0) close(fd);
        frame = NULL;
    }
    if (!shm) {
        if (frame) munmap(frame, frame_size);
        frame = malloc(frame_size);
        say(RETRO_LOG_WARN, "no MIT-SHM with file descriptors: frames come over the X socket (slower)");
    }
    say(RETRO_LOG_INFO, "capturing the X screen %s, %ux%u", getenv("DISPLAY"), scr_w, scr_h);
    return 1;
}

static int x_grab(void) {
    if (shm) {
        xcb_shm_get_image_reply_t *r = xcb_shm_get_image_reply(
            xc, xcb_shm_get_image(xc, root, 0, 0, scr_w, scr_h, ~0u, XCB_IMAGE_FORMAT_Z_PIXMAP, seg, 0), NULL);
        free(r);
        return r != NULL;
    }
    xcb_get_image_reply_t *r =
        xcb_get_image_reply(xc, xcb_get_image(xc, XCB_IMAGE_FORMAT_Z_PIXMAP, root, 0, 0, scr_w, scr_h, ~0u), NULL);
    if (!r) return 0;
    size_t len = xcb_get_image_data_length(r);
    memcpy(frame, xcb_get_image_data(r), len < frame_size ? len : frame_size);
    free(r);
    return 1;
}

static void x_close(void) {
    if (xc) {
        if (shm) xcb_shm_detach(xc, seg);
        xcb_disconnect(xc);
    }
    if (frame && shm) munmap(frame, frame_size);
    else free(frame);
    xc = NULL;
    frame = NULL;
    shm = 0;
}

// ---- audio: a private PulseAudio, its null sink's monitor recorded into a ring buffer

static int16_t ring[RING_FRAMES * 2];
static size_t ring_start, ring_len; // in frames
static pthread_mutex_t ring_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_t audio_thread;
static volatile int audio_on;

static void *record(void *arg) {
    (void)arg;
    const pa_sample_spec ss = {.format = PA_SAMPLE_S16LE, .rate = RATE, .channels = 2};
    const pa_buffer_attr ba = {.maxlength = (uint32_t)-1, .fragsize = RATE / 100 * 4}; // 10 ms reads
    pa_simple *pa = NULL;
    int err = 0;
    for (int i = 0; i < 50 && audio_on && !pa; i++) {
        pa = pa_simple_new("unix:" PULSE_SOCKET, "retromate", PA_STREAM_RECORD, "retromate.monitor", "eden", &ss, NULL,
                           &ba, &err);
        if (!pa) usleep(100000);
    }
    if (!pa) {
        say(RETRO_LOG_ERROR, "no sound: can't record PulseAudio's monitor (%s)", pa_strerror(err));
        return NULL;
    }
    int16_t buf[RATE / 100 * 2];
    while (audio_on && pa_simple_read(pa, buf, sizeof(buf), &err) == 0) {
        pthread_mutex_lock(&ring_lock);
        for (size_t f = 0; f < RATE / 100; f++) {
            if (ring_len == RING_FRAMES) ring_start = (ring_start + 1) % RING_FRAMES, ring_len--;
            size_t at = (ring_start + ring_len++) % RING_FRAMES;
            ring[at * 2] = buf[f * 2];
            ring[at * 2 + 1] = buf[f * 2 + 1];
        }
        pthread_mutex_unlock(&ring_lock);
    }
    pa_simple_free(pa);
    return NULL;
}

static void audio_start(void) {
    char *argv[] = {"pulseaudio", "-n", "--daemonize=no", "--exit-idle-time=-1", "--use-pid-file=no",
                    "-L", "module-null-sink sink_name=retromate rate=48000 channels=2",
                    "-L", "module-native-protocol-unix socket=" PULSE_SOCKET " auth-anonymous=1", NULL};
    unlink(PULSE_SOCKET);
    pulse_pid = spawn(argv, NULL, NULL);
    if (!pulse_pid) return;
    // Eden looks for its audio output once, at boot: the server must be up before it starts
    struct stat st;
    for (int i = 0; i < 50 && stat(PULSE_SOCKET, &st) != 0; i++) usleep(100000);
    ring_start = ring_len = 0;
    audio_on = 1;
    pthread_create(&audio_thread, NULL, record, NULL);
}

static void audio_push(void) {
    pthread_mutex_lock(&ring_lock);
    while (ring_len) {
        size_t n = ring_len < RING_FRAMES - ring_start ? ring_len : RING_FRAMES - ring_start;
        audio_cb(&ring[ring_start * 2], n);
        ring_start = (ring_start + n) % RING_FRAMES;
        ring_len -= n;
    }
    pthread_mutex_unlock(&ring_lock);
}

static void audio_stop(void) {
    if (audio_on) {
        audio_on = 0;
        pthread_join(audio_thread, NULL);
    }
    stop(&pulse_pid, "PulseAudio");
}

// ---- input: a virtual gamepad

// RetroPad button -> evdev code. By position, as on the Switch: RetroPad A (right) is the Switch's A, B (bottom) its B.
// SDL numbers a pad's buttons in evdev code order, which the config below relies on (sdl_button()).
static const struct { unsigned retro; unsigned short code; } BUTTONS[] = {
    {RETRO_DEVICE_ID_JOYPAD_B, BTN_SOUTH},     {RETRO_DEVICE_ID_JOYPAD_A, BTN_EAST},
    {RETRO_DEVICE_ID_JOYPAD_X, BTN_NORTH},     {RETRO_DEVICE_ID_JOYPAD_Y, BTN_WEST},
    {RETRO_DEVICE_ID_JOYPAD_L, BTN_TL},        {RETRO_DEVICE_ID_JOYPAD_R, BTN_TR},
    {RETRO_DEVICE_ID_JOYPAD_L2, BTN_TL2},      {RETRO_DEVICE_ID_JOYPAD_R2, BTN_TR2},
    {RETRO_DEVICE_ID_JOYPAD_SELECT, BTN_SELECT}, {RETRO_DEVICE_ID_JOYPAD_START, BTN_START},
    {RETRO_DEVICE_ID_JOYPAD_L3, BTN_THUMBL},   {RETRO_DEVICE_ID_JOYPAD_R3, BTN_THUMBR},
};
#define NBUTTONS (sizeof(BUTTONS) / sizeof(BUTTONS[0]))
// sticks, then the D-pad as a hat (like the xpad driver), which SDL counts apart from the axes
static const unsigned short STICKS[] = {ABS_X, ABS_Y, ABS_RX, ABS_RY};
static const struct input_id PAD_ID = {.bustype = BUS_USB, .vendor = 0x045e, .product = 0x028e, .version = 0x0110};

static int pad = -1;
static int last_btn[NBUTTONS], last_axis[4], last_hat[2];

static int pad_open(void) {
    pad = open("/dev/uinput", O_WRONLY | O_NONBLOCK | O_CLOEXEC);
    if (pad < 0) {
        say(RETRO_LOG_ERROR, "no controller: can't open /dev/uinput (%s); see SERVER.md, Switch", strerror(errno));
        return 0;
    }
    ioctl(pad, UI_SET_EVBIT, EV_KEY);
    for (size_t i = 0; i < NBUTTONS; i++) ioctl(pad, UI_SET_KEYBIT, BUTTONS[i].code);
    ioctl(pad, UI_SET_EVBIT, EV_ABS);
    for (size_t i = 0; i < 6; i++) {
        unsigned short code = i < 4 ? STICKS[i] : (i == 4 ? ABS_HAT0X : ABS_HAT0Y);
        struct uinput_abs_setup a = {.code = code};
        a.absinfo.minimum = i < 4 ? -32768 : -1;
        a.absinfo.maximum = i < 4 ? 32767 : 1;
        ioctl(pad, UI_SET_ABSBIT, code);
        ioctl(pad, UI_ABS_SETUP, &a);
    }
    struct uinput_setup s = {.id = PAD_ID};
    snprintf(s.name, sizeof(s.name), "RetroMate virtual pad");
    if (ioctl(pad, UI_DEV_SETUP, &s) < 0 || ioctl(pad, UI_DEV_CREATE) < 0) {
        say(RETRO_LOG_ERROR, "no controller: can't create the virtual pad (%s)", strerror(errno));
        close(pad);
        pad = -1;
        return 0;
    }
    memset(last_btn, 0, sizeof(last_btn));
    memset(last_axis, 0, sizeof(last_axis));
    memset(last_hat, 0, sizeof(last_hat));
    return 1;
}

static void pad_update(void) {
    if (pad < 0) return;
    struct input_event ev[NBUTTONS + 7];
    size_t n = 0;
#define EMIT(t, c, v) (ev[n++] = (struct input_event){.type = (t), .code = (c), .value = (v)})
    for (size_t i = 0; i < NBUTTONS; i++) {
        int v = input_cb(0, RETRO_DEVICE_JOYPAD, 0, BUTTONS[i].retro) != 0;
        if (v != last_btn[i]) EMIT(EV_KEY, BUTTONS[i].code, last_btn[i] = v);
    }
    for (unsigned i = 0; i < 4; i++) {
        int v = input_cb(0, RETRO_DEVICE_ANALOG, i < 2 ? RETRO_DEVICE_INDEX_ANALOG_LEFT : RETRO_DEVICE_INDEX_ANALOG_RIGHT,
                         i % 2 ? RETRO_DEVICE_ID_ANALOG_Y : RETRO_DEVICE_ID_ANALOG_X);
        if (v != last_axis[i]) EMIT(EV_ABS, STICKS[i], last_axis[i] = v);
    }
#define BTN(id) (input_cb(0, RETRO_DEVICE_JOYPAD, 0, RETRO_DEVICE_ID_JOYPAD_##id) != 0)
    int hat[2] = {BTN(RIGHT) - BTN(LEFT), BTN(DOWN) - BTN(UP)};
    for (int i = 0; i < 2; i++)
        if (hat[i] != last_hat[i]) EMIT(EV_ABS, i ? ABS_HAT0Y : ABS_HAT0X, last_hat[i] = hat[i]);
    if (!n) return;
    EMIT(EV_SYN, SYN_REPORT, 0);
    if (write(pad, ev, n * sizeof(*ev)) < 0) say(RETRO_LOG_WARN, "virtual pad write: %s", strerror(errno));
}

static void pad_close(void) {
    if (pad < 0) return;
    ioctl(pad, UI_DEV_DESTROY);
    close(pad);
    pad = -1;
}

// ---- Eden's controller settings

// SDL's GUID for the pad, as Eden stores it: bus, vendor, product, version (little endian), name CRC zeroed.
static void pad_guid(char out[33]) {
    const unsigned short v[] = {PAD_ID.bustype, 0, PAD_ID.vendor, 0, PAD_ID.product, 0, PAD_ID.version, 0};
    for (int i = 0; i < 8; i++) sprintf(out + i * 4, "%02x%02x", v[i] & 0xff, v[i] >> 8);
}

static int sdl_button(unsigned retro) {
    unsigned short code = 0;
    for (size_t i = 0; i < NBUTTONS; i++)
        if (BUTTONS[i].retro == retro) code = BUTTONS[i].code;
    int index = 0;
    for (size_t i = 0; i < NBUTTONS; i++) index += BUTTONS[i].code < code;
    return index;
}

// Switch control (Eden's key) -> RetroPad button, or a D-pad direction on the hat
static const struct { const char *key; unsigned retro; const char *hat; } CONTROLS[] = {
    {"button_a", RETRO_DEVICE_ID_JOYPAD_A, NULL},      {"button_b", RETRO_DEVICE_ID_JOYPAD_B, NULL},
    {"button_x", RETRO_DEVICE_ID_JOYPAD_X, NULL},      {"button_y", RETRO_DEVICE_ID_JOYPAD_Y, NULL},
    {"button_lstick", RETRO_DEVICE_ID_JOYPAD_L3, NULL}, {"button_rstick", RETRO_DEVICE_ID_JOYPAD_R3, NULL},
    {"button_l", RETRO_DEVICE_ID_JOYPAD_L, NULL},      {"button_r", RETRO_DEVICE_ID_JOYPAD_R, NULL},
    {"button_zl", RETRO_DEVICE_ID_JOYPAD_L2, NULL},    {"button_zr", RETRO_DEVICE_ID_JOYPAD_R2, NULL},
    {"button_plus", RETRO_DEVICE_ID_JOYPAD_START, NULL}, {"button_minus", RETRO_DEVICE_ID_JOYPAD_SELECT, NULL},
    {"button_slleft", RETRO_DEVICE_ID_JOYPAD_L, NULL}, {"button_srleft", RETRO_DEVICE_ID_JOYPAD_R, NULL},
    {"button_slright", RETRO_DEVICE_ID_JOYPAD_L, NULL}, {"button_srright", RETRO_DEVICE_ID_JOYPAD_R, NULL},
    {"button_dleft", 0, "left"},                 {"button_dup", 0, "up"},
    {"button_dright", 0, "right"},               {"button_ddown", 0, "down"},
};

// Rewrites qt-config.ini's [Controls] player_0_* (the rest of the file is Eden's): Eden reads a value only when its
// "key\default" is false. Other players and every other setting are left as they are.
static void write_controls(const char *ini) {
    char guid[33], dev[96], line[256];
    pad_guid(guid);
    snprintf(dev, sizeof(dev), "engine:sdl,port:0,guid:%s", guid);
    char *ours = NULL;
    size_t ours_len = 0;
    FILE *m = open_memstream(&ours, &ours_len);
#define SET(key, ...) (snprintf(line, sizeof(line), __VA_ARGS__), \
                       fprintf(m, "player_0_%s=%s\nplayer_0_%s\\default=false\n", key, line, key))
    SET("connected", "true");
    SET("type", "0"); // Pro Controller
    for (size_t i = 0; i < sizeof(CONTROLS) / sizeof(CONTROLS[0]); i++) {
        if (CONTROLS[i].hat) SET(CONTROLS[i].key, "%s,hat:0,direction:%s", dev, CONTROLS[i].hat);
        else SET(CONTROLS[i].key, "%s,button:%d", dev, sdl_button(CONTROLS[i].retro));
    }
    const char *stick = "offset_x:0.000000,offset_y:0.000000,invert_x:+,invert_y:+,deadzone:0.150000,range:1.000000";
    SET("lstick", "%s,axis_x:0,axis_y:1,%s", dev, stick);
    SET("rstick", "%s,axis_x:2,axis_y:3,%s", dev, stick);
    fclose(m);

    char tmp[4400];
    snprintf(tmp, sizeof(tmp), "%s.tmp", ini);
    FILE *in = fopen(ini, "r"), *out = fopen(tmp, "w");
    if (!out) {
        say(RETRO_LOG_ERROR, "can't write %s: %s", tmp, strerror(errno));
        if (in) fclose(in);
        free(ours);
        return;
    }
    int in_controls = 0, done = 0;
    char *l = NULL;
    size_t cap = 0;
    while (in && getline(&l, &cap, in) > 0) {
        if (l[0] == '[') {
            in_controls = !strncmp(l, "[Controls]", 10);
            fputs(l, out);
            if (in_controls) fputs(ours, out), done = 1;
            continue;
        }
        if (!(in_controls && !strncmp(l, "player_0_", 9))) fputs(l, out);
    }
    if (!done) fprintf(out, "\n[Controls]\n%s", ours);
    free(l);
    free(ours);
    if (in) fclose(in);
    fclose(out);
    if (rename(tmp, ini) != 0) say(RETRO_LOG_ERROR, "can't write %s: %s", ini, strerror(errno));
}

// ---- libretro

static char eden_dir[4000];

unsigned retro_api_version(void) { return RETRO_API_VERSION; }

void retro_set_environment(retro_environment_t cb) { env_cb = cb; }
void retro_set_video_refresh(retro_video_refresh_t cb) { video_cb = cb; }
void retro_set_audio_sample(retro_audio_sample_t cb) { (void)cb; }
void retro_set_audio_sample_batch(retro_audio_sample_batch_t cb) { audio_cb = cb; }
void retro_set_input_poll(retro_input_poll_t cb) { poll_cb = cb; }
void retro_set_input_state(retro_input_state_t cb) { input_cb = cb; }

void retro_init(void) {
    struct retro_log_callback log;
    if (env_cb && env_cb(RETRO_ENVIRONMENT_GET_LOG_INTERFACE, &log)) log_cb = log.log;
}

void retro_deinit(void) {}

void retro_get_system_info(struct retro_system_info *info) {
    memset(info, 0, sizeof(*info));
    info->library_name = "Eden (RetroMate bridge)";
    info->library_version = "1";
    info->valid_extensions = "nsp|xci";
    info->need_fullpath = true; // games are many GB: Eden opens the file itself
    info->block_extract = true;
}

void retro_get_system_av_info(struct retro_system_av_info *info) {
    memset(info, 0, sizeof(*info));
    info->geometry.base_width = info->geometry.max_width = scr_w;
    info->geometry.base_height = info->geometry.max_height = scr_h;
    info->geometry.aspect_ratio = (float)scr_w / scr_h;
    info->timing.fps = FPS;
    info->timing.sample_rate = RATE;
}

static int find_appimage(char *out, size_t size) {
    DIR *d = opendir(eden_dir);
    struct dirent *e;
    int found = 0;
    while (d && !found && (e = readdir(d))) {
        size_t n = strlen(e->d_name);
        if (n > 9 && !strcasecmp(e->d_name + n - 9, ".AppImage")) {
            snprintf(out, size, "%s/%s", eden_dir, e->d_name);
            found = 1;
        }
    }
    if (d) closedir(d);
    return found;
}

void retro_unload_game(void) {
    stop(&eden_pid, "Eden");
    audio_stop();
    pad_close();
    x_close();
}

bool retro_load_game(const struct retro_game_info *game) {
    if (!game || !game->path) return false;
    enum retro_pixel_format fmt = RETRO_PIXEL_FORMAT_XRGB8888;
    if (!env_cb(RETRO_ENVIRONMENT_SET_PIXEL_FORMAT, &fmt)) return false;
    const char *sys = NULL;
    env_cb(RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY, &sys);
    snprintf(eden_dir, sizeof(eden_dir), "%s/switch", sys ? sys : ".");

    char appimage[4300], path[4300];
    if (!find_appimage(appimage, sizeof(appimage))) {
        say(RETRO_LOG_ERROR, "no Eden AppImage in %s (library/saves/switch)", eden_dir);
        return false;
    }
    chmod(appimage, 0755);
    // a "user" folder in Eden's working directory makes it portable: everything it keeps goes there
    snprintf(path, sizeof(path), "%s/user", eden_dir);
    mkdir(path, 0755);
    snprintf(path, sizeof(path), "%s/user/config", eden_dir);
    mkdir(path, 0755);
    snprintf(path, sizeof(path), "%s/user/config/qt-config.ini", eden_dir);
    write_controls(path);

    if (!x_open()) return false;
    pad_open(); // before Eden starts: SDL enumerates pads at boot
    audio_start();
    // AppImages normally mount themselves with FUSE, which containers lack: unpack instead (kept in /tmp afterwards,
    // so only the first start after a container restart waits for it)
    char *argv[] = {appimage, "-f", "-g", (char *)game->path, NULL};
    char *extra[] = {"APPIMAGE_EXTRACT_AND_RUN=1", "NO_CLEANUP=1", "PULSE_SERVER=unix:" PULSE_SOCKET,
                     "SDL_JOYSTICK_DISABLE_UDEV=1", "QT_QPA_PLATFORM=xcb", NULL};
    eden_pid = spawn(argv, eden_dir, extra);
    if (!eden_pid) {
        retro_unload_game();
        return false;
    }
    say(RETRO_LOG_INFO, "started %s -f -g %s (pid %d)", appimage, game->path, eden_pid);
    return true;
}

void retro_run(void) {
    poll_cb();
    pad_update();
    video_cb(x_grab() ? frame : NULL, scr_w, scr_h, scr_w * 4); // NULL: the last frame again
    audio_push();
    int status;
    if (eden_pid && waitpid(eden_pid, &status, WNOHANG) == eden_pid) {
        say(RETRO_LOG_WARN, "Eden quit (status %d): its log is user/log/eden_log.txt", status);
        eden_pid = 0;
    }
}

void retro_reset(void) {}
void retro_set_controller_port_device(unsigned port, unsigned device) { (void)port, (void)device; }
size_t retro_serialize_size(void) { return 0; }
bool retro_serialize(void *data, size_t size) { return (void)data, (void)size, false; }
bool retro_unserialize(const void *data, size_t size) { return (void)data, (void)size, false; }
void retro_cheat_reset(void) {}
void retro_cheat_set(unsigned index, bool enabled, const char *code) { (void)index, (void)enabled, (void)code; }
bool retro_load_game_special(unsigned type, const struct retro_game_info *info, size_t num) {
    return (void)type, (void)info, (void)num, false;
}
unsigned retro_get_region(void) { return RETRO_REGION_NTSC; }
void *retro_get_memory_data(unsigned id) { return (void)id, NULL; }
size_t retro_get_memory_size(unsigned id) { return (void)id, 0; }

#ifdef EDEN_BRIDGE_TEST
// Self-check of the controller config: gcc -DEDEN_BRIDGE_TEST -I<libretro.h dir> eden_bridge.c -lxcb -lxcb-shm
// -lpulse-simple -lpulse -o /tmp/t && /tmp/t
#include <assert.h>

static int count(const char *text, const char *what) {
    int n = 0;
    for (const char *p = text; (p = strstr(p, what)); p++) n++;
    return n;
}

int main(void) {
    char guid[33];
    pad_guid(guid);
    assert(!strcmp(guid, "030000005e0400008e02000010010000"));
    assert(sdl_button(RETRO_DEVICE_ID_JOYPAD_B) == 0 && sdl_button(RETRO_DEVICE_ID_JOYPAD_A) == 1);
    assert(sdl_button(RETRO_DEVICE_ID_JOYPAD_X) == 2 && sdl_button(RETRO_DEVICE_ID_JOYPAD_Y) == 3);
    assert(sdl_button(RETRO_DEVICE_ID_JOYPAD_R3) == 11);

    const char *ini = "/tmp/eden-bridge-test.ini";
    FILE *f = fopen(ini, "w");
    fputs("[UI]\nfullscreen=true\n[Controls]\nplayer_0_button_a=engine:keyboard,code:67\n"
          "player_0_button_a\\default=true\nplayer_1_connected=false\n[Audio]\noutput_engine=auto\n", f);
    fclose(f);
    write_controls(ini);
    write_controls(ini); // a second start must not add a second copy
    char *text = NULL;
    size_t cap = 0;
    f = fopen(ini, "r");
    getdelim(&text, &cap, 0, f);
    fclose(f);
    assert(strstr(text, "[UI]\nfullscreen=true\n[Controls]\nplayer_0_connected=true\n"));
    assert(strstr(text, "player_0_button_a=engine:sdl,port:0,guid:030000005e0400008e02000010010000,button:1\n"
                        "player_0_button_a\\default=false\n"));
    assert(strstr(text, "player_0_button_dup=engine:sdl,port:0,guid:030000005e0400008e02000010010000,hat:0,direction:up"));
    assert(!strstr(text, "engine:keyboard"));
    assert(strstr(text, "player_1_connected=false\n[Audio]\noutput_engine=auto\n"));
    assert(count(text, "player_0_button_a=") == 1 && count(text, "[Controls]") == 1);
    free(text);

    unlink(ini); // no file yet (first start): the section is created
    write_controls(ini);
    f = fopen(ini, "r");
    text = NULL;
    getdelim(&text, &cap, 0, f);
    fclose(f);
    assert(strstr(text, "[Controls]\nplayer_0_connected=true\n") && count(text, "player_0_rstick=") == 1);
    free(text);
    puts("eden_bridge: ok");
    return 0;
}
#endif

