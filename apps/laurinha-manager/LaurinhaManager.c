/* ===========================================================================
 * Laurinha Manager - gerenciador Windows nativo da biblioteca da TV
 * ---------------------------------------------------------------------------
 * C puro sobre Win32. Sem console, DPI aware, Unicode, tema "Cerejinha".
 * Bibliotecas: comctl32, shell32, ole32 (mais gdi32/user32/advapi32 do SDK).
 *
 * O programa NAO copia nem embute MP3/fotos em pacote nenhum: ele apenas
 * cataloga arquivos que continuam onde estao e publica um manifesto JSON
 * (hub/manifest.json) que o Hub e a TV consomem.
 *
 * Compilar: build.cmd (Visual Studio Build Tools 2022)
 * ===========================================================================
 */

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#define _CRT_SECURE_NO_WARNINGS
#define NTDDI_VERSION 0x06000000
#define _WIN32_WINNT  0x0600

#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <objbase.h>
#include <strsafe.h>
#include <stdlib.h>
#include <math.h>
#include <wctype.h>
#include <ctype.h>
#include <string.h>
#include <stdarg.h>

#include "resource.h"

/* Presente apenas nos SDKs com suporte a Per-Monitor DPI. */
#ifndef WM_DPICHANGED
#define WM_DPICHANGED 0x02E0
#endif

/* --------------------------------------------------------------------------
 * Identidade
 * -------------------------------------------------------------------------- */
#define APP_NAME        L"Laurinha Manager"
#define APP_VERSION     L"5.0.0"
#define APP_CLASS       L"LaurinhaManagerWindow"
#define PREVIEW_CLASS   L"LaurinhaPreviewWindow"
#define MANIFEST_SCHEMA L"laurinha.hub.manifest/1"

#define DIR_MUSIC       L"MINHAS_MUSICAS"
#define DIR_PHOTOS      L"FOTOS_LAURINHA"
#define DIR_HUB         L"hub"

/* --------------------------------------------------------------------------
 * Tema Cerejinha (discreto: fundo claro, acento cereja usado com parcimonia)
 * -------------------------------------------------------------------------- */
#define CLR_WINDOW      RGB(0xFA, 0xF7, 0xF8)
#define CLR_SURFACE     RGB(0xFF, 0xFF, 0xFF)
#define CLR_RAIL        RGB(0xF3, 0xEC, 0xEE)
#define CLR_BORDER      RGB(0xE6, 0xDD, 0xE1)
#define CLR_TEXT        RGB(0x1F, 0x1A, 0x1C)
#define CLR_MUTED       RGB(0x6E, 0x64, 0x70)
#define CLR_ACCENT      RGB(0x9E, 0x2A, 0x40)
#define CLR_ACCENT_HOT  RGB(0xB8, 0x3B, 0x54)
#define CLR_ACCENT_SOFT RGB(0xF4, 0xE6, 0xEA)
#define CLR_OK          RGB(0x2E, 0x7D, 0x53)
#define CLR_WARN        RGB(0xB5, 0x7A, 0x12)
#define CLR_OFF         RGB(0x9A, 0x93, 0x9C)

/* --------------------------------------------------------------------------
 * Paginas e identificadores de controle
 * -------------------------------------------------------------------------- */
enum { PAGE_MUSIC = 0, PAGE_PHOTOS, PAGE_FRAME, PAGE_STATUS, PAGE_COUNT };

#define IDC_NAV_FIRST       2000   /* 2000..2003 */
#define IDC_CMD_FIRST       2010   /* 2010..2015 */
#define IDC_CMD_COUNT       6

#define IDC_MUS_PLAYLISTS   2100
#define IDC_MUS_NEW         2101
#define IDC_MUS_RENAME      2102
#define IDC_MUS_DELETE      2103
#define IDC_MUS_TRACKS      2104
#define IDC_MUS_ADD         2105
#define IDC_MUS_UP          2106
#define IDC_MUS_DOWN        2107
#define IDC_MUS_REMOVE      2108

#define IDC_PHO_ALBUMS      2200
#define IDC_PHO_NEW         2201
#define IDC_PHO_RENAME      2202
#define IDC_PHO_DELETE      2203
#define IDC_PHO_GRID        2204
#define IDC_PHO_ADD         2205
#define IDC_PHO_UP          2206
#define IDC_PHO_DOWN        2207
#define IDC_PHO_REMOVE      2208
#define IDC_PHO_COVER       2209
#define IDC_PHO_SORTMODE    2210
#define IDC_PHO_SORTAPPLY   2211
#define IDC_PHO_INTERVAL    2212

#define IDC_FR_SECONDS      2300
#define IDC_FR_FADE         2301
#define IDC_FR_RANDOM       2302
#define IDC_FR_CAPTION      2303
#define IDC_FR_FRAME        2304
#define IDC_FR_BG           2305
#define IDC_FR_PASSE        2306

#define IDC_ST_CHECK        2400
#define IDC_ST_SETTINGS     2401
#define IDC_ST_FOLDER       2402

/* Mensagens internas */
#define WM_APP_THUMB_READY  (WM_APP + 1)
#define WM_APP_TASK_DONE    (WM_APP + 2)
#define WM_APP_PREVIEW_IMG  (WM_APP + 3)

#define THUMB_PX            112
#define PREVIEW_TIMER       1
#define PREVIEW_FADE_TIMER  2
#define PREVIEW_FADE_MS     40
#define PREVIEW_FADE_STEPS  16

/* --------------------------------------------------------------------------
 * Modelo de dados
 * -------------------------------------------------------------------------- */
typedef struct {
    int      uid;              /* identidade estavel; sobrevive a reordenacoes */
    WCHAR    path[MAX_PATH];
    WCHAR    title[160];
    FILETIME written;
    BOOL     missing;
    int      thumb;            /* indice no image list, -1 = pendente */
} MediaItem;

typedef struct {
    WCHAR  name[96];
    int   *ids;                /* indices na biblioteca correspondente */
    int    count, cap;
    int    cover;              /* apenas album: indice da biblioteca, -1 = auto */
    int    interval;           /* apenas album: segundos do slideshow */
} Collection;

typedef struct {
    MediaItem *items;
    int        count, cap;
} MediaList;

typedef struct {
    Collection *items;
    int         count, cap;
} CollectionList;

typedef struct {
    WCHAR **items;
    int     count, cap;
} StrList;

typedef struct {
    int  seconds;              /* tempo por foto */
    BOOL fade;
    BOOL random;
    BOOL caption;
    int  frame;                /* 0..3 - moldura */
    int  background;           /* 0..3 - fundo */
    int  passepartout;         /* 0..25 (%) */
} FrameSettings;

enum { ST_OFF = 0, ST_WARN, ST_OK };

typedef struct {
    WCHAR label[64];
    WCHAR detail[256];
    int   state;
} StatusRow;

enum {
    STATUS_LG = 0, STATUS_HUB, STATUS_HA, STATUS_MUSIC, STATUS_PHOTOS,
    STATUS_COUNT
};

/* --------------------------------------------------------------------------
 * Estado global
 * -------------------------------------------------------------------------- */
static HINSTANCE     g_inst;
static HWND          g_main;
static int           g_page = PAGE_MUSIC;
static int           g_dpi = 96;

static HFONT         g_fontUI, g_fontBold, g_fontTitle, g_fontSmall;
static HBRUSH        g_brWindow, g_brSurface, g_brRail;

static int            g_nextUid = 1;
static MediaList      g_tracks;
static MediaList      g_photos;
static CollectionList g_playlists;
static CollectionList g_albums;
static StrList        g_musicRoots;
static StrList        g_photoRoots;

static FrameSettings g_frame = { 12, TRUE, FALSE, TRUE, 1, 0, 6 };
static StatusRow     g_status[STATUS_COUNT];

static WCHAR g_root[MAX_PATH];
static WCHAR g_hubUrl[512]    = L"http://localhost:8787/";
static WCHAR g_lgDevice[96]   = L"";
static WCHAR g_lgIp[64]       = L"";
static WCHAR g_ipkPath[MAX_PATH] = L"";
static WCHAR g_haUrl[512]     = L"";
static WCHAR g_aresPath[MAX_PATH] = L"ares-install";

static int   g_curPlaylist = 0;    /* 0 = biblioteca completa */
static int   g_curAlbum    = 0;    /* 0 = todas as fotos */
static BOOL  g_dirty       = FALSE;
static WCHAR g_busy[160]   = L"";

static HIMAGELIST g_thumbs;
static HANDLE     g_thumbThread;
static volatile LONG g_thumbStop;

static HWND  g_navBtn[PAGE_COUNT];
static HWND  g_cmdBtn[IDC_CMD_COUNT];
static HWND  g_hover;

/* Geometria calculada em Layout() e reutilizada na pintura */
static RECT  g_rcHeader, g_rcRail, g_rcContent, g_rcCommands;
static RECT  g_rcFramePreview, g_rcStatusList;

/* --------------------------------------------------------------------------
 * Prototipos
 * -------------------------------------------------------------------------- */
static void  Layout(void);
static void  ShowPage(int page);
static void  RefreshMusicUI(void);
static void  RefreshPhotoUI(void);
static void  RefreshFrameUI(void);
static void  RecomputeStatus(void);
static BOOL  SaveState(void);
static BOOL  LoadState(void);
static BOOL  PublishManifest(WCHAR *errOut, int errCch);
static void  StartThumbnailWorker(void);
static void  StopThumbnailWorker(void);
static void  OpenPreviewWindow(void);

/* ==========================================================================
 * Utilitarios de string, caminho e arquivo
 * ========================================================================== */

static void *XAlloc(size_t bytes)
{
    void *p = calloc(1, bytes ? bytes : 1);
    if (!p) {
        MessageBoxW(NULL, L"Memória insuficiente.", APP_NAME,
                    MB_ICONERROR | MB_OK);
        ExitProcess(1);
    }
    return p;
}

static void *XRealloc(void *p, size_t bytes)
{
    void *q = realloc(p, bytes ? bytes : 1);
    if (!q) {
        MessageBoxW(NULL, L"Memória insuficiente.", APP_NAME,
                    MB_ICONERROR | MB_OK);
        ExitProcess(1);
    }
    return q;
}

static WCHAR *DupW(const WCHAR *s)
{
    size_t cch = lstrlenW(s) + 1;
    WCHAR *d = (WCHAR *)XAlloc(cch * sizeof(WCHAR));
    memcpy(d, s, cch * sizeof(WCHAR));
    return d;
}

/* Extensao em minusculas, incluindo o ponto. Vazio se nao houver. */
static void PathExtLower(const WCHAR *path, WCHAR *out, int cch)
{
    const WCHAR *dot = NULL, *p;
    int i;
    out[0] = 0;
    for (p = path; *p; p++) {
        if (*p == L'.') dot = p;
        else if (*p == L'\\' || *p == L'/') dot = NULL;
    }
    if (!dot) return;
    for (i = 0; dot[i] && i < cch - 1; i++)
        out[i] = (WCHAR)towlower(dot[i]);
    out[i] = 0;
}

static const WCHAR *PathLeaf(const WCHAR *path)
{
    const WCHAR *leaf = path, *p;
    for (p = path; *p; p++)
        if (*p == L'\\' || *p == L'/') leaf = p + 1;
    return leaf;
}

/* Nome de exibicao: folha do caminho sem a extensao. */
static void DisplayName(const WCHAR *path, WCHAR *out, int cch)
{
    const WCHAR *leaf = PathLeaf(path);
    const WCHAR *dot = NULL, *p;
    int n;
    for (p = leaf; *p; p++)
        if (*p == L'.') dot = p;
    n = dot ? (int)(dot - leaf) : lstrlenW(leaf);
    if (n > cch - 1) n = cch - 1;
    memcpy(out, leaf, (size_t)n * sizeof(WCHAR));
    out[n] = 0;
}

static void PathJoin(WCHAR *out, int cch, const WCHAR *a, const WCHAR *b)
{
    StringCchCopyW(out, (size_t)cch, a);
    if (out[0] && out[lstrlenW(out) - 1] != L'\\')
        StringCchCatW(out, (size_t)cch, L"\\");
    StringCchCatW(out, (size_t)cch, b);
}

static BOOL FileExists(const WCHAR *path)
{
    DWORD a = GetFileAttributesW(path);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static BOOL DirExists(const WCHAR *path)
{
    DWORD a = GetFileAttributesW(path);
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

/* Cria o diretorio e todos os pais que faltarem. */
static BOOL EnsureDir(const WCHAR *path)
{
    WCHAR tmp[MAX_PATH];
    WCHAR *p;
    if (DirExists(path)) return TRUE;
    StringCchCopyW(tmp, MAX_PATH, path);
    for (p = tmp + 3; *p; p++) {
        if (*p == L'\\') {
            *p = 0;
            if (!DirExists(tmp)) CreateDirectoryW(tmp, NULL);
            *p = L'\\';
        }
    }
    return CreateDirectoryW(tmp, NULL) || DirExists(path);
}

static BOOL IsAudioExt(const WCHAR *ext)
{
    return !lstrcmpW(ext, L".mp3");
}

static BOOL IsImageExt(const WCHAR *ext)
{
    return !lstrcmpW(ext, L".jpg")  || !lstrcmpW(ext, L".jpeg") ||
           !lstrcmpW(ext, L".png")  || !lstrcmpW(ext, L".bmp")  ||
           !lstrcmpW(ext, L".gif")  || !lstrcmpW(ext, L".webp") ||
           !lstrcmpW(ext, L".heic") || !lstrcmpW(ext, L".tif")  ||
           !lstrcmpW(ext, L".tiff");
}

/* UTF-16 -> UTF-8 recem-alocado. */
static char *ToUtf8(const WCHAR *w)
{
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL);
    char *s;
    if (n <= 0) { s = (char *)XAlloc(1); return s; }
    s = (char *)XAlloc((size_t)n);
    WideCharToMultiByte(CP_UTF8, 0, w, -1, s, n, NULL, NULL);
    return s;
}

/* UTF-8 -> UTF-16 recem-alocado. */
static WCHAR *FromUtf8(const char *s, int bytes)
{
    int n = MultiByteToWideChar(CP_UTF8, 0, s, bytes, NULL, 0);
    WCHAR *w;
    if (n < 0) n = 0;
    w = (WCHAR *)XAlloc(((size_t)n + 1) * sizeof(WCHAR));
    if (n) MultiByteToWideChar(CP_UTF8, 0, s, bytes, w, n);
    w[n] = 0;
    return w;
}

static void FileTimeToIso(const FILETIME *ft, WCHAR *out, int cch)
{
    SYSTEMTIME st;
    FILETIME utc = *ft;
    if (!utc.dwLowDateTime && !utc.dwHighDateTime) { out[0] = 0; return; }
    if (!FileTimeToSystemTime(&utc, &st)) { out[0] = 0; return; }
    StringCchPrintfW(out, (size_t)cch, L"%04d-%02d-%02dT%02d:%02d:%02dZ",
                     st.wYear, st.wMonth, st.wDay,
                     st.wHour, st.wMinute, st.wSecond);
}

static void NowIso(WCHAR *out, int cch)
{
    SYSTEMTIME st;
    GetSystemTime(&st);
    StringCchPrintfW(out, (size_t)cch, L"%04d-%02d-%02dT%02d:%02d:%02dZ",
                     st.wYear, st.wMonth, st.wDay,
                     st.wHour, st.wMinute, st.wSecond);
}

static int ScaleDpi(int value)
{
    return MulDiv(value, g_dpi, 96);
}

/* Remove espacos, tabulacoes e aspas das pontas, no lugar. */
static void TrimW(WCHAR *s)
{
    WCHAR *start = s, *end;
    while (*start == L' ' || *start == L'\t' || *start == L'"') start++;
    end = start + lstrlenW(start);
    while (end > start &&
           (end[-1] == L' ' || end[-1] == L'\t' || end[-1] == L'"')) end--;
    if (start != s) memmove(s, start, (size_t)(end - start) * sizeof(WCHAR));
    s[end - start] = 0;
}

/* ==========================================================================
 * Listas dinamicas
 * ========================================================================== */

static void StrListAdd(StrList *l, const WCHAR *s)
{
    int i;
    for (i = 0; i < l->count; i++)
        if (!lstrcmpiW(l->items[i], s)) return;     /* sem duplicatas */
    if (l->count == l->cap) {
        l->cap = l->cap ? l->cap * 2 : 8;
        l->items = (WCHAR **)XRealloc(l->items, (size_t)l->cap * sizeof(WCHAR *));
    }
    l->items[l->count++] = DupW(s);
}

static void StrListClear(StrList *l)
{
    int i;
    for (i = 0; i < l->count; i++) free(l->items[i]);
    free(l->items);
    l->items = NULL;
    l->count = l->cap = 0;
}

static int MediaListFind(const MediaList *l, const WCHAR *path)
{
    int i;
    for (i = 0; i < l->count; i++)
        if (!lstrcmpiW(l->items[i].path, path)) return i;
    return -1;
}

/* Devolve o indice do item (novo ou ja existente). */
static int MediaListAdd(MediaList *l, const WCHAR *path,
                        const FILETIME *written, BOOL *addedOut)
{
    int idx = MediaListFind(l, path);
    MediaItem *it;
    if (addedOut) *addedOut = FALSE;
    if (idx >= 0) return idx;
    if (l->count == l->cap) {
        l->cap = l->cap ? l->cap * 2 : 128;
        l->items = (MediaItem *)XRealloc(l->items,
                                         (size_t)l->cap * sizeof(MediaItem));
        memset(l->items + l->count, 0,
               (size_t)(l->cap - l->count) * sizeof(MediaItem));
    }
    it = &l->items[l->count];
    memset(it, 0, sizeof(*it));
    it->uid = g_nextUid++;
    StringCchCopyW(it->path, MAX_PATH, path);
    DisplayName(path, it->title, ARRAYSIZE(it->title));
    if (written) it->written = *written;
    it->thumb = -1;
    it->missing = !FileExists(path);
    if (addedOut) *addedOut = TRUE;
    return l->count++;
}

static void MediaListClear(MediaList *l)
{
    free(l->items);
    l->items = NULL;
    l->count = l->cap = 0;
}

static void CollectionAddId(Collection *c, int id)
{
    int i;
    for (i = 0; i < c->count; i++)
        if (c->ids[i] == id) return;
    if (c->count == c->cap) {
        c->cap = c->cap ? c->cap * 2 : 16;
        c->ids = (int *)XRealloc(c->ids, (size_t)c->cap * sizeof(int));
    }
    c->ids[c->count++] = id;
}

static void CollectionRemoveAt(Collection *c, int pos)
{
    if (pos < 0 || pos >= c->count) return;
    memmove(c->ids + pos, c->ids + pos + 1,
            (size_t)(c->count - pos - 1) * sizeof(int));
    c->count--;
}

/* Remove todas as referencias a um id e reindexa as maiores (usado ao
   excluir um item da biblioteca). */
static void CollectionDropId(Collection *c, int id)
{
    int i = 0;
    while (i < c->count) {
        if (c->ids[i] == id) CollectionRemoveAt(c, i);
        else { if (c->ids[i] > id) c->ids[i]--; i++; }
    }
}

static Collection *CollectionListAdd(CollectionList *l, const WCHAR *name)
{
    Collection *c;
    if (l->count == l->cap) {
        l->cap = l->cap ? l->cap * 2 : 8;
        l->items = (Collection *)XRealloc(l->items,
                                          (size_t)l->cap * sizeof(Collection));
        memset(l->items + l->count, 0,
               (size_t)(l->cap - l->count) * sizeof(Collection));
    }
    c = &l->items[l->count++];
    memset(c, 0, sizeof(*c));
    StringCchCopyW(c->name, ARRAYSIZE(c->name), name);
    c->cover = -1;
    c->interval = 10;
    return c;
}

static void CollectionListRemoveAt(CollectionList *l, int pos)
{
    if (pos < 0 || pos >= l->count) return;
    free(l->items[pos].ids);
    memmove(l->items + pos, l->items + pos + 1,
            (size_t)(l->count - pos - 1) * sizeof(Collection));
    l->count--;
}

static void CollectionListClear(CollectionList *l)
{
    int i;
    for (i = 0; i < l->count; i++) free(l->items[i].ids);
    free(l->items);
    l->items = NULL;
    l->count = l->cap = 0;
}

static BOOL CollectionNameTaken(const CollectionList *l, const WCHAR *name,
                                int ignoreIndex)
{
    int i;
    for (i = 0; i < l->count; i++)
        if (i != ignoreIndex && !lstrcmpiW(l->items[i].name, name)) return TRUE;
    return FALSE;
}

/* ==========================================================================
 * Varredura de pastas
 * ==========================================================================
 * Nunca copia nem move arquivos: registra os caminhos originais.
 */

typedef struct {
    int audio;
    int image;
    int skipped;
} ScanResult;

static void ScanDirectory(const WCHAR *dir, BOOL wantAudio, BOOL wantImage,
                          int depth, ScanResult *res)
{
    WCHAR pattern[MAX_PATH], full[MAX_PATH], ext[16];
    WIN32_FIND_DATAW fd;
    HANDLE h;

    if (depth > 12) return;                 /* trava contra recursao patologica */
    PathJoin(pattern, MAX_PATH, dir, L"*");
    h = FindFirstFileW(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (fd.cFileName[0] == L'.' &&
            (!fd.cFileName[1] || (fd.cFileName[1] == L'.' && !fd.cFileName[2])))
            continue;
        if (fd.dwFileAttributes & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM))
            continue;
        if (FAILED(StringCchCopyW(full, MAX_PATH, dir)) ||
            FAILED(StringCchCatW(full, MAX_PATH, L"\\")) ||
            FAILED(StringCchCatW(full, MAX_PATH, fd.cFileName))) {
            res->skipped++;                 /* caminho longo demais */
            continue;
        }
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) continue;
            ScanDirectory(full, wantAudio, wantImage, depth + 1, res);
            continue;
        }
        PathExtLower(full, ext, ARRAYSIZE(ext));
        if (wantAudio && IsAudioExt(ext)) {
            BOOL added = FALSE;
            MediaListAdd(&g_tracks, full, &fd.ftLastWriteTime, &added);
            if (added) res->audio++;
        } else if (wantImage && IsImageExt(ext)) {
            BOOL added = FALSE;
            MediaListAdd(&g_photos, full, &fd.ftLastWriteTime, &added);
            if (added) res->image++;
        }
    } while (FindNextFileW(h, &fd));

    FindClose(h);
}

/* Aceita arquivos ou pastas; pastas sao varridas recursivamente. */
static void IngestPath(const WCHAR *path, BOOL wantAudio, BOOL wantImage,
                       ScanResult *res)
{
    WCHAR ext[16];
    WIN32_FILE_ATTRIBUTE_DATA info;

    if (DirExists(path)) {
        if (wantAudio) StrListAdd(&g_musicRoots, path);
        if (wantImage) StrListAdd(&g_photoRoots, path);
        ScanDirectory(path, wantAudio, wantImage, 0, res);
        return;
    }
    if (!FileExists(path)) { res->skipped++; return; }

    PathExtLower(path, ext, ARRAYSIZE(ext));
    if (!GetFileAttributesExW(path, GetFileExInfoStandard, &info))
        memset(&info, 0, sizeof(info));

    if (wantAudio && IsAudioExt(ext)) {
        BOOL added = FALSE;
        MediaListAdd(&g_tracks, path, &info.ftLastWriteTime, &added);
        if (added) res->audio++;
    } else if (wantImage && IsImageExt(ext)) {
        BOOL added = FALSE;
        MediaListAdd(&g_photos, path, &info.ftLastWriteTime, &added);
        if (added) res->image++;
    } else {
        res->skipped++;
    }
}

/* Revarre as pastas conhecidas e as pastas padrao sob a raiz. */
static void RescanLibrary(ScanResult *res)
{
    WCHAR dir[MAX_PATH];
    int i;

    PathJoin(dir, MAX_PATH, g_root, DIR_MUSIC);
    if (DirExists(dir)) ScanDirectory(dir, TRUE, FALSE, 0, res);
    PathJoin(dir, MAX_PATH, g_root, DIR_PHOTOS);
    if (DirExists(dir)) ScanDirectory(dir, FALSE, TRUE, 0, res);

    for (i = 0; i < g_musicRoots.count; i++)
        if (DirExists(g_musicRoots.items[i]))
            ScanDirectory(g_musicRoots.items[i], TRUE, FALSE, 0, res);
    for (i = 0; i < g_photoRoots.count; i++)
        if (DirExists(g_photoRoots.items[i]))
            ScanDirectory(g_photoRoots.items[i], FALSE, TRUE, 0, res);

    for (i = 0; i < g_tracks.count; i++)
        g_tracks.items[i].missing = !FileExists(g_tracks.items[i].path);
    for (i = 0; i < g_photos.count; i++)
        g_photos.items[i].missing = !FileExists(g_photos.items[i].path);
}

/* ==========================================================================
 * JSON - escritor
 * ========================================================================== */

typedef struct {
    char  *buf;
    size_t len, cap;
    BOOL   needComma;
} JsonBuf;

static void JbRaw(JsonBuf *j, const char *s, size_t n)
{
    if (j->len + n + 1 > j->cap) {
        while (j->len + n + 1 > j->cap)
            j->cap = j->cap ? j->cap * 2 : 4096;
        j->buf = (char *)XRealloc(j->buf, j->cap);
    }
    memcpy(j->buf + j->len, s, n);
    j->len += n;
    j->buf[j->len] = 0;
}

static void JbStr(JsonBuf *j, const char *s) { JbRaw(j, s, strlen(s)); }

static void JbComma(JsonBuf *j)
{
    if (j->needComma) JbStr(j, ",");
    j->needComma = TRUE;
}

static void JbOpen(JsonBuf *j, char ch)
{
    JbComma(j);
    JbRaw(j, &ch, 1);
    j->needComma = FALSE;
}

static void JbClose(JsonBuf *j, char ch)
{
    JbRaw(j, &ch, 1);
    j->needComma = TRUE;
}

/* Escreve uma string JSON escapada a partir de UTF-16. */
static void JbQuoted(JsonBuf *j, const WCHAR *w)
{
    char *utf8 = ToUtf8(w);
    const unsigned char *p;
    char esc[8];
    JbStr(j, "\"");
    for (p = (const unsigned char *)utf8; *p; p++) {
        switch (*p) {
        case '"':  JbStr(j, "\\\""); break;
        case '\\': JbStr(j, "\\\\"); break;
        case '\n': JbStr(j, "\\n");  break;
        case '\r': JbStr(j, "\\r");  break;
        case '\t': JbStr(j, "\\t");  break;
        case '\b': JbStr(j, "\\b");  break;
        case '\f': JbStr(j, "\\f");  break;
        default:
            if (*p < 0x20) {
                StringCchPrintfA(esc, ARRAYSIZE(esc), "\\u%04x", *p);
                JbStr(j, esc);
            } else {
                JbRaw(j, (const char *)p, 1);
            }
        }
    }
    JbStr(j, "\"");
    free(utf8);
}

static void JbKey(JsonBuf *j, const char *key)
{
    JbComma(j);
    JbStr(j, "\"");
    JbStr(j, key);
    JbStr(j, "\":");
    j->needComma = FALSE;
}

static void JbKeyStr(JsonBuf *j, const char *key, const WCHAR *val)
{
    JbKey(j, key);
    JbQuoted(j, val);
    j->needComma = TRUE;
}

static void JbKeyInt(JsonBuf *j, const char *key, int val)
{
    char num[24];
    JbKey(j, key);
    StringCchPrintfA(num, ARRAYSIZE(num), "%d", val);
    JbStr(j, num);
    j->needComma = TRUE;
}

static void JbKeyBool(JsonBuf *j, const char *key, BOOL val)
{
    JbKey(j, key);
    JbStr(j, val ? "true" : "false");
    j->needComma = TRUE;
}

static void JbValStr(JsonBuf *j, const WCHAR *val)
{
    JbComma(j);
    JbQuoted(j, val);
}

static void JbValInt(JsonBuf *j, int val)
{
    char num[24];
    JbComma(j);
    StringCchPrintfA(num, ARRAYSIZE(num), "%d", val);
    JbStr(j, num);
}

static void JbFree(JsonBuf *j)
{
    free(j->buf);
    j->buf = NULL;
    j->len = j->cap = 0;
    j->needComma = FALSE;
}

/* Grava UTF-8 sem BOM, via arquivo temporario + substituicao atomica. */
static BOOL WriteTextFileUtf8(const WCHAR *path, const char *data, size_t len)
{
    WCHAR tmp[MAX_PATH];
    HANDLE h;
    DWORD written = 0;

    if (FAILED(StringCchCopyW(tmp, MAX_PATH, path)) ||
        FAILED(StringCchCatW(tmp, MAX_PATH, L".tmp")))
        return FALSE;

    h = CreateFileW(tmp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                    FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return FALSE;
    if (!WriteFile(h, data, (DWORD)len, &written, NULL) || written != len) {
        CloseHandle(h);
        DeleteFileW(tmp);
        return FALSE;
    }
    CloseHandle(h);

    if (FileExists(path)) {
        if (!ReplaceFileW(path, tmp, NULL, REPLACEFILE_IGNORE_MERGE_ERRORS,
                          NULL, NULL)) {
            DeleteFileW(path);
            if (!MoveFileW(tmp, path)) { DeleteFileW(tmp); return FALSE; }
        }
        return TRUE;
    }
    if (!MoveFileW(tmp, path)) { DeleteFileW(tmp); return FALSE; }
    return TRUE;
}

static char *ReadTextFileUtf8(const WCHAR *path, size_t *lenOut)
{
    HANDLE h;
    LARGE_INTEGER size;
    DWORD got = 0;
    char *buf;

    *lenOut = 0;
    h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    if (!GetFileSizeEx(h, &size) || size.QuadPart > 64 * 1024 * 1024) {
        CloseHandle(h);
        return NULL;
    }
    buf = (char *)XAlloc((size_t)size.QuadPart + 1);
    if (!ReadFile(h, buf, (DWORD)size.QuadPart, &got, NULL)) {
        CloseHandle(h);
        free(buf);
        return NULL;
    }
    CloseHandle(h);
    buf[got] = 0;
    *lenOut = got;
    return buf;
}

/* ==========================================================================
 * JSON - leitor (arvore minima, suficiente para reler o estado gravado)
 * ========================================================================== */

enum { JT_NULL = 0, JT_BOOL, JT_NUM, JT_STR, JT_ARR, JT_OBJ };

typedef struct JVal JVal;
struct JVal {
    int     type;
    double  num;
    BOOL    bval;
    char   *str;          /* UTF-8 ja desescapado */
    char  **keys;         /* apenas JT_OBJ */
    JVal  **items;        /* JT_ARR e JT_OBJ */
    int     count, cap;
};

typedef struct {
    const char *p;
    const char *end;
    int         depth;
} JParser;

static JVal *JParseValue(JParser *ps);

static void JFree(JVal *v)
{
    int i;
    if (!v) return;
    for (i = 0; i < v->count; i++) {
        if (v->keys && v->keys[i]) free(v->keys[i]);
        JFree(v->items[i]);
    }
    free(v->keys);
    free(v->items);
    free(v->str);
    free(v);
}

static void JSkipWs(JParser *ps)
{
    while (ps->p < ps->end &&
           (*ps->p == ' ' || *ps->p == '\t' || *ps->p == '\n' || *ps->p == '\r'))
        ps->p++;
}

static void JChildAdd(JVal *v, char *key, JVal *child)
{
    if (v->count == v->cap) {
        v->cap = v->cap ? v->cap * 2 : 8;
        v->items = (JVal **)XRealloc(v->items, (size_t)v->cap * sizeof(JVal *));
        if (v->type == JT_OBJ)
            v->keys = (char **)XRealloc(v->keys, (size_t)v->cap * sizeof(char *));
    }
    if (v->type == JT_OBJ) v->keys[v->count] = key;
    v->items[v->count++] = child;
}

/* Le uma string JSON; devolve UTF-8 alocado ou NULL em erro. */
static char *JParseString(JParser *ps)
{
    size_t cap = 32, len = 0;
    char *out;
    if (ps->p >= ps->end || *ps->p != '"') return NULL;
    ps->p++;
    out = (char *)XAlloc(cap);

    while (ps->p < ps->end && *ps->p != '"') {
        unsigned char c = (unsigned char)*ps->p;
        char chunk[8];
        int n = 1;
        chunk[0] = (char)c;

        if (c == '\\') {
            ps->p++;
            if (ps->p >= ps->end) { free(out); return NULL; }
            switch (*ps->p) {
            case 'n': chunk[0] = '\n'; break;
            case 'r': chunk[0] = '\r'; break;
            case 't': chunk[0] = '\t'; break;
            case 'b': chunk[0] = '\b'; break;
            case 'f': chunk[0] = '\f'; break;
            case '"': case '\\': case '/': chunk[0] = *ps->p; break;
            case 'u': {
                unsigned cp = 0;
                int i;
                if (ps->end - ps->p < 5) { free(out); return NULL; }
                for (i = 1; i <= 4; i++) {
                    char h = ps->p[i];
                    cp <<= 4;
                    if (h >= '0' && h <= '9') cp |= (unsigned)(h - '0');
                    else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
                    else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
                    else { free(out); return NULL; }
                }
                ps->p += 4;
                /* par substituto alto: consome o baixo, se vier */
                if (cp >= 0xD800 && cp <= 0xDBFF &&
                    ps->end - ps->p >= 7 && ps->p[1] == '\\' && ps->p[2] == 'u') {
                    unsigned lo = 0;
                    for (i = 3; i <= 6; i++) {
                        char h = ps->p[i];
                        lo <<= 4;
                        if (h >= '0' && h <= '9') lo |= (unsigned)(h - '0');
                        else if (h >= 'a' && h <= 'f') lo |= (unsigned)(h - 'a' + 10);
                        else if (h >= 'A' && h <= 'F') lo |= (unsigned)(h - 'A' + 10);
                        else { lo = 0; break; }
                    }
                    if (lo >= 0xDC00 && lo <= 0xDFFF) {
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                        ps->p += 6;
                    }
                }
                if (cp < 0x80) { chunk[0] = (char)cp; n = 1; }
                else if (cp < 0x800) {
                    chunk[0] = (char)(0xC0 | (cp >> 6));
                    chunk[1] = (char)(0x80 | (cp & 0x3F));
                    n = 2;
                } else if (cp < 0x10000) {
                    chunk[0] = (char)(0xE0 | (cp >> 12));
                    chunk[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    chunk[2] = (char)(0x80 | (cp & 0x3F));
                    n = 3;
                } else {
                    chunk[0] = (char)(0xF0 | (cp >> 18));
                    chunk[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
                    chunk[2] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    chunk[3] = (char)(0x80 | (cp & 0x3F));
                    n = 4;
                }
                break;
            }
            default: free(out); return NULL;
            }
        }
        ps->p++;

        if (len + (size_t)n + 1 > cap) {
            while (len + (size_t)n + 1 > cap) cap *= 2;
            out = (char *)XRealloc(out, cap);
        }
        memcpy(out + len, chunk, (size_t)n);
        len += (size_t)n;
    }
    if (ps->p >= ps->end) { free(out); return NULL; }
    ps->p++;                       /* fecha aspas */
    out[len] = 0;
    return out;
}

static JVal *JParseValue(JParser *ps)
{
    JVal *v;
    JSkipWs(ps);
    if (ps->p >= ps->end) return NULL;
    if (++ps->depth > 32) { ps->depth--; return NULL; }

    v = (JVal *)XAlloc(sizeof(JVal));

    if (*ps->p == '{' || *ps->p == '[') {
        char close = (*ps->p == '{') ? '}' : ']';
        v->type = (*ps->p == '{') ? JT_OBJ : JT_ARR;
        ps->p++;
        JSkipWs(ps);
        if (ps->p < ps->end && *ps->p == close) { ps->p++; ps->depth--; return v; }
        for (;;) {
            char *key = NULL;
            JVal *child;
            JSkipWs(ps);
            if (v->type == JT_OBJ) {
                key = JParseString(ps);
                if (!key) goto fail;
                JSkipWs(ps);
                if (ps->p >= ps->end || *ps->p != ':') { free(key); goto fail; }
                ps->p++;
            }
            child = JParseValue(ps);
            if (!child) { free(key); goto fail; }
            JChildAdd(v, key, child);
            JSkipWs(ps);
            if (ps->p < ps->end && *ps->p == ',') { ps->p++; continue; }
            if (ps->p < ps->end && *ps->p == close) { ps->p++; break; }
            goto fail;
        }
        ps->depth--;
        return v;
    }

    if (*ps->p == '"') {
        v->type = JT_STR;
        v->str = JParseString(ps);
        if (!v->str) goto fail;
        ps->depth--;
        return v;
    }
    if (ps->end - ps->p >= 4 && !strncmp(ps->p, "true", 4)) {
        v->type = JT_BOOL; v->bval = TRUE; ps->p += 4; ps->depth--; return v;
    }
    if (ps->end - ps->p >= 5 && !strncmp(ps->p, "false", 5)) {
        v->type = JT_BOOL; v->bval = FALSE; ps->p += 5; ps->depth--; return v;
    }
    if (ps->end - ps->p >= 4 && !strncmp(ps->p, "null", 4)) {
        v->type = JT_NULL; ps->p += 4; ps->depth--; return v;
    }
    {
        char num[64];
        size_t n = 0;
        while (ps->p < ps->end && n < sizeof(num) - 1 &&
               (isdigit((unsigned char)*ps->p) || *ps->p == '-' || *ps->p == '+' ||
                *ps->p == '.' || *ps->p == 'e' || *ps->p == 'E'))
            num[n++] = *ps->p++;
        if (!n) goto fail;
        num[n] = 0;
        v->type = JT_NUM;
        v->num = atof(num);
        ps->depth--;
        return v;
    }

fail:
    JFree(v);
    ps->depth--;
    return NULL;
}

static JVal *JParse(const char *data, size_t len)
{
    JParser ps;
    JVal *root;
    /* tolera BOM UTF-8 */
    if (len >= 3 && (unsigned char)data[0] == 0xEF &&
        (unsigned char)data[1] == 0xBB && (unsigned char)data[2] == 0xBF) {
        data += 3;
        len -= 3;
    }
    ps.p = data;
    ps.end = data + len;
    ps.depth = 0;
    root = JParseValue(&ps);
    return root;
}

static JVal *JObjGet(const JVal *obj, const char *key)
{
    int i;
    if (!obj || obj->type != JT_OBJ) return NULL;
    for (i = 0; i < obj->count; i++)
        if (obj->keys[i] && !strcmp(obj->keys[i], key)) return obj->items[i];
    return NULL;
}

static void JGetStrW(const JVal *obj, const char *key, WCHAR *out, int cch)
{
    JVal *v = JObjGet(obj, key);
    WCHAR *w;
    if (!v || v->type != JT_STR) return;
    w = FromUtf8(v->str, -1);
    StringCchCopyW(out, (size_t)cch, w);
    free(w);
}

static int JGetInt(const JVal *obj, const char *key, int def)
{
    JVal *v = JObjGet(obj, key);
    if (!v || v->type != JT_NUM) return def;
    return (int)v->num;
}

static BOOL JGetBool(const JVal *obj, const char *key, BOOL def)
{
    JVal *v = JObjGet(obj, key);
    if (!v || v->type != JT_BOOL) return def;
    return v->bval;
}


/* ==========================================================================
 * Caminhos derivados da raiz
 * ========================================================================== */

static void RootFile(WCHAR *out, int cch, const WCHAR *leaf)
{
    PathJoin(out, cch, g_root, leaf);
}

static void HubFile(WCHAR *out, int cch, const WCHAR *leaf)
{
    WCHAR hub[MAX_PATH];
    PathJoin(hub, MAX_PATH, g_root, DIR_HUB);
    PathJoin(out, cch, hub, leaf);
}

/* Caminho relativo a raiz com separador "/", para o Hub. Devolve FALSE
   quando o arquivo esta fora da raiz (continua valido, mas so por caminho
   absoluto). */
static BOOL RelativeToRoot(const WCHAR *path, WCHAR *out, int cch)
{
    int rootLen = lstrlenW(g_root);
    int i;
    if (rootLen <= 0) return FALSE;
    if (CompareStringW(LOCALE_INVARIANT, NORM_IGNORECASE, path, rootLen,
                       g_root, rootLen) != CSTR_EQUAL)
        return FALSE;
    if (path[rootLen] != L'\\' && path[rootLen] != L'/') return FALSE;
    StringCchCopyW(out, (size_t)cch, path + rootLen + 1);
    for (i = 0; out[i]; i++)
        if (out[i] == L'\\') out[i] = L'/';
    return TRUE;
}

/* ==========================================================================
 * Serializacao do estado e do manifesto
 * ========================================================================== */

static void WriteMediaArray(JsonBuf *j, const char *key, const MediaList *list,
                            BOOL withRelative)
{
    int i;
    JbKey(j, key);
    JbOpen(j, '[');
    for (i = 0; i < list->count; i++) {
        const MediaItem *it = &list->items[i];
        WCHAR rel[MAX_PATH], iso[32];
        JbOpen(j, '{');
        JbKeyInt(j, "id", i);
        JbKeyStr(j, "title", it->title);
        JbKeyStr(j, "path", it->path);
        if (withRelative && RelativeToRoot(it->path, rel, MAX_PATH))
            JbKeyStr(j, "relativePath", rel);
        FileTimeToIso(&it->written, iso, ARRAYSIZE(iso));
        if (iso[0]) JbKeyStr(j, "modified", iso);
        if (it->missing) JbKeyBool(j, "missing", TRUE);
        JbClose(j, '}');
    }
    JbClose(j, ']');
}

static void WriteCollections(JsonBuf *j, const char *key,
                             const CollectionList *list, BOOL isAlbum)
{
    int i, k;
    JbKey(j, key);
    JbOpen(j, '[');
    for (i = 0; i < list->count; i++) {
        const Collection *c = &list->items[i];
        JbOpen(j, '{');
        JbKeyStr(j, "name", c->name);
        JbKeyInt(j, isAlbum ? "photoCount" : "trackCount", c->count);
        if (isAlbum) {
            JbKeyInt(j, "cover", c->cover);
            JbKeyInt(j, "intervalSeconds", c->interval);
        }
        JbKey(j, isAlbum ? "photos" : "tracks");
        JbOpen(j, '[');
        for (k = 0; k < c->count; k++) JbValInt(j, c->ids[k]);
        JbClose(j, ']');
        JbClose(j, '}');
    }
    JbClose(j, ']');
}

static void WriteStrList(JsonBuf *j, const char *key, const StrList *list)
{
    int i;
    JbKey(j, key);
    JbOpen(j, '[');
    for (i = 0; i < list->count; i++) JbValStr(j, list->items[i]);
    JbClose(j, ']');
}

static void WriteFrameSettings(JsonBuf *j)
{
    static const WCHAR *frames[] = { L"nenhuma", L"fina-clara", L"madeira",
                                     L"cerejinha" };
    static const WCHAR *bgs[] = { L"preto", L"branco", L"cerejinha-suave",
                                  L"desfoque-da-foto" };
    JbKey(j, "frameMode");
    JbOpen(j, '{');
    JbKeyInt(j, "secondsPerPhoto", g_frame.seconds);
    JbKeyBool(j, "fade", g_frame.fade);
    JbKeyBool(j, "random", g_frame.random);
    JbKeyBool(j, "caption", g_frame.caption);
    JbKeyStr(j, "frame", frames[g_frame.frame % 4]);
    JbKeyInt(j, "frameIndex", g_frame.frame);
    JbKeyStr(j, "background", bgs[g_frame.background % 4]);
    JbKeyInt(j, "backgroundIndex", g_frame.background);
    JbKeyInt(j, "passepartoutPercent", g_frame.passepartout);
    JbClose(j, '}');
}

/* Documento unico usado tanto pelo estado quanto pelo manifesto; o
   manifesto publicado difere apenas por incluir os caminhos relativos e o
   bloco de status. */
static char *BuildDocument(BOOL forHub, size_t *lenOut)
{
    JsonBuf j;
    WCHAR now[32], ver[64];
    int i;

    memset(&j, 0, sizeof(j));
    StringCchPrintfW(ver, ARRAYSIZE(ver), L"%s %s", APP_NAME, APP_VERSION);
    NowIso(now, ARRAYSIZE(now));

    JbOpen(&j, '{');
    JbKeyStr(&j, "schema", MANIFEST_SCHEMA);
    JbKeyStr(&j, "generator", ver);
    JbKeyStr(&j, "generatedAt", now);
    JbKeyStr(&j, "root", g_root);
    JbKeyBool(&j, "embedMedia", FALSE);

    JbKey(&j, "folders");
    JbOpen(&j, '{');
    JbKeyStr(&j, "music", DIR_MUSIC);
    JbKeyStr(&j, "photos", DIR_PHOTOS);
    JbClose(&j, '}');

    JbKey(&j, "hub");
    JbOpen(&j, '{');
    JbKeyStr(&j, "url", g_hubUrl);
    JbClose(&j, '}');

    JbKey(&j, "lg");
    JbOpen(&j, '{');
    JbKeyStr(&j, "device", g_lgDevice);
    JbKeyStr(&j, "ip", g_lgIp);
    JbKeyStr(&j, "ipk", g_ipkPath);
    JbKeyStr(&j, "aresInstall", g_aresPath);
    JbClose(&j, '}');

    JbKey(&j, "homeAssistant");
    JbOpen(&j, '{');
    JbKeyStr(&j, "baseUrl", g_haUrl);
    /* O token nunca e gravado: vem de LAURINHA_HA_TOKEN no ambiente. */
    JbKeyStr(&j, "tokenSource", L"env:LAURINHA_HA_TOKEN");
    JbClose(&j, '}');

    JbKey(&j, "music");
    JbOpen(&j, '{');
    JbKeyInt(&j, "trackCount", g_tracks.count);
    WriteStrList(&j, "roots", &g_musicRoots);
    WriteMediaArray(&j, "tracks", &g_tracks, forHub);
    WriteCollections(&j, "playlists", &g_playlists, FALSE);
    JbClose(&j, '}');

    JbKey(&j, "photos");
    JbOpen(&j, '{');
    JbKeyInt(&j, "photoCount", g_photos.count);
    WriteStrList(&j, "roots", &g_photoRoots);
    WriteMediaArray(&j, "photos", &g_photos, forHub);
    WriteCollections(&j, "albums", &g_albums, TRUE);
    JbClose(&j, '}');

    WriteFrameSettings(&j);

    if (forHub) {
        static const WCHAR *states[] = { L"off", L"warn", L"ok" };
        static const char *keys[STATUS_COUNT] = {
            "lg", "connectedHub", "homeAssistant", "music", "photos"
        };
        JbKey(&j, "status");
        JbOpen(&j, '{');
        for (i = 0; i < STATUS_COUNT; i++) {
            JbKey(&j, keys[i]);
            JbOpen(&j, '{');
            JbKeyStr(&j, "label", g_status[i].label);
            if (i == STATUS_HUB) {
                /* O estado do Hub guardado em g_status descreve o arquivo que
                   ainda esta em disco. Dentro do proprio manifesto isso ficaria
                   sempre defasado de uma publicacao, entao a linha descreve
                   este documento: ele e a publicacao. */
                WCHAR detail[256];
                StringCchPrintfW(detail, ARRAYSIZE(detail),
                                 L"Manifesto publicado por %s em %s.", ver, now);
                JbKeyStr(&j, "state", L"ok");
                JbKeyStr(&j, "detail", detail);
            } else {
                JbKeyStr(&j, "state", states[g_status[i].state % 3]);
                JbKeyStr(&j, "detail", g_status[i].detail);
            }
            JbClose(&j, '}');
        }
        JbClose(&j, '}');
    }

    JbClose(&j, '}');
    JbStr(&j, "\n");

    *lenOut = j.len;
    return j.buf;            /* o chamador libera */
}

static BOOL SaveState(void)
{
    WCHAR path[MAX_PATH];
    char *doc;
    size_t len;
    BOOL ok;

    if (!g_root[0]) return FALSE;
    if (!EnsureDir(g_root)) return FALSE;
    RootFile(path, MAX_PATH, L"laurinha-manager.json");
    doc = BuildDocument(FALSE, &len);
    ok = WriteTextFileUtf8(path, doc, len);
    free(doc);
    if (ok) g_dirty = FALSE;
    return ok;
}

static void LoadMediaArray(const JVal *arr, MediaList *list)
{
    int i;
    if (!arr || arr->type != JT_ARR) return;
    for (i = 0; i < arr->count; i++) {
        const JVal *o = arr->items[i];
        WCHAR path[MAX_PATH] = L"", title[160] = L"";
        BOOL added = FALSE;
        int idx;
        if (!o || o->type != JT_OBJ) continue;
        JGetStrW(o, "path", path, MAX_PATH);
        if (!path[0]) continue;
        idx = MediaListAdd(list, path, NULL, &added);
        JGetStrW(o, "title", title, ARRAYSIZE(title));
        if (title[0]) StringCchCopyW(list->items[idx].title, 160, title);
    }
}

static void LoadCollections(const JVal *arr, CollectionList *list,
                            const char *idsKey, int limit, BOOL isAlbum)
{
    int i, k;
    if (!arr || arr->type != JT_ARR) return;
    for (i = 0; i < arr->count; i++) {
        const JVal *o = arr->items[i];
        const JVal *ids;
        WCHAR name[96] = L"";
        Collection *c;
        if (!o || o->type != JT_OBJ) continue;
        JGetStrW(o, "name", name, ARRAYSIZE(name));
        if (!name[0]) continue;
        c = CollectionListAdd(list, name);
        if (isAlbum) {
            c->cover = JGetInt(o, "cover", -1);
            c->interval = JGetInt(o, "intervalSeconds", 10);
            if (c->interval < 3) c->interval = 3;
            if (c->interval > 600) c->interval = 600;
            if (c->cover < -1 || c->cover >= limit) c->cover = -1;
        }
        ids = JObjGet(o, idsKey);
        if (!ids || ids->type != JT_ARR) continue;
        for (k = 0; k < ids->count; k++) {
            const JVal *n = ids->items[k];
            if (n && n->type == JT_NUM) {
                int id = (int)n->num;
                if (id >= 0 && id < limit) CollectionAddId(c, id);
            }
        }
    }
}

static void LoadStrList(const JVal *arr, StrList *list)
{
    int i;
    if (!arr || arr->type != JT_ARR) return;
    for (i = 0; i < arr->count; i++) {
        const JVal *v = arr->items[i];
        WCHAR *w;
        if (!v || v->type != JT_STR) continue;
        w = FromUtf8(v->str, -1);
        if (w[0]) StrListAdd(list, w);
        free(w);
    }
}

static BOOL LoadState(void)
{
    WCHAR path[MAX_PATH];
    char *data;
    size_t len;
    JVal *root, *music, *photos, *frame, *lg, *ha, *hub;

    RootFile(path, MAX_PATH, L"laurinha-manager.json");
    data = ReadTextFileUtf8(path, &len);
    if (!data) return FALSE;
    root = JParse(data, len);
    free(data);
    if (!root || root->type != JT_OBJ) { JFree(root); return FALSE; }

    hub = JObjGet(root, "hub");
    if (hub) JGetStrW(hub, "url", g_hubUrl, ARRAYSIZE(g_hubUrl));

    lg = JObjGet(root, "lg");
    if (lg) {
        JGetStrW(lg, "device", g_lgDevice, ARRAYSIZE(g_lgDevice));
        JGetStrW(lg, "ip", g_lgIp, ARRAYSIZE(g_lgIp));
        JGetStrW(lg, "ipk", g_ipkPath, MAX_PATH);
        JGetStrW(lg, "aresInstall", g_aresPath, MAX_PATH);
    }
    ha = JObjGet(root, "homeAssistant");
    if (ha) JGetStrW(ha, "baseUrl", g_haUrl, ARRAYSIZE(g_haUrl));

    music = JObjGet(root, "music");
    if (music) {
        LoadStrList(JObjGet(music, "roots"), &g_musicRoots);
        LoadMediaArray(JObjGet(music, "tracks"), &g_tracks);
        LoadCollections(JObjGet(music, "playlists"), &g_playlists, "tracks",
                        g_tracks.count, FALSE);
    }
    photos = JObjGet(root, "photos");
    if (photos) {
        LoadStrList(JObjGet(photos, "roots"), &g_photoRoots);
        LoadMediaArray(JObjGet(photos, "photos"), &g_photos);
        LoadCollections(JObjGet(photos, "albums"), &g_albums, "photos",
                        g_photos.count, TRUE);
    }
    frame = JObjGet(root, "frameMode");
    if (frame) {
        g_frame.seconds = JGetInt(frame, "secondsPerPhoto", g_frame.seconds);
        g_frame.fade = JGetBool(frame, "fade", g_frame.fade);
        g_frame.random = JGetBool(frame, "random", g_frame.random);
        g_frame.caption = JGetBool(frame, "caption", g_frame.caption);
        g_frame.frame = JGetInt(frame, "frameIndex", g_frame.frame);
        g_frame.background = JGetInt(frame, "backgroundIndex", g_frame.background);
        g_frame.passepartout = JGetInt(frame, "passepartoutPercent",
                                       g_frame.passepartout);
    }
    if (g_frame.seconds < 3) g_frame.seconds = 3;
    if (g_frame.seconds > 600) g_frame.seconds = 600;
    if (g_frame.frame < 0 || g_frame.frame > 3) g_frame.frame = 0;
    if (g_frame.background < 0 || g_frame.background > 3) g_frame.background = 0;
    if (g_frame.passepartout < 0) g_frame.passepartout = 0;
    if (g_frame.passepartout > 25) g_frame.passepartout = 25;

    JFree(root);
    return TRUE;
}

static BOOL PublishManifest(WCHAR *errOut, int errCch)
{
    WCHAR hubDir[MAX_PATH], path[MAX_PATH];
    char *doc;
    size_t len;
    BOOL ok;

    if (!g_root[0]) {
        StringCchCopyW(errOut, (size_t)errCch, L"Pasta raiz não definida.");
        return FALSE;
    }
    PathJoin(hubDir, MAX_PATH, g_root, DIR_HUB);
    if (!EnsureDir(hubDir)) {
        StringCchPrintfW(errOut, (size_t)errCch,
                         L"Não foi possível criar a pasta:\n%s", hubDir);
        return FALSE;
    }
    PathJoin(path, MAX_PATH, hubDir, L"manifest.json");
    doc = BuildDocument(TRUE, &len);
    ok = WriteTextFileUtf8(path, doc, len);
    free(doc);
    if (!ok)
        StringCchPrintfW(errOut, (size_t)errCch,
                         L"Falha ao gravar o manifesto:\n%s", path);
    return ok;
}

/* ==========================================================================
 * Status
 * ==========================================================================
 * Todas as verificacoes sao locais e verificaveis: o programa nao faz
 * sondagem de rede, entao cada linha diz exatamente qual evidencia foi lida.
 */

static void SetStatus(int i, int state, const WCHAR *label, const WCHAR *fmt, ...)
{
    va_list ap;
    StringCchCopyW(g_status[i].label, ARRAYSIZE(g_status[i].label), label);
    g_status[i].state = state;
    va_start(ap, fmt);
    StringCchVPrintfW(g_status[i].detail, ARRAYSIZE(g_status[i].detail), fmt, ap);
    va_end(ap);
}

static int CountMissing(const MediaList *l)
{
    int i, n = 0;
    for (i = 0; i < l->count; i++) if (l->items[i].missing) n++;
    return n;
}

/* Idade de um arquivo em horas; -1 se nao existir. */
static double FileAgeHours(const WCHAR *path)
{
    WIN32_FILE_ATTRIBUTE_DATA info;
    ULARGE_INTEGER then, now;
    FILETIME ftNow;
    if (!GetFileAttributesExW(path, GetFileExInfoStandard, &info)) return -1.0;
    GetSystemTimeAsFileTime(&ftNow);
    then.LowPart = info.ftLastWriteTime.dwLowDateTime;
    then.HighPart = info.ftLastWriteTime.dwHighDateTime;
    now.LowPart = ftNow.dwLowDateTime;
    now.HighPart = ftNow.dwHighDateTime;
    if (now.QuadPart < then.QuadPart) return 0.0;
    return (double)(now.QuadPart - then.QuadPart) / 36000000000.0;
}

static BOOL EnvHasValue(const WCHAR *name)
{
    WCHAR buf[8];
    DWORD n = GetEnvironmentVariableW(name, buf, ARRAYSIZE(buf));
    return n > 0 || GetLastError() == ERROR_INSUFFICIENT_BUFFER;
}

static void RecomputeStatus(void)
{
    WCHAR path[MAX_PATH];
    double age;
    int missing;

    /* LG conectada: evidencia local do pareamento/instalacao. */
    HubFile(path, MAX_PATH, L"lg-device.json");
    age = FileAgeHours(path);
    if (!g_lgDevice[0]) {
        SetStatus(STATUS_LG, ST_OFF, L"LG conectada",
                  L"Nenhum dispositivo configurado. Use Configurações para "
                  L"informar o nome do device do ares-setup-device.");
    } else if (age < 0) {
        SetStatus(STATUS_LG, ST_WARN, L"LG conectada",
                  L"Device \"%s\" configurado, mas ainda sem instalação "
                  L"registrada nesta máquina.", g_lgDevice);
    } else if (age > 24.0 * 30) {
        SetStatus(STATUS_LG, ST_WARN, L"LG conectada",
                  L"Device \"%s\": última instalação há %.0f dias. O Modo "
                  L"Desenvolvedor da LG expira periodicamente.",
                  g_lgDevice, age / 24.0);
    } else {
        SetStatus(STATUS_LG, ST_OK, L"LG conectada",
                  L"Device \"%s\"%s%s - última instalação há %.0f h.",
                  g_lgDevice, g_lgIp[0] ? L" em " : L"", g_lgIp, age);
    }

    /* Connected Hub: manifesto publicado e mais novo que o estado. */
    HubFile(path, MAX_PATH, L"manifest.json");
    age = FileAgeHours(path);
    if (age < 0) {
        SetStatus(STATUS_HUB, ST_OFF, L"Connected Hub",
                  L"hub\\manifest.json ainda não foi publicado. Use "
                  L"\"Atualizar biblioteca\".");
    } else if (g_dirty) {
        SetStatus(STATUS_HUB, ST_WARN, L"Connected Hub",
                  L"Manifesto publicado há %.0f h, mas há alterações ainda "
                  L"não publicadas.", age);
    } else {
        SetStatus(STATUS_HUB, ST_OK, L"Connected Hub",
                  L"Manifesto em dia (publicado há %.0f h) em %s.",
                  age, g_hubUrl[0] ? g_hubUrl : L"hub\\manifest.json");
    }

    /* Home Assistant: URL configurada + token presente no ambiente. */
    if (!g_haUrl[0]) {
        SetStatus(STATUS_HA, ST_OFF, L"Home Assistant",
                  L"Sem URL base configurada.");
    } else if (!EnvHasValue(L"LAURINHA_HA_TOKEN")) {
        SetStatus(STATUS_HA, ST_WARN, L"Home Assistant",
                  L"%s configurado, mas a variável de ambiente "
                  L"LAURINHA_HA_TOKEN está vazia.", g_haUrl);
    } else {
        SetStatus(STATUS_HA, ST_OK, L"Home Assistant",
                  L"%s com token presente em LAURINHA_HA_TOKEN.", g_haUrl);
    }

    /* Musica */
    missing = CountMissing(&g_tracks);
    if (!g_tracks.count) {
        SetStatus(STATUS_MUSIC, ST_OFF, L"Música",
                  L"Nenhuma faixa na biblioteca.");
    } else if (missing) {
        SetStatus(STATUS_MUSIC, ST_WARN, L"Música",
                  L"%d faixa(s) em %d playlist(s); %d arquivo(s) não "
                  L"encontrado(s) no disco.",
                  g_tracks.count, g_playlists.count, missing);
    } else {
        SetStatus(STATUS_MUSIC, ST_OK, L"Música",
                  L"%d faixa(s) em %d playlist(s), todas localizadas.",
                  g_tracks.count, g_playlists.count);
    }

    /* Fotos */
    missing = CountMissing(&g_photos);
    if (!g_photos.count) {
        SetStatus(STATUS_PHOTOS, ST_OFF, L"Fotos",
                  L"Nenhuma foto na biblioteca.");
    } else if (missing) {
        SetStatus(STATUS_PHOTOS, ST_WARN, L"Fotos",
                  L"%d foto(s) em %d álbum(ns); %d arquivo(s) não "
                  L"encontrado(s) no disco.",
                  g_photos.count, g_albums.count, missing);
    } else {
        SetStatus(STATUS_PHOTOS, ST_OK, L"Fotos",
                  L"%d foto(s) em %d álbum(ns), todas localizadas.",
                  g_photos.count, g_albums.count);
    }
}

/* ==========================================================================
 * Miniaturas via IShellItemImageFactory (shell32 + ole32, sem GDI+)
 * ========================================================================== */

static const GUID GUID_ShellItemImageFactory =
    { 0xbcc18b79, 0xba16, 0x442f,
      { 0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b } };

/* Devolve um HBITMAP (o chamador apaga) ou NULL. */
static HBITMAP LoadShellImage(const WCHAR *path, int cx, int cy)
{
    IShellItemImageFactory *factory = NULL;
    HBITMAP bmp = NULL;
    SIZE size;
    HRESULT hr;

    size.cx = cx;
    size.cy = cy;
    hr = SHCreateItemFromParsingName(path, NULL, &GUID_ShellItemImageFactory,
                                     (void **)&factory);
    if (FAILED(hr) || !factory) return NULL;
    hr = IShellItemImageFactory_GetImage(factory, size,
                                         SIIGBF_RESIZETOFIT | SIIGBF_BIGGERSIZEOK,
                                         &bmp);
    IShellItemImageFactory_Release(factory);
    if (FAILED(hr) || !bmp) return NULL;

    /* Alguns provedores devolvem S_OK com um bitmap degenerado (1x1) quando
       nao sabem gerar a miniatura. Esticar isso produziria um retangulo
       chapado; e melhor tratar como "sem imagem". */
    {
        BITMAP info;
        if (!GetObjectW(bmp, sizeof(info), &info) ||
            info.bmWidth < 2 || info.bmHeight < 2) {
            DeleteObject(bmp);
            return NULL;
        }
    }
    return bmp;
}

/* A thread trabalha sobre um retrato imutavel de (uid, caminho) tirado na
   thread de UI: assim ela nunca toca em g_photos, que pode ser reordenada,
   realocada ou reduzida enquanto as miniaturas sao geradas. */
typedef struct {
    int   uid;
    WCHAR path[MAX_PATH];
} ThumbJob;

typedef struct {
    ThumbJob *jobs;
    int       count;
} ThumbBatch;

typedef struct {
    int     uid;
    HBITMAP bmp;
} ThumbMsg;

static DWORD WINAPI ThumbnailProc(LPVOID param)
{
    ThumbBatch *batch = (ThumbBatch *)param;
    int i;

    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED))) {
        for (i = 0; i < batch->count; i++) {
            ThumbMsg *msg;
            HBITMAP bmp;

            if (InterlockedCompareExchange(&g_thumbStop, 0, 0)) break;
            bmp = LoadShellImage(batch->jobs[i].path, THUMB_PX, THUMB_PX);
            if (!bmp) continue;
            if (InterlockedCompareExchange(&g_thumbStop, 0, 0)) {
                DeleteObject(bmp);
                break;
            }
            msg = (ThumbMsg *)XAlloc(sizeof(ThumbMsg));
            msg->uid = batch->jobs[i].uid;
            msg->bmp = bmp;
            /* A thread de UI assume a posse do HBITMAP e do ThumbMsg. */
            if (!PostMessageW(g_main, WM_APP_THUMB_READY, 0, (LPARAM)msg)) {
                DeleteObject(bmp);
                free(msg);
                break;
            }
        }
        CoUninitialize();
    }
    free(batch->jobs);
    free(batch);
    return 0;
}

static void StopThumbnailWorker(void)
{
    if (!g_thumbThread) return;
    InterlockedExchange(&g_thumbStop, 1);
    WaitForSingleObject(g_thumbThread, 8000);
    CloseHandle(g_thumbThread);
    g_thumbThread = NULL;
    InterlockedExchange(&g_thumbStop, 0);
}

static void StartThumbnailWorker(void)
{
    ThumbBatch *batch;
    int i, n = 0;

    StopThumbnailWorker();
    for (i = 0; i < g_photos.count; i++)
        if (g_photos.items[i].thumb < 0 && !g_photos.items[i].missing) n++;
    if (!n) return;

    batch = (ThumbBatch *)XAlloc(sizeof(ThumbBatch));
    batch->jobs = (ThumbJob *)XAlloc((size_t)n * sizeof(ThumbJob));
    for (i = 0; i < g_photos.count && batch->count < n; i++) {
        if (g_photos.items[i].thumb >= 0 || g_photos.items[i].missing) continue;
        batch->jobs[batch->count].uid = g_photos.items[i].uid;
        StringCchCopyW(batch->jobs[batch->count].path, MAX_PATH,
                       g_photos.items[i].path);
        batch->count++;
    }
    g_thumbThread = CreateThread(NULL, 0, ThumbnailProc, batch, 0, NULL);
    if (!g_thumbThread) {
        free(batch->jobs);
        free(batch);
    }
}

/* ==========================================================================
 * Execucao de processo externo (ares-install)
 * ========================================================================== */

typedef struct {
    WCHAR commandLine[1024];
    WCHAR caption[128];
} RunTask;

static DWORD WINAPI RunProcessProc(LPVOID param)
{
    RunTask *task = (RunTask *)param;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    DWORD exitCode = (DWORD)-1;
    WCHAR *result;

    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    memset(&pi, 0, sizeof(pi));

    if (CreateProcessW(NULL, task->commandLine, NULL, NULL, FALSE,
                       CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, INFINITE);
        GetExitCodeProcess(pi.hProcess, &exitCode);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }

    result = (WCHAR *)XAlloc(512 * sizeof(WCHAR));
    if (exitCode == (DWORD)-1)
        StringCchPrintfW(result, 512,
                         L"Não foi possível iniciar o comando:\n%s\n\n"
                         L"Verifique se o CLI da LG (ares-install) está no PATH.",
                         task->commandLine);
    else if (exitCode == 0)
        StringCchPrintfW(result, 512, L"%s concluido com sucesso.",
                         task->caption);
    else
        StringCchPrintfW(result, 512,
                         L"%s terminou com código %lu. A janela do console "
                         L"mostra a saída do CLI da LG.",
                         task->caption, (unsigned long)exitCode);

    /* A thread de UI assume a posse da string. */
    if (!PostMessageW(g_main, WM_APP_TASK_DONE, (WPARAM)exitCode,
                      (LPARAM)result))
        free(result);
    free(task);
    return 0;
}

static void RunDetached(const WCHAR *commandLine, const WCHAR *caption)
{
    RunTask *task = (RunTask *)XAlloc(sizeof(RunTask));
    HANDLE th;
    StringCchCopyW(task->commandLine, ARRAYSIZE(task->commandLine), commandLine);
    StringCchCopyW(task->caption, ARRAYSIZE(task->caption), caption);
    th = CreateThread(NULL, 0, RunProcessProc, task, 0, NULL);
    if (th) CloseHandle(th);
    else free(task);
}

/* ==========================================================================
 * Dialogos comuns do shell
 * ========================================================================== */

static const GUID GUID_FileOpenDialogClass =
    { 0xdc1c5a9c, 0xe88a, 0x4dde,
      { 0xa5, 0xa1, 0x60, 0xf8, 0x2a, 0x20, 0xae, 0xf7 } };
static const GUID GUID_IFileOpenDialog =
    { 0xd57c7288, 0xd4ad, 0x4768,
      { 0xbe, 0x02, 0x9d, 0x96, 0x95, 0x32, 0xd9, 0x60 } };

static BOOL PickFolder(HWND owner, const WCHAR *title, WCHAR *out, int cch)
{
    IFileOpenDialog *dlg = NULL;
    IShellItem *item = NULL;
    PWSTR wide = NULL;
    DWORD opts = 0;
    BOOL ok = FALSE;

    if (FAILED(CoCreateInstance(&GUID_FileOpenDialogClass, NULL,
                                CLSCTX_INPROC_SERVER, &GUID_IFileOpenDialog,
                                (void **)&dlg)))
        return FALSE;

    IFileOpenDialog_SetTitle(dlg, title);
    if (SUCCEEDED(IFileOpenDialog_GetOptions(dlg, &opts)))
        IFileOpenDialog_SetOptions(dlg, opts | FOS_PICKFOLDERS |
                                        FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);

    if (SUCCEEDED(IFileOpenDialog_Show(dlg, owner)) &&
        SUCCEEDED(IFileOpenDialog_GetResult(dlg, &item)) && item) {
        if (SUCCEEDED(IShellItem_GetDisplayName(item, SIGDN_FILESYSPATH, &wide))
            && wide) {
            StringCchCopyW(out, (size_t)cch, wide);
            CoTaskMemFree(wide);
            ok = TRUE;
        }
        IShellItem_Release(item);
    }
    IFileOpenDialog_Release(dlg);
    return ok;
}

/* Selecao de varios arquivos; os caminhos vao para "out". */
static BOOL PickFiles(HWND owner, const WCHAR *title, const WCHAR *filterLabel,
                      const WCHAR *filterSpec, StrList *out)
{
    IFileOpenDialog *dlg = NULL;
    IShellItemArray *arr = NULL;
    COMDLG_FILTERSPEC filters[2];
    DWORD opts = 0, count = 0, i;
    BOOL ok = FALSE;

    if (FAILED(CoCreateInstance(&GUID_FileOpenDialogClass, NULL,
                                CLSCTX_INPROC_SERVER, &GUID_IFileOpenDialog,
                                (void **)&dlg)))
        return FALSE;

    filters[0].pszName = filterLabel;
    filters[0].pszSpec = filterSpec;
    filters[1].pszName = L"Todos os arquivos";
    filters[1].pszSpec = L"*.*";

    IFileOpenDialog_SetTitle(dlg, title);
    IFileOpenDialog_SetFileTypes(dlg, 2, filters);
    if (SUCCEEDED(IFileOpenDialog_GetOptions(dlg, &opts)))
        IFileOpenDialog_SetOptions(dlg, opts | FOS_ALLOWMULTISELECT |
                                        FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST);

    if (SUCCEEDED(IFileOpenDialog_Show(dlg, owner)) &&
        SUCCEEDED(IFileOpenDialog_GetResults(dlg, &arr)) && arr) {
        if (SUCCEEDED(IShellItemArray_GetCount(arr, &count))) {
            for (i = 0; i < count; i++) {
                IShellItem *item = NULL;
                PWSTR wide = NULL;
                if (FAILED(IShellItemArray_GetItemAt(arr, i, &item)) || !item)
                    continue;
                if (SUCCEEDED(IShellItem_GetDisplayName(item, SIGDN_FILESYSPATH,
                                                        &wide)) && wide) {
                    StrListAdd(out, wide);
                    CoTaskMemFree(wide);
                    ok = TRUE;
                }
                IShellItem_Release(item);
            }
        }
        IShellItemArray_Release(arr);
    }
    IFileOpenDialog_Release(dlg);
    return ok;
}

static BOOL PickSingleFile(HWND owner, const WCHAR *title,
                           const WCHAR *filterLabel, const WCHAR *filterSpec,
                           WCHAR *out, int cch)
{
    StrList list;
    BOOL ok;
    memset(&list, 0, sizeof(list));
    ok = PickFiles(owner, title, filterLabel, filterSpec, &list);
    if (ok && list.count) StringCchCopyW(out, (size_t)cch, list.items[0]);
    else ok = FALSE;
    StrListClear(&list);
    return ok;
}

/* ==========================================================================
 * Dialogos proprios (templates em LaurinhaManager.rc)
 * ========================================================================== */

typedef struct {
    const WCHAR *caption;
    const WCHAR *prompt;
    WCHAR       *text;      /* entrada e saida */
    int          cch;
} TextInputCtx;

static INT_PTR CALLBACK TextInputProc(HWND dlg, UINT msg, WPARAM wp, LPARAM lp)
{
    TextInputCtx *ctx = (TextInputCtx *)GetWindowLongPtrW(dlg, DWLP_USER);

    switch (msg) {
    case WM_INITDIALOG:
        ctx = (TextInputCtx *)lp;
        SetWindowLongPtrW(dlg, DWLP_USER, (LONG_PTR)ctx);
        SetWindowTextW(dlg, ctx->caption);
        SetDlgItemTextW(dlg, IDC_TEXT_PROMPT, ctx->prompt);
        SendDlgItemMessageW(dlg, IDC_TEXT_EDIT, EM_SETLIMITTEXT,
                            (WPARAM)(ctx->cch - 1), 0);
        SetDlgItemTextW(dlg, IDC_TEXT_EDIT, ctx->text);
        SendDlgItemMessageW(dlg, IDC_TEXT_EDIT, EM_SETSEL, 0, -1);
        SetFocus(GetDlgItem(dlg, IDC_TEXT_EDIT));
        return FALSE;

    case WM_COMMAND:
        if (LOWORD(wp) == IDOK) {
            if (ctx) {
                GetDlgItemTextW(dlg, IDC_TEXT_EDIT, ctx->text, ctx->cch);
                TrimW(ctx->text);
                if (!ctx->text[0]) {
                    MessageBoxW(dlg, L"Informe um nome.", APP_NAME,
                                MB_ICONINFORMATION | MB_OK);
                    return TRUE;
                }
            }
            EndDialog(dlg, IDOK);
            return TRUE;
        }
        if (LOWORD(wp) == IDCANCEL) { EndDialog(dlg, IDCANCEL); return TRUE; }
        break;

    case WM_CLOSE:
        EndDialog(dlg, IDCANCEL);
        return TRUE;
    }
    return FALSE;
}

static BOOL AskText(HWND owner, const WCHAR *caption, const WCHAR *prompt,
                    WCHAR *text, int cch)
{
    TextInputCtx ctx;
    ctx.caption = caption;
    ctx.prompt = prompt;
    ctx.text = text;
    ctx.cch = cch;
    return DialogBoxParamW(g_inst, MAKEINTRESOURCEW(IDD_TEXTINPUT), owner,
                           TextInputProc, (LPARAM)&ctx) == IDOK;
}

typedef struct {
    const WCHAR     *caption;
    const WCHAR     *prompt;
    const MediaList *source;
    const int       *exclude;      /* ids ja presentes, ignorados na lista */
    int              excludeCount;
    int             *picked;       /* saida: indices na biblioteca */
    int              pickedCount;
} PickerCtx;

static BOOL PickerIsExcluded(const PickerCtx *ctx, int id)
{
    int i;
    for (i = 0; i < ctx->excludeCount; i++)
        if (ctx->exclude[i] == id) return TRUE;
    return FALSE;
}

static INT_PTR CALLBACK PickerProc(HWND dlg, UINT msg, WPARAM wp, LPARAM lp)
{
    PickerCtx *ctx = (PickerCtx *)GetWindowLongPtrW(dlg, DWLP_USER);
    HWND list = GetDlgItem(dlg, IDC_PICK_LIST);
    int i;

    switch (msg) {
    case WM_INITDIALOG:
        ctx = (PickerCtx *)lp;
        SetWindowLongPtrW(dlg, DWLP_USER, (LONG_PTR)ctx);
        SetWindowTextW(dlg, ctx->caption);
        SetDlgItemTextW(dlg, IDC_PICK_PROMPT, ctx->prompt);
        for (i = 0; i < ctx->source->count; i++) {
            int pos;
            if (PickerIsExcluded(ctx, i)) continue;
            pos = (int)SendMessageW(list, LB_ADDSTRING, 0,
                                    (LPARAM)ctx->source->items[i].title);
            if (pos >= 0) SendMessageW(list, LB_SETITEMDATA, (WPARAM)pos, i);
        }
        if (!SendMessageW(list, LB_GETCOUNT, 0, 0))
            EnableWindow(GetDlgItem(dlg, IDOK), FALSE);
        SetFocus(list);
        return FALSE;

    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case IDC_PICK_ALL:
            SendMessageW(list, LB_SETSEL, TRUE, (LPARAM)-1);
            return TRUE;
        case IDC_PICK_NONE:
            SendMessageW(list, LB_SETSEL, FALSE, (LPARAM)-1);
            return TRUE;
        case IDOK: {
            int n = (int)SendMessageW(list, LB_GETSELCOUNT, 0, 0);
            int *sel;
            if (n <= 0) {
                MessageBoxW(dlg, L"Selecione ao menos um item.", APP_NAME,
                            MB_ICONINFORMATION | MB_OK);
                return TRUE;
            }
            sel = (int *)XAlloc((size_t)n * sizeof(int));
            SendMessageW(list, LB_GETSELITEMS, (WPARAM)n, (LPARAM)sel);
            ctx->picked = (int *)XAlloc((size_t)n * sizeof(int));
            for (i = 0; i < n; i++)
                ctx->picked[i] = (int)SendMessageW(list, LB_GETITEMDATA,
                                                   (WPARAM)sel[i], 0);
            ctx->pickedCount = n;
            free(sel);
            EndDialog(dlg, IDOK);
            return TRUE;
        }
        case IDCANCEL:
            EndDialog(dlg, IDCANCEL);
            return TRUE;
        }
        break;

    case WM_CLOSE:
        EndDialog(dlg, IDCANCEL);
        return TRUE;
    }
    return FALSE;
}

/* Devolve os indices escolhidos (o chamador libera ctx->picked). */
static BOOL AskPick(HWND owner, const WCHAR *caption, const WCHAR *prompt,
                    const MediaList *source, const Collection *exclude,
                    PickerCtx *ctx)
{
    memset(ctx, 0, sizeof(*ctx));
    ctx->caption = caption;
    ctx->prompt = prompt;
    ctx->source = source;
    ctx->exclude = exclude ? exclude->ids : NULL;
    ctx->excludeCount = exclude ? exclude->count : 0;
    return DialogBoxParamW(g_inst, MAKEINTRESOURCEW(IDD_PICKER), owner,
                           PickerProc, (LPARAM)ctx) == IDOK;
}

static INT_PTR CALLBACK SettingsProc(HWND dlg, UINT msg, WPARAM wp, LPARAM lp)
{
    WCHAR buf[MAX_PATH];
    (void)lp;

    switch (msg) {
    case WM_INITDIALOG:
        SetDlgItemTextW(dlg, IDC_SET_ROOT, g_root);
        SetDlgItemTextW(dlg, IDC_SET_HUBURL, g_hubUrl);
        SetDlgItemTextW(dlg, IDC_SET_LGDEVICE, g_lgDevice);
        SetDlgItemTextW(dlg, IDC_SET_LGIP, g_lgIp);
        SetDlgItemTextW(dlg, IDC_SET_IPK, g_ipkPath);
        SetDlgItemTextW(dlg, IDC_SET_HAURL, g_haUrl);
        SetDlgItemTextW(dlg, IDC_SET_ARES, g_aresPath);
        return TRUE;

    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case IDC_SET_ROOT_BROWSE:
            if (PickFolder(dlg, L"Pasta raiz da biblioteca", buf, MAX_PATH))
                SetDlgItemTextW(dlg, IDC_SET_ROOT, buf);
            return TRUE;
        case IDC_SET_IPK_BROWSE:
            if (PickSingleFile(dlg, L"Pacote IPK da LG", L"Pacote webOS (*.ipk)",
                               L"*.ipk", buf, MAX_PATH))
                SetDlgItemTextW(dlg, IDC_SET_IPK, buf);
            return TRUE;
        case IDOK:
            GetDlgItemTextW(dlg, IDC_SET_ROOT, buf, MAX_PATH);
            TrimW(buf);
            if (!buf[0]) {
                MessageBoxW(dlg, L"Informe a pasta raiz da biblioteca.",
                            APP_NAME, MB_ICONINFORMATION | MB_OK);
                return TRUE;
            }
            StringCchCopyW(g_root, MAX_PATH, buf);
            GetDlgItemTextW(dlg, IDC_SET_HUBURL, g_hubUrl, ARRAYSIZE(g_hubUrl));
            GetDlgItemTextW(dlg, IDC_SET_LGDEVICE, g_lgDevice,
                            ARRAYSIZE(g_lgDevice));
            GetDlgItemTextW(dlg, IDC_SET_LGIP, g_lgIp, ARRAYSIZE(g_lgIp));
            GetDlgItemTextW(dlg, IDC_SET_IPK, g_ipkPath, MAX_PATH);
            GetDlgItemTextW(dlg, IDC_SET_HAURL, g_haUrl, ARRAYSIZE(g_haUrl));
            GetDlgItemTextW(dlg, IDC_SET_ARES, g_aresPath, MAX_PATH);
            if (!g_aresPath[0])
                StringCchCopyW(g_aresPath, MAX_PATH, L"ares-install");
            EndDialog(dlg, IDOK);
            return TRUE;
        case IDCANCEL:
            EndDialog(dlg, IDCANCEL);
            return TRUE;
        }
        break;

    case WM_CLOSE:
        EndDialog(dlg, IDCANCEL);
        return TRUE;
    }
    return FALSE;
}

/* ==========================================================================
 * Construcao da interface
 * ========================================================================== */

enum { BK_NAV = 1, BK_PRIMARY, BK_SECONDARY };

typedef struct {
    RECT  rc;
    WCHAR text[200];
    int   style;           /* 0 = titulo de secao, 1 = texto secundario */
} Caption;

static Caption g_caps[28];
static int     g_capCount;
static RECT    g_cards[8];
static int     g_cardCount;

static void ResetChrome(void)
{
    g_capCount = 0;
    g_cardCount = 0;
}

static void AddCard(int x, int y, int w, int h)
{
    RECT *r;
    if (g_cardCount >= (int)ARRAYSIZE(g_cards)) return;
    r = &g_cards[g_cardCount++];
    r->left = x; r->top = y; r->right = x + w; r->bottom = y + h;
}

static void AddCap(int x, int y, int w, int h, int style, const WCHAR *fmt, ...)
{
    Caption *c;
    va_list ap;
    if (g_capCount >= (int)ARRAYSIZE(g_caps)) return;
    c = &g_caps[g_capCount++];
    c->rc.left = x; c->rc.top = y; c->rc.right = x + w; c->rc.bottom = y + h;
    c->style = style;
    va_start(ap, fmt);
    StringCchVPrintfW(c->text, ARRAYSIZE(c->text), fmt, ap);
    va_end(ap);
}

static LRESULT CALLBACK ButtonSubclass(HWND hwnd, UINT msg, WPARAM wp,
                                       LPARAM lp, UINT_PTR id, DWORD_PTR ref)
{
    (void)id; (void)ref;
    switch (msg) {
    case WM_MOUSEMOVE:
        if (g_hover != hwnd) {
            TRACKMOUSEEVENT tme;
            HWND old = g_hover;
            g_hover = hwnd;
            if (old) InvalidateRect(old, NULL, TRUE);
            InvalidateRect(hwnd, NULL, TRUE);
            tme.cbSize = sizeof(tme);
            tme.dwFlags = TME_LEAVE;
            tme.hwndTrack = hwnd;
            tme.dwHoverTime = 0;
            TrackMouseEvent(&tme);
        }
        break;
    case WM_MOUSELEAVE:
        if (g_hover == hwnd) {
            g_hover = NULL;
            InvalidateRect(hwnd, NULL, TRUE);
        }
        break;
    case WM_NCDESTROY:
        RemoveWindowSubclass(hwnd, ButtonSubclass, id);
        break;
    }
    return DefSubclassProc(hwnd, msg, wp, lp);
}

static HWND MakeButton(HWND parent, int id, const WCHAR *text, int kind)
{
    HWND b = CreateWindowExW(0, L"BUTTON", text,
                             WS_CHILD | WS_TABSTOP | BS_OWNERDRAW,
                             0, 0, 10, 10, parent, (HMENU)(INT_PTR)id,
                             g_inst, NULL);
    if (!b) return NULL;
    SetWindowLongPtrW(b, GWLP_USERDATA, kind);
    SetWindowSubclass(b, ButtonSubclass, (UINT_PTR)id, 0);
    return b;
}

static HWND MakeCheck(HWND parent, int id, const WCHAR *text)
{
    HWND c = CreateWindowExW(0, L"BUTTON", text,
                             WS_CHILD | WS_TABSTOP | BS_AUTOCHECKBOX,
                             0, 0, 10, 10, parent, (HMENU)(INT_PTR)id,
                             g_inst, NULL);
    if (c) SendMessageW(c, WM_SETFONT, (WPARAM)g_fontUI, TRUE);
    return c;
}

static HWND MakeCombo(HWND parent, int id, const WCHAR **items, int count)
{
    int i;
    HWND c = CreateWindowExW(0, L"COMBOBOX", NULL,
                             WS_CHILD | WS_TABSTOP | WS_VSCROLL |
                             CBS_DROPDOWNLIST,
                             0, 0, 10, 200, parent, (HMENU)(INT_PTR)id,
                             g_inst, NULL);
    if (!c) return NULL;
    SendMessageW(c, WM_SETFONT, (WPARAM)g_fontUI, TRUE);
    for (i = 0; i < count; i++)
        SendMessageW(c, CB_ADDSTRING, 0, (LPARAM)items[i]);
    SendMessageW(c, CB_SETCURSEL, 0, 0);
    return c;
}

static HWND MakeTrack(HWND parent, int id, int lo, int hi)
{
    HWND t = CreateWindowExW(0, TRACKBAR_CLASSW, NULL,
                             WS_CHILD | WS_TABSTOP | TBS_HORZ | TBS_NOTICKS,
                             0, 0, 10, 10, parent, (HMENU)(INT_PTR)id,
                             g_inst, NULL);
    if (!t) return NULL;
    SendMessageW(t, TBM_SETRANGE, TRUE, MAKELPARAM(lo, hi));
    SendMessageW(t, TBM_SETPAGESIZE, 0, 5);
    return t;
}

static HWND MakeListBox(HWND parent, int id, BOOL multi)
{
    HWND l = CreateWindowExW(WS_EX_CLIENTEDGE, L"LISTBOX", NULL,
                             WS_CHILD | WS_TABSTOP | WS_VSCROLL |
                             LBS_NOTIFY | LBS_NOINTEGRALHEIGHT |
                             (multi ? LBS_EXTENDEDSEL : 0),
                             0, 0, 10, 10, parent, (HMENU)(INT_PTR)id,
                             g_inst, NULL);
    if (l) SendMessageW(l, WM_SETFONT, (WPARAM)g_fontUI, TRUE);
    return l;
}

static HWND MakeListView(HWND parent, int id, DWORD extraStyle)
{
    HWND lv = CreateWindowExW(WS_EX_CLIENTEDGE, WC_LISTVIEWW, NULL,
                              WS_CHILD | WS_TABSTOP | LVS_SHOWSELALWAYS |
                              extraStyle,
                              0, 0, 10, 10, parent, (HMENU)(INT_PTR)id,
                              g_inst, NULL);
    if (!lv) return NULL;
    SendMessageW(lv, WM_SETFONT, (WPARAM)g_fontUI, TRUE);
    ListView_SetBkColor(lv, CLR_SURFACE);
    ListView_SetTextBkColor(lv, CLR_SURFACE);
    ListView_SetTextColor(lv, CLR_TEXT);
    return lv;
}

/* GetDpiForWindow so existe a partir do Windows 10 1607; nas versoes
   anteriores o DPI do desktop serve, ja que o manifesto pede System. */
static int QueryDpi(HWND hwnd)
{
    typedef UINT (WINAPI *PFNGETDPIFORWINDOW)(HWND);
    static PFNGETDPIFORWINDOW getDpi;
    static BOOL resolved;
    int dpi;

    if (!resolved) {
        HMODULE user32 = GetModuleHandleW(L"user32.dll");
        if (user32)
            getDpi = (PFNGETDPIFORWINDOW)(void *)GetProcAddress(
                         user32, "GetDpiForWindow");
        resolved = TRUE;
    }
    if (getDpi) {
        UINT v = getDpi(hwnd);
        if (v >= 72) return (int)v;
    }
    {
        HDC dc = GetDC(NULL);
        dpi = dc ? GetDeviceCaps(dc, LOGPIXELSX) : 96;
        if (dc) ReleaseDC(NULL, dc);
    }
    return dpi >= 72 ? dpi : 96;
}

static void MakeFonts(void)
{
    LOGFONTW lf;
    if (g_fontUI)    { DeleteObject(g_fontUI);    g_fontUI = NULL; }
    if (g_fontBold)  { DeleteObject(g_fontBold);  g_fontBold = NULL; }
    if (g_fontTitle) { DeleteObject(g_fontTitle); g_fontTitle = NULL; }
    if (g_fontSmall) { DeleteObject(g_fontSmall); g_fontSmall = NULL; }

    memset(&lf, 0, sizeof(lf));
    StringCchCopyW(lf.lfFaceName, ARRAYSIZE(lf.lfFaceName), L"Segoe UI");
    lf.lfCharSet = DEFAULT_CHARSET;
    lf.lfQuality = CLEARTYPE_QUALITY;

    lf.lfHeight = -MulDiv(9, g_dpi, 72);
    lf.lfWeight = FW_NORMAL;
    g_fontUI = CreateFontIndirectW(&lf);

    lf.lfWeight = FW_SEMIBOLD;
    g_fontBold = CreateFontIndirectW(&lf);

    lf.lfHeight = -MulDiv(16, g_dpi, 72);
    lf.lfWeight = FW_SEMIBOLD;
    g_fontTitle = CreateFontIndirectW(&lf);

    lf.lfHeight = -MulDiv(8, g_dpi, 72);
    lf.lfWeight = FW_NORMAL;
    g_fontSmall = CreateFontIndirectW(&lf);
}

static void ApplyFontToChildren(HWND parent)
{
    HWND child = GetWindow(parent, GW_CHILD);
    while (child) {
        SendMessageW(child, WM_SETFONT, (WPARAM)g_fontUI, TRUE);
        child = GetWindow(child, GW_HWNDNEXT);
    }
}

static const WCHAR *g_navText[PAGE_COUNT] = {
    L"Música", L"Fotos", L"Modo Quadro", L"Status"
};

static const WCHAR *g_cmdText[IDC_CMD_COUNT] = {
    L"Adicionar músicas", L"Adicionar fotos", L"Atualizar biblioteca",
    L"Abrir Hub", L"Visualizar TV", L"Instalar na LG"
};

static const WCHAR *g_frameNames[] = {
    L"Nenhuma", L"Fina clara", L"Madeira", L"Cerejinha"
};
static const WCHAR *g_bgNames[] = {
    L"Preto", L"Branco", L"Cerejinha suave", L"Desfoque da foto"
};
static const WCHAR *g_sortNames[] = {
    L"Nome (A-Z)", L"Nome (Z-A)", L"Data (mais antigas)",
    L"Data (mais recentes)", L"Inverter ordem atual"
};

static void CreateControls(HWND hwnd)
{
    int i;
    HWND lv;

    /* Trilho e barra de comandos ficam sempre visiveis; ShowPage() so
       controla os controles da pagina ativa. */
    for (i = 0; i < PAGE_COUNT; i++) {
        g_navBtn[i] = MakeButton(hwnd, IDC_NAV_FIRST + i, g_navText[i], BK_NAV);
        if (g_navBtn[i]) ShowWindow(g_navBtn[i], SW_SHOW);
    }
    for (i = 0; i < IDC_CMD_COUNT; i++) {
        g_cmdBtn[i] = MakeButton(hwnd, IDC_CMD_FIRST + i, g_cmdText[i],
                                 i == 2 ? BK_PRIMARY : BK_SECONDARY);
        if (g_cmdBtn[i]) ShowWindow(g_cmdBtn[i], SW_SHOW);
    }

    /* ---- Musica ---- */
    MakeListBox(hwnd, IDC_MUS_PLAYLISTS, FALSE);
    MakeButton(hwnd, IDC_MUS_NEW, L"Nova playlist", BK_SECONDARY);
    MakeButton(hwnd, IDC_MUS_RENAME, L"Renomear", BK_SECONDARY);
    MakeButton(hwnd, IDC_MUS_DELETE, L"Excluir", BK_SECONDARY);

    lv = MakeListView(hwnd, IDC_MUS_TRACKS,
                      LVS_REPORT | WS_VSCROLL);
    if (lv) {
        LVCOLUMNW col;
        ListView_SetExtendedListViewStyle(lv,
            LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_LABELTIP);
        memset(&col, 0, sizeof(col));
        col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_SUBITEM;
        col.pszText = (LPWSTR)L"#";
        col.cx = 44;
        ListView_InsertColumn(lv, 0, &col);
        col.pszText = (LPWSTR)L"Faixa";
        col.cx = 300;
        col.iSubItem = 1;
        ListView_InsertColumn(lv, 1, &col);
        col.pszText = (LPWSTR)L"Arquivo";
        col.cx = 420;
        col.iSubItem = 2;
        ListView_InsertColumn(lv, 2, &col);
    }
    MakeButton(hwnd, IDC_MUS_ADD, L"Adicionar faixas...", BK_SECONDARY);
    MakeButton(hwnd, IDC_MUS_UP, L"Subir", BK_SECONDARY);
    MakeButton(hwnd, IDC_MUS_DOWN, L"Descer", BK_SECONDARY);
    MakeButton(hwnd, IDC_MUS_REMOVE, L"Remover", BK_SECONDARY);

    /* ---- Fotos ---- */
    MakeListBox(hwnd, IDC_PHO_ALBUMS, FALSE);
    MakeButton(hwnd, IDC_PHO_NEW, L"Novo álbum", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_RENAME, L"Renomear", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_DELETE, L"Excluir", BK_SECONDARY);

    lv = MakeListView(hwnd, IDC_PHO_GRID, LVS_ICON | LVS_AUTOARRANGE |
                                          WS_VSCROLL);
    if (lv) {
        ListView_SetExtendedListViewStyle(lv, LVS_EX_DOUBLEBUFFER);
        ListView_SetIconSpacing(lv, THUMB_PX + 34, THUMB_PX + 48);
    }
    MakeButton(hwnd, IDC_PHO_ADD, L"Adicionar fotos...", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_UP, L"Subir", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_DOWN, L"Descer", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_COVER, L"Definir capa", BK_SECONDARY);
    MakeButton(hwnd, IDC_PHO_REMOVE, L"Remover", BK_SECONDARY);
    MakeCombo(hwnd, IDC_PHO_SORTMODE, g_sortNames, ARRAYSIZE(g_sortNames));
    MakeButton(hwnd, IDC_PHO_SORTAPPLY, L"Ordenar", BK_SECONDARY);
    MakeTrack(hwnd, IDC_PHO_INTERVAL, 3, 120);

    /* ---- Modo Quadro ---- */
    MakeTrack(hwnd, IDC_FR_SECONDS, 3, 300);
    MakeCheck(hwnd, IDC_FR_FADE, L"Transição com fade");
    MakeCheck(hwnd, IDC_FR_RANDOM, L"Ordem aleatória");
    MakeCheck(hwnd, IDC_FR_CAPTION, L"Mostrar legenda");
    MakeCombo(hwnd, IDC_FR_FRAME, g_frameNames, ARRAYSIZE(g_frameNames));
    MakeCombo(hwnd, IDC_FR_BG, g_bgNames, ARRAYSIZE(g_bgNames));
    MakeTrack(hwnd, IDC_FR_PASSE, 0, 25);

    /* ---- Status ---- */
    MakeButton(hwnd, IDC_ST_CHECK, L"Verificar agora", BK_SECONDARY);
    MakeButton(hwnd, IDC_ST_SETTINGS, L"Configurações...", BK_SECONDARY);
    MakeButton(hwnd, IDC_ST_FOLDER, L"Abrir pasta da biblioteca", BK_SECONDARY);

    ApplyFontToChildren(hwnd);
}

/* ==========================================================================
 * Layout
 * ========================================================================== */

static void PlaceCtl(int id, int x, int y, int w, int h)
{
    HWND c = GetDlgItem(g_main, id);
    if (c) MoveWindow(c, x, y, w, h, TRUE);
}

static int MeasureText(const WCHAR *text, HFONT font)
{
    HDC dc = GetDC(g_main);
    HFONT old = (HFONT)SelectObject(dc, font);
    SIZE sz = { 0, 0 };
    GetTextExtentPoint32W(dc, text, lstrlenW(text), &sz);
    SelectObject(dc, old);
    ReleaseDC(g_main, dc);
    return sz.cx;
}

static const WCHAR *CurrentPlaylistName(void)
{
    if (g_curPlaylist <= 0) return L"Biblioteca completa";
    return g_playlists.items[g_curPlaylist - 1].name;
}

static int CurrentPlaylistCount(void)
{
    if (g_curPlaylist <= 0) return g_tracks.count;
    return g_playlists.items[g_curPlaylist - 1].count;
}

static const WCHAR *CurrentAlbumName(void)
{
    if (g_curAlbum <= 0) return L"Todas as fotos";
    return g_albums.items[g_curAlbum - 1].name;
}

static int CurrentAlbumCount(void)
{
    if (g_curAlbum <= 0) return g_photos.count;
    return g_albums.items[g_curAlbum - 1].count;
}

/* Distribui "n" botoes lado a lado dentro de (x,w). */
static void RowOfButtons(const int *ids, int n, int x, int y, int w, int h)
{
    int gap = ScaleDpi(6);
    int each = (w - gap * (n - 1)) / n;
    int i;
    for (i = 0; i < n; i++)
        PlaceCtl(ids[i], x + i * (each + gap), y, each, h);
}

static void LayoutMusic(int x, int y, int w, int h)
{
    static const int leftBtns[] = { IDC_MUS_NEW, IDC_MUS_RENAME, IDC_MUS_DELETE };
    static const int rightBtns[] = { IDC_MUS_ADD, IDC_MUS_UP, IDC_MUS_DOWN,
                                     IDC_MUS_REMOVE };
    int pad = ScaleDpi(12), hdr = ScaleDpi(24), btnH = ScaleDpi(30);
    int gap = ScaleDpi(14), leftW = ScaleDpi(250);
    int rx = x + leftW + gap, rw = w - leftW - gap;
    int listY = y + pad + hdr + ScaleDpi(6);
    int listH = h - (listY - y) - btnH - pad * 2;

    if (listH < ScaleDpi(60)) listH = ScaleDpi(60);

    AddCard(x, y, leftW, h);
    AddCap(x + pad, y + pad, leftW - pad * 2, hdr, 0, L"Playlists");
    PlaceCtl(IDC_MUS_PLAYLISTS, x + pad, listY, leftW - pad * 2, listH);
    RowOfButtons(leftBtns, 3, x + pad, listY + listH + ScaleDpi(8),
                 leftW - pad * 2, btnH);

    AddCard(rx, y, rw, h);
    AddCap(rx + pad, y + pad, rw - pad * 2, hdr, 0, L"%s - %d faixa(s)",
           CurrentPlaylistName(), CurrentPlaylistCount());
    AddCap(rx + pad, y + pad + hdr - ScaleDpi(2), rw - pad * 2, hdr, 1,
           L"Biblioteca: %d faixa(s) em %d playlist(s). Remover de uma "
           L"playlist nunca apaga o arquivo original.",
           g_tracks.count, g_playlists.count);
    PlaceCtl(IDC_MUS_TRACKS, rx + pad, listY + ScaleDpi(14), rw - pad * 2,
             listH - ScaleDpi(14));
    RowOfButtons(rightBtns, 4, rx + pad, listY + listH + ScaleDpi(8),
                 rw - pad * 2, btnH);
}

static void LayoutPhotos(int x, int y, int w, int h)
{
    static const int leftBtns[] = { IDC_PHO_NEW, IDC_PHO_RENAME, IDC_PHO_DELETE };
    static const int rightBtns[] = { IDC_PHO_ADD, IDC_PHO_UP, IDC_PHO_DOWN,
                                     IDC_PHO_COVER, IDC_PHO_REMOVE };
    int pad = ScaleDpi(12), hdr = ScaleDpi(24), btnH = ScaleDpi(30);
    int gap = ScaleDpi(14), leftW = ScaleDpi(250);
    int rx = x + leftW + gap, rw = w - leftW - gap;
    int listY = y + pad + hdr + ScaleDpi(6);
    int leftListH = h - (listY - y) - btnH - pad * 2;
    int toolsH = btnH * 2 + ScaleDpi(10);
    int gridH = h - (listY - y) - toolsH - pad * 2 - ScaleDpi(14);
    int toolY, comboW, trackX, capW;

    if (leftListH < ScaleDpi(60)) leftListH = ScaleDpi(60);
    if (gridH < ScaleDpi(80)) gridH = ScaleDpi(80);

    AddCard(x, y, leftW, h);
    AddCap(x + pad, y + pad, leftW - pad * 2, hdr, 0, L"Álbuns");
    PlaceCtl(IDC_PHO_ALBUMS, x + pad, listY, leftW - pad * 2, leftListH);
    RowOfButtons(leftBtns, 3, x + pad, listY + leftListH + ScaleDpi(8),
                 leftW - pad * 2, btnH);

    AddCard(rx, y, rw, h);
    AddCap(rx + pad, y + pad, rw - pad * 2, hdr, 0, L"%s - %d foto(s)",
           CurrentAlbumName(), CurrentAlbumCount());
    AddCap(rx + pad, y + pad + hdr - ScaleDpi(2), rw - pad * 2, hdr, 1,
           L"Biblioteca: %d foto(s) em %d álbum(ns). As fotos permanecem "
           L"nas pastas de origem.", g_photos.count, g_albums.count);
    PlaceCtl(IDC_PHO_GRID, rx + pad, listY + ScaleDpi(14), rw - pad * 2, gridH);

    toolY = listY + ScaleDpi(14) + gridH + ScaleDpi(10);
    comboW = ScaleDpi(180);
    PlaceCtl(IDC_PHO_SORTMODE, rx + pad, toolY, comboW, ScaleDpi(200));
    PlaceCtl(IDC_PHO_SORTAPPLY, rx + pad + comboW + ScaleDpi(6), toolY,
             ScaleDpi(96), btnH);

    trackX = rx + pad + comboW + ScaleDpi(6) + ScaleDpi(96) + ScaleDpi(20);
    capW = ScaleDpi(210);
    if (g_curAlbum > 0)
        AddCap(trackX, toolY + ScaleDpi(6), capW, ScaleDpi(18), 1,
               L"Intervalo do álbum: %d s",
               g_albums.items[g_curAlbum - 1].interval);
    else
        AddCap(trackX, toolY + ScaleDpi(6), capW, ScaleDpi(18), 1,
               L"Intervalo: escolha um álbum");
    PlaceCtl(IDC_PHO_INTERVAL, trackX + capW + ScaleDpi(8), toolY,
             (rx + rw - pad) - (trackX + capW + ScaleDpi(8)), btnH);

    RowOfButtons(rightBtns, 5, rx + pad, toolY + btnH + ScaleDpi(10),
                 rw - pad * 2, btnH);
}

static void LayoutFrame(int x, int y, int w, int h)
{
    int pad = ScaleDpi(14), hdr = ScaleDpi(24), rowH = ScaleDpi(28);
    int gap = ScaleDpi(14), leftW = ScaleDpi(360);
    int rx = x + leftW + gap, rw = w - leftW - gap;
    int cy = y + pad + hdr + ScaleDpi(8);
    int fieldW = leftW - pad * 2;

    AddCard(x, y, leftW, h);
    AddCap(x + pad, y + pad, fieldW, hdr, 0, L"Modo Quadro");

    AddCap(x + pad, cy, fieldW, ScaleDpi(20), 1, L"Tempo por foto: %d s",
           g_frame.seconds);
    cy += ScaleDpi(22);
    PlaceCtl(IDC_FR_SECONDS, x + pad, cy, fieldW, rowH);
    cy += rowH + ScaleDpi(12);

    PlaceCtl(IDC_FR_FADE, x + pad, cy, fieldW, rowH);
    cy += rowH;
    PlaceCtl(IDC_FR_RANDOM, x + pad, cy, fieldW, rowH);
    cy += rowH;
    PlaceCtl(IDC_FR_CAPTION, x + pad, cy, fieldW, rowH);
    cy += rowH + ScaleDpi(12);

    AddCap(x + pad, cy, fieldW, ScaleDpi(20), 1, L"Moldura");
    cy += ScaleDpi(22);
    PlaceCtl(IDC_FR_FRAME, x + pad, cy, fieldW, ScaleDpi(220));
    cy += rowH + ScaleDpi(12);

    AddCap(x + pad, cy, fieldW, ScaleDpi(20), 1, L"Fundo");
    cy += ScaleDpi(22);
    PlaceCtl(IDC_FR_BG, x + pad, cy, fieldW, ScaleDpi(220));
    cy += rowH + ScaleDpi(12);

    AddCap(x + pad, cy, fieldW, ScaleDpi(20), 1, L"Passe-partout: %d%%",
           g_frame.passepartout);
    cy += ScaleDpi(22);
    PlaceCtl(IDC_FR_PASSE, x + pad, cy, fieldW, rowH);
    cy += rowH + ScaleDpi(14);

    AddCap(x + pad, cy, fieldW, h - (cy - y) - pad, 1,
           L"Estas opções vão para frameMode no manifesto do Hub e valem "
           L"também para Visualizar TV.");

    AddCard(rx, y, rw, h);
    AddCap(rx + pad, y + pad, rw - pad * 2, hdr, 0, L"Prévia");
    g_rcFramePreview.left = rx + pad;
    g_rcFramePreview.top = y + pad + hdr + ScaleDpi(8);
    g_rcFramePreview.right = rx + rw - pad;
    g_rcFramePreview.bottom = y + h - pad;
}

static void LayoutStatus(int x, int y, int w, int h)
{
    static const int btns[] = { IDC_ST_CHECK, IDC_ST_SETTINGS, IDC_ST_FOLDER };
    int pad = ScaleDpi(14), hdr = ScaleDpi(24), btnH = ScaleDpi(30);
    int i, gap = ScaleDpi(8);
    int bx = x + pad, by = y + h - pad - btnH;
    int widths[3];
    int cur = bx;

    AddCard(x, y, w, h);
    AddCap(x + pad, y + pad, w - pad * 2, hdr, 0, L"Status da instalação");
    AddCap(x + pad, y + pad + hdr - ScaleDpi(2), w - pad * 2, ScaleDpi(20), 1,
           L"Verificações locais: o programa lê arquivos e variáveis de "
           L"ambiente desta máquina, não faz sondagem de rede.");

    g_rcStatusList.left = x + pad;
    g_rcStatusList.top = y + pad + hdr + ScaleDpi(24);
    g_rcStatusList.right = x + w - pad;
    g_rcStatusList.bottom = by - ScaleDpi(12);

    for (i = 0; i < 3; i++) {
        WCHAR text[96];
        HWND b = GetDlgItem(g_main, btns[i]);
        text[0] = 0;
        if (b) GetWindowTextW(b, text, ARRAYSIZE(text));
        widths[i] = MeasureText(text, g_fontUI) + ScaleDpi(30);
    }
    for (i = 0; i < 3; i++) {
        PlaceCtl(btns[i], cur, by, widths[i], btnH);
        cur += widths[i] + gap;
    }
}

static void Layout(void)
{
    RECT rc;
    int pad = ScaleDpi(16);
    int headerH = ScaleDpi(76), railW = ScaleDpi(196), cmdH = ScaleDpi(70);
    int navH = ScaleDpi(42), btnH = ScaleDpi(38);
    int i, y, cur, total = 0, widths[IDC_CMD_COUNT];

    if (!g_main) return;
    GetClientRect(g_main, &rc);
    ResetChrome();

    SetRect(&g_rcHeader, 0, 0, rc.right, headerH);
    SetRect(&g_rcCommands, 0, rc.bottom - cmdH, rc.right, rc.bottom);
    SetRect(&g_rcRail, 0, headerH, railW, rc.bottom - cmdH);
    SetRect(&g_rcContent, railW, headerH, rc.right, rc.bottom - cmdH);

    y = headerH + ScaleDpi(14);
    for (i = 0; i < PAGE_COUNT; i++) {
        PlaceCtl(IDC_NAV_FIRST + i, ScaleDpi(10), y, railW - ScaleDpi(20), navH);
        y += navH + ScaleDpi(6);
    }

    for (i = 0; i < IDC_CMD_COUNT; i++) {
        widths[i] = MeasureText(g_cmdText[i], g_fontUI) + ScaleDpi(30);
        if (widths[i] < ScaleDpi(110)) widths[i] = ScaleDpi(110);
        total += widths[i];
    }
    {
        int gap = ScaleDpi(10);
        int avail = rc.right - pad * 2 - gap * (IDC_CMD_COUNT - 1);
        if (total > avail && total > 0) {
            for (i = 0; i < IDC_CMD_COUNT; i++)
                widths[i] = MulDiv(widths[i], avail, total);
        }
        cur = pad;
        for (i = 0; i < IDC_CMD_COUNT; i++) {
            PlaceCtl(IDC_CMD_FIRST + i, cur,
                     g_rcCommands.top + (cmdH - btnH) / 2, widths[i], btnH);
            cur += widths[i] + gap;
        }
    }

    {
        int cx = g_rcContent.left + pad;
        int cy = g_rcContent.top + pad;
        int cw = g_rcContent.right - g_rcContent.left - pad * 2;
        int ch = g_rcContent.bottom - g_rcContent.top - pad * 2;
        if (cw < ScaleDpi(200)) cw = ScaleDpi(200);
        if (ch < ScaleDpi(200)) ch = ScaleDpi(200);
        switch (g_page) {
        case PAGE_MUSIC:  LayoutMusic(cx, cy, cw, ch);  break;
        case PAGE_PHOTOS: LayoutPhotos(cx, cy, cw, ch); break;
        case PAGE_FRAME:  LayoutFrame(cx, cy, cw, ch);  break;
        default:          LayoutStatus(cx, cy, cw, ch); break;
        }
    }
    InvalidateRect(g_main, NULL, TRUE);
}

/* Controles de cada pagina; o restante fica oculto. */
static const int g_pageCtls[PAGE_COUNT][12] = {
    { IDC_MUS_PLAYLISTS, IDC_MUS_NEW, IDC_MUS_RENAME, IDC_MUS_DELETE,
      IDC_MUS_TRACKS, IDC_MUS_ADD, IDC_MUS_UP, IDC_MUS_DOWN, IDC_MUS_REMOVE,
      0, 0, 0 },
    { IDC_PHO_ALBUMS, IDC_PHO_NEW, IDC_PHO_RENAME, IDC_PHO_DELETE,
      IDC_PHO_GRID, IDC_PHO_ADD, IDC_PHO_UP, IDC_PHO_DOWN, IDC_PHO_COVER,
      IDC_PHO_REMOVE, IDC_PHO_SORTMODE, IDC_PHO_SORTAPPLY },
    { IDC_FR_SECONDS, IDC_FR_FADE, IDC_FR_RANDOM, IDC_FR_CAPTION,
      IDC_FR_FRAME, IDC_FR_BG, IDC_FR_PASSE, 0, 0, 0, 0, 0 },
    { IDC_ST_CHECK, IDC_ST_SETTINGS, IDC_ST_FOLDER, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
};

static void ShowPage(int page)
{
    int p, i;
    if (page < 0 || page >= PAGE_COUNT) return;
    g_page = page;

    for (p = 0; p < PAGE_COUNT; p++) {
        for (i = 0; i < 12; i++) {
            int id = g_pageCtls[p][i];
            HWND c;
            if (!id) continue;
            c = GetDlgItem(g_main, id);
            if (c) ShowWindow(c, p == page ? SW_SHOW : SW_HIDE);
        }
    }
    /* IDC_PHO_INTERVAL nao cabe na tabela acima (13o controle da pagina). */
    {
        HWND c = GetDlgItem(g_main, IDC_PHO_INTERVAL);
        if (c) ShowWindow(c, page == PAGE_PHOTOS ? SW_SHOW : SW_HIDE);
    }
    for (i = 0; i < PAGE_COUNT; i++)
        if (g_navBtn[i]) InvalidateRect(g_navBtn[i], NULL, TRUE);

    if (page == PAGE_STATUS) RecomputeStatus();
    Layout();
}

/* ==========================================================================
 * Pintura
 * ========================================================================== */

static void FillColor(HDC dc, const RECT *rc, COLORREF color)
{
    HBRUSH br = CreateSolidBrush(color);
    FillRect(dc, rc, br);
    DeleteObject(br);
}

static void HLine(HDC dc, int x1, int x2, int y, COLORREF color)
{
    RECT r;
    SetRect(&r, x1, y, x2, y + 1);
    FillColor(dc, &r, color);
}

static void RoundPanel(HDC dc, const RECT *rc, int radius, COLORREF fill,
                       COLORREF border)
{
    HBRUSH br = CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    HBRUSH oldBr = (HBRUSH)SelectObject(dc, br);
    HPEN oldPen = (HPEN)SelectObject(dc, pen);
    RoundRect(dc, rc->left, rc->top, rc->right, rc->bottom, radius, radius);
    SelectObject(dc, oldBr);
    SelectObject(dc, oldPen);
    DeleteObject(br);
    DeleteObject(pen);
}

static void TextOutRect(HDC dc, const WCHAR *text, const RECT *rc, HFONT font,
                        COLORREF color, UINT flags)
{
    HFONT old = (HFONT)SelectObject(dc, font);
    RECT r = *rc;
    SetTextColor(dc, color);
    SetBkMode(dc, TRANSPARENT);
    DrawTextW(dc, text, -1, &r, flags);
    SelectObject(dc, old);
}

/* Miniatura em cache usada pela previa do Modo Quadro. */
static HBITMAP g_previewBmp;
static int     g_previewIdx = -1;

static int PreviewPhotoIndex(void)
{
    if (g_curAlbum > 0) {
        const Collection *c = &g_albums.items[g_curAlbum - 1];
        if (c->cover >= 0 && c->cover < g_photos.count) return c->cover;
        if (c->count) return c->ids[0];
    }
    return g_photos.count ? 0 : -1;
}

static void InvalidatePreviewCache(void)
{
    if (g_previewBmp) { DeleteObject(g_previewBmp); g_previewBmp = NULL; }
    g_previewIdx = -1;
}

static HBITMAP PreviewBitmap(int width)
{
    int idx = PreviewPhotoIndex();
    if (idx < 0) { InvalidatePreviewCache(); return NULL; }
    if (g_previewBmp && g_previewIdx == idx) return g_previewBmp;
    InvalidatePreviewCache();
    if (width < 160) width = 160;
    g_previewBmp = LoadShellImage(g_photos.items[idx].path, width, width);
    g_previewIdx = g_previewBmp ? idx : -1;
    return g_previewBmp;
}

static COLORREF FrameBackgroundColor(void)
{
    switch (g_frame.background) {
    case 0:  return RGB(0x0D, 0x0B, 0x0C);
    case 1:  return RGB(0xF7, 0xF7, 0xF7);
    case 2:  return RGB(0x3A, 0x18, 0x21);
    default: return RGB(0x1A, 0x14, 0x16);
    }
}

static COLORREF FrameBorderColor(void)
{
    switch (g_frame.frame) {
    case 1:  return RGB(0xEC, 0xE6, 0xE2);
    case 2:  return RGB(0x7A, 0x55, 0x34);
    case 3:  return CLR_ACCENT;
    default: return 0;
    }
}

/* Desenha uma composicao completa do Modo Quadro (fundo, moldura,
   passe-partout, foto e legenda) dentro de "tv". Usada tanto pela previa
   da pagina quanto pela janela de Visualizar TV, para que as duas mostrem
   exatamente o mesmo resultado. */
static void RenderQuadro(HDC dc, const RECT *tv, HBITMAP photo,
                         const WCHAR *caption, HFONT captionFont)
{
    RECT inner, area, band;
    int tvH = tv->bottom - tv->top;
    int frameW, passe;

    FillColor(dc, tv, FrameBackgroundColor());

    frameW = g_frame.frame ? MulDiv(tvH, 3, 100) + 2 : 0;
    passe = MulDiv(tvH, g_frame.passepartout, 100);

    inner = *tv;
    InflateRect(&inner, -frameW, -frameW);
    if (frameW > 0) {
        HBRUSH br = CreateSolidBrush(FrameBorderColor());
        RECT band2 = *tv;
        int i;
        for (i = 0; i < frameW; i++) {
            FrameRect(dc, &band2, br);
            InflateRect(&band2, -1, -1);
        }
        DeleteObject(br);
    }

    if (passe > 0) {
        HBRUSH br = CreateSolidBrush(g_frame.background == 1
                                     ? RGB(0xE4, 0xE0, 0xE1)
                                     : RGB(0xF2, 0xEC, 0xEE));
        FillRect(dc, &inner, br);
        DeleteObject(br);
    }

    area = inner;
    InflateRect(&area, -passe, -passe);
    if (area.right - area.left < 8 || area.bottom - area.top < 8) area = inner;

    if (!photo) {
        /* Sem foto e uma coisa; ter foto e o shell nao conseguir gerar a
           imagem e outra. A mensagem diz qual dos dois aconteceu. */
        TextOutRect(dc,
                    g_photos.count ? L"Prévia indisponível para esta foto"
                                   : L"Adicione fotos para ver a prévia",
                    &area, captionFont ? captionFont : g_fontUI,
                    g_frame.background == 1 ? CLR_MUTED : RGB(0xC9, 0xBF, 0xC4),
                    DT_SINGLELINE | DT_CENTER | DT_VCENTER);
        return;
    }

    {
        BITMAP bi;
        HDC mem = CreateCompatibleDC(dc);
        HBITMAP old = (HBITMAP)SelectObject(mem, photo);
        int dw = area.right - area.left;
        int dh = area.bottom - area.top;
        int dx, dy;

        GetObjectW(photo, sizeof(bi), &bi);
        /* "contain": a foto inteira aparece, sem corte e sem distorcao. */
        if (bi.bmWidth > 0 && bi.bmHeight > 0) {
            if (MulDiv(bi.bmWidth, dh, bi.bmHeight) <= dw)
                dw = MulDiv(bi.bmWidth, dh, bi.bmHeight);
            else
                dh = MulDiv(bi.bmHeight, dw, bi.bmWidth);
        }
        if (dw < 1) dw = 1;
        if (dh < 1) dh = 1;
        dx = area.left + (area.right - area.left - dw) / 2;
        dy = area.top + (area.bottom - area.top - dh) / 2;

        SetStretchBltMode(dc, HALFTONE);
        SetBrushOrgEx(dc, 0, 0, NULL);
        StretchBlt(dc, dx, dy, dw, dh, mem, 0, 0, bi.bmWidth, bi.bmHeight,
                   SRCCOPY);
        SelectObject(mem, old);
        DeleteDC(mem);

        if (g_frame.caption && caption && caption[0]) {
            RECT t;
            band.left = dx;
            band.right = dx + dw;
            band.bottom = dy + dh;
            band.top = band.bottom - MulDiv(dh, 12, 100) - 6;
            if (band.top < dy) band.top = dy;
            FillColor(dc, &band, RGB(0x14, 0x10, 0x12));
            t = band;
            InflateRect(&t, -(dw / 24 + 4), 0);
            TextOutRect(dc, caption, &t,
                        captionFont ? captionFont : g_fontSmall,
                        RGB(0xF4, 0xEE, 0xF0),
                        DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
        }
    }
}

/* Previa da pagina Modo Quadro: area 16:9 centralizada dentro de rc. */
static void DrawFramePreview(HDC dc, const RECT *rc)
{
    RECT tv;
    int w = rc->right - rc->left, h = rc->bottom - rc->top;
    int tvW = w, tvH = MulDiv(w, 9, 16);
    int idx = PreviewPhotoIndex();

    if (tvH > h) { tvH = h; tvW = MulDiv(h, 16, 9); }
    if (tvW < 16 || tvH < 16) return;
    tv.left = rc->left + (w - tvW) / 2;
    tv.top = rc->top + (h - tvH) / 2;
    tv.right = tv.left + tvW;
    tv.bottom = tv.top + tvH;

    RenderQuadro(dc, &tv, PreviewBitmap(tvW),
                 idx >= 0 ? g_photos.items[idx].title : NULL, g_fontSmall);

    if (g_frame.fade || g_frame.random) {
        RECT tag = tv;
        WCHAR note[96];
        tag.top = tv.bottom - ScaleDpi(22);
        StringCchPrintfW(note, ARRAYSIZE(note), L"%s%s%s",
                         g_frame.fade ? L"fade " : L"",
                         (g_frame.fade && g_frame.random) ? L"+ " : L"",
                         g_frame.random ? L"aleatório" : L"");
        InflateRect(&tag, -ScaleDpi(8), 0);
        TextOutRect(dc, note, &tag, g_fontSmall, RGB(0x8C, 0x82, 0x88),
                    DT_SINGLELINE | DT_RIGHT | DT_VCENTER);
    }
}

static void DrawStatusRows(HDC dc)
{
    int rowH = ScaleDpi(74);
    int i;
    int y = g_rcStatusList.top;

    for (i = 0; i < STATUS_COUNT; i++) {
        RECT row, dot, label, detail;
        COLORREF color = g_status[i].state == ST_OK ? CLR_OK :
                         g_status[i].state == ST_WARN ? CLR_WARN : CLR_OFF;
        HBRUSH br;
        HPEN pen;
        HGDIOBJ oldBr, oldPen;

        if (y + rowH > g_rcStatusList.bottom) break;
        SetRect(&row, g_rcStatusList.left, y, g_rcStatusList.right, y + rowH);

        if (i) HLine(dc, row.left, row.right, y, CLR_BORDER);

        SetRect(&dot, row.left + ScaleDpi(4), y + ScaleDpi(24),
                row.left + ScaleDpi(18), y + ScaleDpi(38));
        br = CreateSolidBrush(color);
        pen = CreatePen(PS_SOLID, 1, color);
        oldBr = SelectObject(dc, br);
        oldPen = SelectObject(dc, pen);
        Ellipse(dc, dot.left, dot.top, dot.right, dot.bottom);
        SelectObject(dc, oldBr);
        SelectObject(dc, oldPen);
        DeleteObject(br);
        DeleteObject(pen);

        SetRect(&label, dot.right + ScaleDpi(12), y + ScaleDpi(14),
                row.right, y + ScaleDpi(36));
        TextOutRect(dc, g_status[i].label, &label, g_fontBold, CLR_TEXT,
                    DT_SINGLELINE | DT_VCENTER);

        SetRect(&detail, dot.right + ScaleDpi(12), y + ScaleDpi(34),
                row.right, y + rowH - ScaleDpi(6));
        TextOutRect(dc, g_status[i].detail, &detail, g_fontUI, CLR_MUTED,
                    DT_WORDBREAK | DT_END_ELLIPSIS);

        y += rowH;
    }
}

static void PaintMain(HWND hwnd, HDC target)
{
    RECT rc, r;
    HDC dc;
    HBITMAP buffer, oldBmp;
    WCHAR line[320];
    int i;

    GetClientRect(hwnd, &rc);
    dc = CreateCompatibleDC(target);
    buffer = CreateCompatibleBitmap(target, rc.right, rc.bottom);
    oldBmp = (HBITMAP)SelectObject(dc, buffer);

    FillColor(dc, &rc, CLR_WINDOW);

    /* Cabecalho */
    FillColor(dc, &g_rcHeader, CLR_SURFACE);
    r = g_rcHeader;
    r.bottom = r.top + ScaleDpi(3);
    FillColor(dc, &r, CLR_ACCENT);
    HLine(dc, g_rcHeader.left, g_rcHeader.right, g_rcHeader.bottom - 1,
          CLR_BORDER);

    SetRect(&r, ScaleDpi(20), g_rcHeader.top + ScaleDpi(14),
            g_rcHeader.right / 2, g_rcHeader.top + ScaleDpi(44));
    TextOutRect(dc, APP_NAME, &r, g_fontTitle, CLR_ACCENT,
                DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);

    StringCchPrintfW(line, ARRAYSIZE(line), L"v%s  -  %s", APP_VERSION,
                     g_root[0] ? g_root : L"(pasta raiz não definida)");
    SetRect(&r, ScaleDpi(20), g_rcHeader.top + ScaleDpi(44),
            g_rcHeader.right - ScaleDpi(20), g_rcHeader.bottom - ScaleDpi(6));
    TextOutRect(dc, line, &r, g_fontSmall, CLR_MUTED,
                DT_SINGLELINE | DT_VCENTER | DT_PATH_ELLIPSIS);

    if (g_busy[0])
        StringCchCopyW(line, ARRAYSIZE(line), g_busy);
    else
        StringCchPrintfW(line, ARRAYSIZE(line),
                         L"%d faixa(s)  -  %d foto(s)%s",
                         g_tracks.count, g_photos.count,
                         g_dirty ? L"  -  alterações não publicadas" : L"");
    SetRect(&r, g_rcHeader.right / 2, g_rcHeader.top + ScaleDpi(14),
            g_rcHeader.right - ScaleDpi(20), g_rcHeader.top + ScaleDpi(44));
    TextOutRect(dc, line, &r, g_fontBold,
                g_dirty && !g_busy[0] ? CLR_ACCENT : CLR_MUTED,
                DT_SINGLELINE | DT_VCENTER | DT_RIGHT | DT_END_ELLIPSIS);

    /* Trilho lateral */
    FillColor(dc, &g_rcRail, CLR_RAIL);
    {
        RECT edge = g_rcRail;
        edge.left = edge.right - 1;
        FillColor(dc, &edge, CLR_BORDER);
    }

    /* Barra de comandos */
    FillColor(dc, &g_rcCommands, CLR_SURFACE);
    HLine(dc, g_rcCommands.left, g_rcCommands.right, g_rcCommands.top,
          CLR_BORDER);

    /* Cartoes e textos da pagina ativa */
    for (i = 0; i < g_cardCount; i++)
        RoundPanel(dc, &g_cards[i], ScaleDpi(10), CLR_SURFACE, CLR_BORDER);
    for (i = 0; i < g_capCount; i++)
        TextOutRect(dc, g_caps[i].text, &g_caps[i].rc,
                    g_caps[i].style ? g_fontUI : g_fontBold,
                    g_caps[i].style ? CLR_MUTED : CLR_TEXT,
                    (g_caps[i].style ? DT_WORDBREAK
                                     : (DT_SINGLELINE | DT_VCENTER))
                    | DT_END_ELLIPSIS);

    if (g_page == PAGE_FRAME) DrawFramePreview(dc, &g_rcFramePreview);
    if (g_page == PAGE_STATUS) DrawStatusRows(dc);

    BitBlt(target, 0, 0, rc.right, rc.bottom, dc, 0, 0, SRCCOPY);
    SelectObject(dc, oldBmp);
    DeleteObject(buffer);
    DeleteDC(dc);
}

static void DrawOwnerButton(LPDRAWITEMSTRUCT di)
{
    int kind = (int)GetWindowLongPtrW(di->hwndItem, GWLP_USERDATA);
    BOOL hot = (g_hover == di->hwndItem);
    BOOL pressed = (di->itemState & ODS_SELECTED) != 0;
    BOOL disabled = (di->itemState & ODS_DISABLED) != 0;
    BOOL selected = FALSE;
    COLORREF bg, fg, border = CLR_BORDER;
    WCHAR text[128];
    RECT rc = di->rcItem;

    text[0] = 0;
    GetWindowTextW(di->hwndItem, text, ARRAYSIZE(text));
    if (kind == BK_NAV)
        selected = (GetDlgCtrlID(di->hwndItem) - IDC_NAV_FIRST) == g_page;

    switch (kind) {
    case BK_NAV:
        bg = selected ? CLR_ACCENT_SOFT : (hot ? RGB(0xEA, 0xE1, 0xE5)
                                               : CLR_RAIL);
        fg = selected ? CLR_ACCENT : CLR_TEXT;
        FillColor(di->hDC, &rc, bg);
        if (selected) {
            RECT bar = rc;
            bar.right = bar.left + ScaleDpi(3);
            FillColor(di->hDC, &bar, CLR_ACCENT);
        }
        rc.left += ScaleDpi(16);
        TextOutRect(di->hDC, text, &rc,
                    selected ? g_fontBold : g_fontUI, fg,
                    DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
        return;

    case BK_PRIMARY:
        bg = disabled ? RGB(0xD8, 0xCF, 0xD3)
                      : (pressed ? RGB(0x85, 0x22, 0x36)
                                 : (hot ? CLR_ACCENT_HOT : CLR_ACCENT));
        fg = RGB(0xFF, 0xFF, 0xFF);
        border = bg;
        break;

    default:
        bg = disabled ? RGB(0xF4, 0xF1, 0xF2)
                      : (pressed ? CLR_ACCENT_SOFT
                                 : (hot ? RGB(0xFB, 0xF5, 0xF7) : CLR_SURFACE));
        fg = disabled ? CLR_OFF : CLR_TEXT;
        if (hot && !disabled) border = CLR_ACCENT;
        break;
    }

    RoundPanel(di->hDC, &rc, ScaleDpi(6), bg, border);
    TextOutRect(di->hDC, text, &rc, g_fontUI, fg,
                DT_SINGLELINE | DT_CENTER | DT_VCENTER | DT_END_ELLIPSIS);

    if (di->itemState & ODS_FOCUS) {
        RECT f = rc;
        InflateRect(&f, -ScaleDpi(3), -ScaleDpi(3));
        DrawFocusRect(di->hDC, &f);
    }
}

/* ==========================================================================
 * Preenchimento das listas
 * ========================================================================== */

static void EnsureThumbList(void)
{
    if (g_thumbs) return;
    g_thumbs = ImageList_Create(THUMB_PX, THUMB_PX, ILC_COLOR32, 8, 64);
    if (!g_thumbs) return;
    {   /* indice 0: marcador neutro enquanto a miniatura nao chega */
        HDC screen = GetDC(NULL);
        HDC mem = CreateCompatibleDC(screen);
        HBITMAP bmp = CreateCompatibleBitmap(screen, THUMB_PX, THUMB_PX);
        HBITMAP old = (HBITMAP)SelectObject(mem, bmp);
        RECT r;
        SetRect(&r, 0, 0, THUMB_PX, THUMB_PX);
        FillColor(mem, &r, RGB(0xEE, 0xE7, 0xEA));
        TextOutRect(mem, L"...", &r, g_fontUI, CLR_MUTED,
                    DT_SINGLELINE | DT_CENTER | DT_VCENTER);
        SelectObject(mem, old);
        DeleteDC(mem);
        ReleaseDC(NULL, screen);
        ImageList_Add(g_thumbs, bmp, NULL);
        DeleteObject(bmp);
    }
}

static void RefreshMusicUI(void)
{
    HWND lb = GetDlgItem(g_main, IDC_MUS_PLAYLISTS);
    HWND lv = GetDlgItem(g_main, IDC_MUS_TRACKS);
    WCHAR line[200];
    int i, n;

    if (g_curPlaylist > g_playlists.count) g_curPlaylist = 0;

    if (lb) {
        SendMessageW(lb, WM_SETREDRAW, FALSE, 0);
        SendMessageW(lb, LB_RESETCONTENT, 0, 0);
        StringCchPrintfW(line, ARRAYSIZE(line), L"Biblioteca completa (%d)",
                         g_tracks.count);
        SendMessageW(lb, LB_ADDSTRING, 0, (LPARAM)line);
        for (i = 0; i < g_playlists.count; i++) {
            StringCchPrintfW(line, ARRAYSIZE(line), L"%s (%d)",
                             g_playlists.items[i].name,
                             g_playlists.items[i].count);
            SendMessageW(lb, LB_ADDSTRING, 0, (LPARAM)line);
        }
        SendMessageW(lb, LB_SETCURSEL, (WPARAM)g_curPlaylist, 0);
        SendMessageW(lb, WM_SETREDRAW, TRUE, 0);
        InvalidateRect(lb, NULL, TRUE);
    }

    if (!lv) { Layout(); return; }

    SendMessageW(lv, WM_SETREDRAW, FALSE, 0);
    ListView_DeleteAllItems(lv);
    n = CurrentPlaylistCount();
    for (i = 0; i < n; i++) {
        int id = (g_curPlaylist <= 0) ? i
                                      : g_playlists.items[g_curPlaylist - 1].ids[i];
        LVITEMW item;
        WCHAR num[16];
        const MediaItem *track;
        int pos;

        if (id < 0 || id >= g_tracks.count) continue;
        track = &g_tracks.items[id];

        memset(&item, 0, sizeof(item));
        item.mask = LVIF_TEXT | LVIF_PARAM;
        item.iItem = i;
        StringCchPrintfW(num, ARRAYSIZE(num), L"%d", i + 1);
        item.pszText = num;
        item.lParam = id;
        pos = ListView_InsertItem(lv, &item);
        if (pos < 0) continue;

        if (track->missing) {
            StringCchPrintfW(line, ARRAYSIZE(line), L"%s  (arquivo ausente)",
                             track->title);
            ListView_SetItemText(lv, pos, 1, line);
        } else {
            ListView_SetItemText(lv, pos, 1, (LPWSTR)track->title);
        }
        ListView_SetItemText(lv, pos, 2, (LPWSTR)track->path);
    }
    SendMessageW(lv, WM_SETREDRAW, TRUE, 0);
    InvalidateRect(lv, NULL, TRUE);
    Layout();
}

static void RefreshPhotoUI(void)
{
    HWND lb = GetDlgItem(g_main, IDC_PHO_ALBUMS);
    HWND lv = GetDlgItem(g_main, IDC_PHO_GRID);
    HWND track = GetDlgItem(g_main, IDC_PHO_INTERVAL);
    WCHAR line[200];
    int i, n;

    if (g_curAlbum > g_albums.count) g_curAlbum = 0;

    if (lb) {
        SendMessageW(lb, WM_SETREDRAW, FALSE, 0);
        SendMessageW(lb, LB_RESETCONTENT, 0, 0);
        StringCchPrintfW(line, ARRAYSIZE(line), L"Todas as fotos (%d)",
                         g_photos.count);
        SendMessageW(lb, LB_ADDSTRING, 0, (LPARAM)line);
        for (i = 0; i < g_albums.count; i++) {
            StringCchPrintfW(line, ARRAYSIZE(line), L"%s (%d)",
                             g_albums.items[i].name, g_albums.items[i].count);
            SendMessageW(lb, LB_ADDSTRING, 0, (LPARAM)line);
        }
        SendMessageW(lb, LB_SETCURSEL, (WPARAM)g_curAlbum, 0);
        SendMessageW(lb, WM_SETREDRAW, TRUE, 0);
        InvalidateRect(lb, NULL, TRUE);
    }

    if (track) {
        int seconds = g_curAlbum > 0 ? g_albums.items[g_curAlbum - 1].interval
                                     : g_frame.seconds;
        EnableWindow(track, g_curAlbum > 0);
        SendMessageW(track, TBM_SETPOS, TRUE, seconds);
    }

    if (!lv) { Layout(); return; }

    EnsureThumbList();
    ListView_SetImageList(lv, g_thumbs, LVSIL_NORMAL);

    SendMessageW(lv, WM_SETREDRAW, FALSE, 0);
    ListView_DeleteAllItems(lv);
    n = CurrentAlbumCount();
    for (i = 0; i < n; i++) {
        int id = (g_curAlbum <= 0) ? i : g_albums.items[g_curAlbum - 1].ids[i];
        const MediaItem *photo;
        LVITEMW item;
        BOOL isCover;

        if (id < 0 || id >= g_photos.count) continue;
        photo = &g_photos.items[id];
        isCover = (g_curAlbum > 0 &&
                   g_albums.items[g_curAlbum - 1].cover == id);

        if (isCover)
            StringCchPrintfW(line, ARRAYSIZE(line), L"[capa] %s", photo->title);
        else if (photo->missing)
            StringCchPrintfW(line, ARRAYSIZE(line), L"%s (ausente)",
                             photo->title);
        else
            StringCchCopyW(line, ARRAYSIZE(line), photo->title);

        memset(&item, 0, sizeof(item));
        item.mask = LVIF_TEXT | LVIF_PARAM | LVIF_IMAGE;
        item.iItem = i;
        item.pszText = line;
        item.lParam = id;
        item.iImage = photo->thumb >= 0 ? photo->thumb : 0;
        ListView_InsertItem(lv, &item);
    }
    SendMessageW(lv, WM_SETREDRAW, TRUE, 0);
    InvalidateRect(lv, NULL, TRUE);
    InvalidatePreviewCache();
    Layout();
}

static void RefreshFrameUI(void)
{
    HWND c;
    if ((c = GetDlgItem(g_main, IDC_FR_SECONDS)) != NULL)
        SendMessageW(c, TBM_SETPOS, TRUE, g_frame.seconds);
    if ((c = GetDlgItem(g_main, IDC_FR_PASSE)) != NULL)
        SendMessageW(c, TBM_SETPOS, TRUE, g_frame.passepartout);
    if ((c = GetDlgItem(g_main, IDC_FR_FADE)) != NULL)
        SendMessageW(c, BM_SETCHECK, g_frame.fade ? BST_CHECKED : BST_UNCHECKED, 0);
    if ((c = GetDlgItem(g_main, IDC_FR_RANDOM)) != NULL)
        SendMessageW(c, BM_SETCHECK, g_frame.random ? BST_CHECKED : BST_UNCHECKED, 0);
    if ((c = GetDlgItem(g_main, IDC_FR_CAPTION)) != NULL)
        SendMessageW(c, BM_SETCHECK, g_frame.caption ? BST_CHECKED : BST_UNCHECKED, 0);
    if ((c = GetDlgItem(g_main, IDC_FR_FRAME)) != NULL)
        SendMessageW(c, CB_SETCURSEL, (WPARAM)g_frame.frame, 0);
    if ((c = GetDlgItem(g_main, IDC_FR_BG)) != NULL)
        SendMessageW(c, CB_SETCURSEL, (WPARAM)g_frame.background, 0);
    Layout();
}

static void MarkDirty(void)
{
    g_dirty = TRUE;
    InvalidateRect(g_main, &g_rcHeader, TRUE);
}

/* ==========================================================================
 * Ordenacao da biblioteca de fotos (remapeia albuns e capas)
 * ========================================================================== */

static const MediaList *s_sortList;
static int s_sortMode;

static int __cdecl CompareMedia(const void *a, const void *b)
{
    int ia = *(const int *)a, ib = *(const int *)b;
    const MediaItem *x = &s_sortList->items[ia];
    const MediaItem *y = &s_sortList->items[ib];
    int r;

    switch (s_sortMode) {
    case 2:
    case 3:
        r = (int)CompareFileTime(&x->written, &y->written);
        if (!r) r = lstrcmpiW(x->title, y->title);
        return s_sortMode == 3 ? -r : r;
    case 1:
        return -lstrcmpiW(x->title, y->title);
    default:
        return lstrcmpiW(x->title, y->title);
    }
}

/* Reordena a lista inteira e corrige todas as referencias das colecoes. */
static void SortLibrary(MediaList *list, CollectionList *collections, int mode)
{
    int *order, *map;
    MediaItem *sorted;
    int i, k;

    if (list->count < 2) return;
    order = (int *)XAlloc((size_t)list->count * sizeof(int));
    map = (int *)XAlloc((size_t)list->count * sizeof(int));
    for (i = 0; i < list->count; i++) order[i] = i;

    if (mode == 4) {
        for (i = 0; i < list->count; i++) order[i] = list->count - 1 - i;
    } else {
        s_sortList = list;
        s_sortMode = mode;
        qsort(order, (size_t)list->count, sizeof(int), CompareMedia);
        s_sortList = NULL;
    }

    sorted = (MediaItem *)XAlloc((size_t)list->count * sizeof(MediaItem));
    for (i = 0; i < list->count; i++) {
        sorted[i] = list->items[order[i]];
        map[order[i]] = i;
    }
    memcpy(list->items, sorted, (size_t)list->count * sizeof(MediaItem));
    free(sorted);

    for (i = 0; i < collections->count; i++) {
        Collection *c = &collections->items[i];
        for (k = 0; k < c->count; k++)
            if (c->ids[k] >= 0 && c->ids[k] < list->count)
                c->ids[k] = map[c->ids[k]];
        if (c->cover >= 0 && c->cover < list->count) c->cover = map[c->cover];
    }

    free(order);
    free(map);
}

/* Ordena apenas os itens de uma colecao. */
static void SortCollection(Collection *c, const MediaList *list, int mode)
{
    if (c->count < 2) return;
    if (mode == 4) {
        int i;
        for (i = 0; i < c->count / 2; i++) {
            int t = c->ids[i];
            c->ids[i] = c->ids[c->count - 1 - i];
            c->ids[c->count - 1 - i] = t;
        }
        return;
    }
    s_sortList = list;
    s_sortMode = mode;
    qsort(c->ids, (size_t)c->count, sizeof(int), CompareMedia);
    s_sortList = NULL;
}

/* ==========================================================================
 * Acoes
 * ========================================================================== */

#define IDM_ADD_MUSIC_FOLDER 3001
#define IDM_ADD_MUSIC_FILES  3002
#define IDM_ADD_PHOTO_FOLDER 3011
#define IDM_ADD_PHOTO_FILES  3012

static void ReportScan(const ScanResult *res, BOOL music)
{
    WCHAR msg[320];
    if (!res->audio && !res->image) {
        StringCchPrintfW(msg, ARRAYSIZE(msg),
                         L"Nenhum arquivo novo foi encontrado.%s",
                         res->skipped ? L"\n\nAlguns itens foram ignorados por "
                                        L"não serem do tipo esperado."
                                      : L"");
        MessageBoxW(g_main, msg, APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    StringCchPrintfW(msg, ARRAYSIZE(msg),
                     L"%d faixa(s) e %d foto(s) adicionadas à biblioteca.\n\n"
                     L"Os arquivos continuam onde estão; o manifesto guarda "
                     L"apenas os caminhos.",
                     res->audio, res->image);
    MessageBoxW(g_main, msg, APP_NAME, MB_ICONINFORMATION | MB_OK);
    (void)music;
}

static void AfterIngest(const ScanResult *res, BOOL music)
{
    MarkDirty();
    if (music) {
        RefreshMusicUI();
    } else {
        StartThumbnailWorker();
        RefreshPhotoUI();
    }
    RecomputeStatus();
    ReportScan(res, music);
}

static void AddFromFolder(BOOL music)
{
    WCHAR dir[MAX_PATH];
    ScanResult res;
    memset(&res, 0, sizeof(res));
    if (!PickFolder(g_main, music ? L"Pasta com arquivos MP3"
                                  : L"Pasta com fotos", dir, MAX_PATH))
        return;
    StopThumbnailWorker();
    IngestPath(dir, music, !music, &res);
    AfterIngest(&res, music);
}

static void AddFromFiles(BOOL music)
{
    StrList files;
    ScanResult res;
    int i;

    memset(&files, 0, sizeof(files));
    memset(&res, 0, sizeof(res));
    if (!PickFiles(g_main,
                   music ? L"Escolher arquivos MP3" : L"Escolher fotos",
                   music ? L"Músicas (*.mp3)" : L"Imagens",
                   music ? L"*.mp3"
                         : L"*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.heic;"
                           L"*.tif;*.tiff",
                   &files)) {
        StrListClear(&files);
        return;
    }
    StopThumbnailWorker();
    for (i = 0; i < files.count; i++)
        IngestPath(files.items[i], music, !music, &res);
    StrListClear(&files);
    AfterIngest(&res, music);
}

static void ShowAddMenu(HWND button, BOOL music)
{
    HMENU menu = CreatePopupMenu();
    RECT rc;
    UINT cmd;

    if (!menu) return;
    AppendMenuW(menu, MF_STRING,
                music ? IDM_ADD_MUSIC_FOLDER : IDM_ADD_PHOTO_FOLDER,
                music ? L"Adicionar pasta com MP3..."
                      : L"Adicionar pasta com fotos...");
    AppendMenuW(menu, MF_STRING,
                music ? IDM_ADD_MUSIC_FILES : IDM_ADD_PHOTO_FILES,
                music ? L"Adicionar arquivos MP3..."
                      : L"Adicionar fotos avulsas...");
    AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0,
                L"Dica: arraste pastas ou arquivos para esta janela");

    GetWindowRect(button, &rc);
    cmd = (UINT)TrackPopupMenu(menu,
                               TPM_RETURNCMD | TPM_LEFTALIGN | TPM_BOTTOMALIGN,
                               rc.left, rc.top, 0, g_main, NULL);
    DestroyMenu(menu);

    switch (cmd) {
    case IDM_ADD_MUSIC_FOLDER: AddFromFolder(TRUE);  break;
    case IDM_ADD_MUSIC_FILES:  AddFromFiles(TRUE);   break;
    case IDM_ADD_PHOTO_FOLDER: AddFromFolder(FALSE); break;
    case IDM_ADD_PHOTO_FILES:  AddFromFiles(FALSE);  break;
    default: break;
    }
}

static void HandleDrop(HDROP drop)
{
    WCHAR path[MAX_PATH];
    ScanResult res;
    UINT count, i;

    memset(&res, 0, sizeof(res));
    count = DragQueryFileW(drop, 0xFFFFFFFF, NULL, 0);
    StopThumbnailWorker();
    for (i = 0; i < count; i++) {
        if (!DragQueryFileW(drop, i, path, MAX_PATH)) continue;
        /* Solto na janela: aceita musica e foto de uma vez. */
        IngestPath(path, TRUE, TRUE, &res);
    }
    DragFinish(drop);

    MarkDirty();
    StartThumbnailWorker();
    RefreshMusicUI();
    RefreshPhotoUI();
    RecomputeStatus();
    ReportScan(&res, g_page == PAGE_MUSIC);
}

/* ---- Colecoes ---------------------------------------------------------- */

static void NewCollection(CollectionList *list, const WCHAR *what,
                          int *current, BOOL music)
{
    WCHAR name[96];
    StringCchPrintfW(name, ARRAYSIZE(name), L"%s %d", what, list->count + 1);
    if (!AskText(g_main, music ? L"Nova playlist" : L"Novo álbum",
                 music ? L"Nome da playlist:" : L"Nome do álbum:",
                 name, ARRAYSIZE(name)))
        return;
    if (CollectionNameTaken(list, name, -1)) {
        MessageBoxW(g_main, L"Já existe um item com esse nome.", APP_NAME,
                    MB_ICONWARNING | MB_OK);
        return;
    }
    CollectionListAdd(list, name);
    *current = list->count;      /* 0 e a visao completa */
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
}

static void RenameCollection(CollectionList *list, int current, BOOL music)
{
    WCHAR name[96];
    if (current <= 0) {
        MessageBoxW(g_main,
                    music ? L"A visão \"Biblioteca completa\" não pode ser "
                            L"renomeada. Selecione uma playlist."
                          : L"A visão \"Todas as fotos\" não pode ser "
                            L"renomeada. Selecione um álbum.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    StringCchCopyW(name, ARRAYSIZE(name), list->items[current - 1].name);
    if (!AskText(g_main, music ? L"Renomear playlist" : L"Renomear álbum",
                 L"Novo nome:", name, ARRAYSIZE(name)))
        return;
    if (CollectionNameTaken(list, name, current - 1)) {
        MessageBoxW(g_main, L"Já existe um item com esse nome.", APP_NAME,
                    MB_ICONWARNING | MB_OK);
        return;
    }
    StringCchCopyW(list->items[current - 1].name, 96, name);
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
}

static void DeleteCollection(CollectionList *list, int *current, BOOL music)
{
    WCHAR msg[320];
    if (*current <= 0) {
        MessageBoxW(g_main,
                    music ? L"Selecione uma playlist para excluir."
                          : L"Selecione um álbum para excluir.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    StringCchPrintfW(msg, ARRAYSIZE(msg),
                     L"Excluir %s \"%s\"?\n\nNenhum arquivo de mídia é "
                     L"apagado: apenas a lista deixa de existir.",
                     music ? L"a playlist" : L"o album",
                     list->items[*current - 1].name);
    if (MessageBoxW(g_main, msg, APP_NAME,
                    MB_ICONQUESTION | MB_YESNO | MB_DEFBUTTON2) != IDYES)
        return;
    CollectionListRemoveAt(list, *current - 1);
    *current = 0;
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
}

static void AddToCollection(CollectionList *list, int current,
                            const MediaList *source, BOOL music)
{
    PickerCtx ctx;
    Collection *c;
    int i;

    if (current <= 0) {
        MessageBoxW(g_main,
                    music ? L"Selecione uma playlist para receber as faixas."
                          : L"Selecione um álbum para receber as fotos.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    if (!source->count) {
        MessageBoxW(g_main,
                    music ? L"A biblioteca ainda não tem faixas."
                          : L"A biblioteca ainda não tem fotos.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    c = &list->items[current - 1];
    if (!AskPick(g_main,
                 music ? L"Adicionar faixas" : L"Adicionar fotos",
                 music ? L"Faixas da biblioteca ainda fora desta playlist:"
                       : L"Fotos da biblioteca ainda fora deste álbum:",
                 source, c, &ctx))
        return;
    for (i = 0; i < ctx.pickedCount; i++)
        CollectionAddId(c, ctx.picked[i]);
    free(ctx.picked);
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
}

static int SelectedRow(int listViewId)
{
    HWND lv = GetDlgItem(g_main, listViewId);
    if (!lv) return -1;
    return ListView_GetNextItem(lv, -1, LVNI_SELECTED);
}

static void SelectRow(int listViewId, int row)
{
    HWND lv = GetDlgItem(g_main, listViewId);
    if (!lv || row < 0) return;
    ListView_SetItemState(lv, row, LVIS_SELECTED | LVIS_FOCUSED,
                          LVIS_SELECTED | LVIS_FOCUSED);
    ListView_EnsureVisible(lv, row, FALSE);
}

static void MoveInCollection(CollectionList *list, int current, int listViewId,
                             int delta, BOOL music)
{
    Collection *c;
    int row = SelectedRow(listViewId), target, tmp;

    if (current <= 0) {
        MessageBoxW(g_main,
                    music ? L"A ordem só pode ser alterada dentro de uma "
                            L"playlist. Use a página Fotos ou crie uma "
                            L"playlist."
                          : L"A ordem só pode ser alterada dentro de um álbum.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    if (row < 0) return;
    c = &list->items[current - 1];
    target = row + delta;
    if (target < 0 || target >= c->count) return;

    tmp = c->ids[row];
    c->ids[row] = c->ids[target];
    c->ids[target] = tmp;
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
    SelectRow(listViewId, target);
}

/* Remove itens da biblioteca; so apaga arquivo mediante confirmacao
   explicita, e sempre para a Lixeira. */
static void RemoveFromLibrary(MediaList *lib, CollectionList *collections,
                              int listViewId, BOOL music)
{
    HWND lv = GetDlgItem(g_main, listViewId);
    int *rows, count = 0, i, answer;
    WCHAR msg[512];
    BOOL deleteFiles;

    if (!lv) return;
    count = ListView_GetSelectedCount(lv);
    if (count <= 0) return;

    rows = (int *)XAlloc((size_t)count * sizeof(int));
    {
        int row = -1, n = 0;
        while ((row = ListView_GetNextItem(lv, row, LVNI_SELECTED)) >= 0 &&
               n < count) {
            LVITEMW it;
            memset(&it, 0, sizeof(it));
            it.mask = LVIF_PARAM;
            it.iItem = row;
            if (ListView_GetItem(lv, &it)) rows[n++] = (int)it.lParam;
        }
        count = n;
    }
    if (!count) { free(rows); return; }

    StringCchPrintfW(msg, ARRAYSIZE(msg),
                     L"Remover %d %s da biblioteca.\n\n"
                     L"Sim   = remover da biblioteca E enviar o(s) arquivo(s) "
                     L"para a Lixeira\n"
                     L"Não   = remover apenas da biblioteca, mantendo o(s) "
                     L"arquivo(s) no disco\n"
                     L"Cancelar = não fazer nada",
                     count, music ? L"faixa(s)" : L"foto(s)");
    answer = MessageBoxW(g_main, msg, APP_NAME,
                         MB_ICONWARNING | MB_YESNOCANCEL | MB_DEFBUTTON2);
    if (answer == IDCANCEL) { free(rows); return; }
    deleteFiles = (answer == IDYES);

    if (deleteFiles) {
        /* Segunda confirmacao antes de qualquer escrita em disco. */
        StringCchPrintfW(msg, ARRAYSIZE(msg),
                         L"Confirma enviar %d arquivo(s) original(is) para a "
                         L"Lixeira?\n\nEsta é a última confirmação.", count);
        if (MessageBoxW(g_main, msg, APP_NAME,
                        MB_ICONWARNING | MB_YESNO | MB_DEFBUTTON2) != IDYES) {
            free(rows);
            return;
        }
    }

    /* Ordem decrescente: remover indices altos primeiro mantem os baixos. */
    for (i = 0; i < count - 1; i++) {
        int k;
        for (k = i + 1; k < count; k++)
            if (rows[k] > rows[i]) { int t = rows[i]; rows[i] = rows[k]; rows[k] = t; }
    }

    StopThumbnailWorker();
    for (i = 0; i < count; i++) {
        int id = rows[i], k;
        if (id < 0 || id >= lib->count) continue;

        if (deleteFiles) {
            SHFILEOPSTRUCTW op;
            WCHAR from[MAX_PATH + 2];
            memset(from, 0, sizeof(from));
            StringCchCopyW(from, MAX_PATH, lib->items[id].path);
            memset(&op, 0, sizeof(op));
            op.wFunc = FO_DELETE;
            op.pFrom = from;
            op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT |
                        FOF_NOERRORUI;
            SHFileOperationW(&op);
        }
        for (k = 0; k < collections->count; k++)
            CollectionDropId(&collections->items[k], id);
        memmove(lib->items + id, lib->items + id + 1,
                (size_t)(lib->count - id - 1) * sizeof(MediaItem));
        lib->count--;
    }
    free(rows);

    MarkDirty();
    if (music) {
        RefreshMusicUI();
    } else {
        InvalidatePreviewCache();
        StartThumbnailWorker();
        RefreshPhotoUI();
    }
    RecomputeStatus();
}

/* Remove itens de uma colecao (nunca toca no disco). */
static void RemoveFromCollection(CollectionList *list, int current,
                                 int listViewId, BOOL music)
{
    HWND lv = GetDlgItem(g_main, listViewId);
    Collection *c;
    int row, removed = 0;

    if (!lv || current <= 0) return;
    c = &list->items[current - 1];

    /* De tras para frente: as posicoes anteriores nao se deslocam. */
    for (row = c->count - 1; row >= 0; row--) {
        if (!(ListView_GetItemState(lv, row, LVIS_SELECTED) & LVIS_SELECTED))
            continue;
        if (c->cover == c->ids[row]) c->cover = -1;
        CollectionRemoveAt(c, row);
        removed++;
    }
    if (!removed) return;
    MarkDirty();
    if (music) RefreshMusicUI(); else RefreshPhotoUI();
}

static void SetAlbumCover(void)
{
    LVITEMW it;
    HWND lv = GetDlgItem(g_main, IDC_PHO_GRID);
    int row = SelectedRow(IDC_PHO_GRID);

    if (g_curAlbum <= 0) {
        MessageBoxW(g_main, L"Selecione um álbum para definir a capa.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    if (!lv || row < 0) {
        MessageBoxW(g_main, L"Selecione a foto que será a capa.", APP_NAME,
                    MB_ICONINFORMATION | MB_OK);
        return;
    }
    memset(&it, 0, sizeof(it));
    it.mask = LVIF_PARAM;
    it.iItem = row;
    if (!ListView_GetItem(lv, &it)) return;

    g_albums.items[g_curAlbum - 1].cover = (int)it.lParam;
    MarkDirty();
    RefreshPhotoUI();
    SelectRow(IDC_PHO_GRID, row);
}

static void SortPhotos(void)
{
    HWND combo = GetDlgItem(g_main, IDC_PHO_SORTMODE);
    int mode = combo ? (int)SendMessageW(combo, CB_GETCURSEL, 0, 0) : 0;
    if (mode < 0) mode = 0;

    StopThumbnailWorker();
    if (g_curAlbum <= 0)
        SortLibrary(&g_photos, &g_albums, mode);
    else
        SortCollection(&g_albums.items[g_curAlbum - 1], &g_photos, mode);
    MarkDirty();
    InvalidatePreviewCache();
    StartThumbnailWorker();
    RefreshPhotoUI();
}

/* ---- Comandos da barra inferior --------------------------------------- */

static BOOL g_installPending;

static void CommandRefreshLibrary(void)
{
    ScanResult res;
    WCHAR err[320], msg[512], manifest[MAX_PATH];
    BOOL ok;

    memset(&res, 0, sizeof(res));
    err[0] = 0;

    StringCchCopyW(g_busy, ARRAYSIZE(g_busy), L"Atualizando biblioteca...");
    InvalidateRect(g_main, &g_rcHeader, TRUE);
    UpdateWindow(g_main);

    StopThumbnailWorker();
    RescanLibrary(&res);
    SaveState();
    ok = PublishManifest(err, ARRAYSIZE(err));

    g_busy[0] = 0;
    StartThumbnailWorker();
    RefreshMusicUI();
    RefreshPhotoUI();
    RecomputeStatus();
    InvalidateRect(g_main, NULL, TRUE);

    HubFile(manifest, MAX_PATH, L"manifest.json");
    if (ok)
        StringCchPrintfW(msg, ARRAYSIZE(msg),
                         L"Biblioteca atualizada.\n\n"
                         L"%d faixa(s) e %d foto(s) novas nesta varredura.\n"
                         L"Total: %d faixa(s), %d foto(s).\n\n"
                         L"Manifesto publicado em:\n%s\n\n"
                         L"Nenhuma mídia foi copiada ou embutida.",
                         res.audio, res.image, g_tracks.count, g_photos.count,
                         manifest);
    else
        StringCchPrintfW(msg, ARRAYSIZE(msg),
                         L"A biblioteca foi relida, mas o manifesto não pôde "
                         L"ser publicado.\n\n%s", err);
    MessageBoxW(g_main, msg, APP_NAME,
                (ok ? MB_ICONINFORMATION : MB_ICONERROR) | MB_OK);
}

static void CommandOpenHub(void)
{
    WCHAR hubDir[MAX_PATH];

    if (g_hubUrl[0]) {
        HINSTANCE r = ShellExecuteW(g_main, L"open", g_hubUrl, NULL, NULL,
                                    SW_SHOWNORMAL);
        if ((INT_PTR)r > 32) return;
        MessageBoxW(g_main,
                    L"Não foi possível abrir a URL do Hub. Abrindo a pasta "
                    L"do manifesto.", APP_NAME, MB_ICONWARNING | MB_OK);
    }
    PathJoin(hubDir, MAX_PATH, g_root, DIR_HUB);
    EnsureDir(hubDir);
    ShellExecuteW(g_main, L"open", hubDir, NULL, NULL, SW_SHOWNORMAL);
}

static void CommandInstallLg(void)
{
    WCHAR cmd[1024], msg[600];

    if (!g_lgDevice[0] || !g_ipkPath[0]) {
        MessageBoxW(g_main,
                    L"Informe o nome do device (ares-setup-device) e o "
                    L"caminho do pacote .ipk em Status > Configurações.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }
    if (!FileExists(g_ipkPath)) {
        StringCchPrintfW(msg, ARRAYSIZE(msg),
                         L"O pacote informado não foi encontrado:\n%s",
                         g_ipkPath);
        MessageBoxW(g_main, msg, APP_NAME, MB_ICONERROR | MB_OK);
        return;
    }

    StringCchPrintfW(msg, ARRAYSIZE(msg),
                     L"Instalar na LG usando o CLI oficial?\n\n"
                     L"Device: %s\nPacote: %s\n\n"
                     L"O comando roda em uma janela de console separada. "
                     L"Músicas e fotos NÃO vão dentro do pacote: a TV lê o "
                     L"manifesto do Hub.\n\n"
                     L"O Modo Desenvolvedor precisa estar ativo na TV.",
                     g_lgDevice, g_ipkPath);
    if (MessageBoxW(g_main, msg, APP_NAME,
                    MB_ICONQUESTION | MB_YESNO | MB_DEFBUTTON2) != IDYES)
        return;

    /* cmd.exe /s /c preserva as aspas internas; ares-install costuma ser
       um .cmd, que CreateProcess nao executa diretamente. */
    StringCchPrintfW(cmd, ARRAYSIZE(cmd),
                     L"cmd.exe /s /c \"\"%s\" --device \"%s\" \"%s\" & echo. "
                     L"& pause\"",
                     g_aresPath, g_lgDevice, g_ipkPath);
    g_installPending = TRUE;
    StringCchCopyW(g_busy, ARRAYSIZE(g_busy), L"Instalando na LG...");
    InvalidateRect(g_main, &g_rcHeader, TRUE);
    RunDetached(cmd, L"Instalar na LG");
}

static void RecordLgInstall(void)
{
    WCHAR path[MAX_PATH], now[32], hubDir[MAX_PATH];
    JsonBuf j;

    PathJoin(hubDir, MAX_PATH, g_root, DIR_HUB);
    if (!EnsureDir(hubDir)) return;
    HubFile(path, MAX_PATH, L"lg-device.json");
    NowIso(now, ARRAYSIZE(now));

    memset(&j, 0, sizeof(j));
    JbOpen(&j, '{');
    JbKeyStr(&j, "device", g_lgDevice);
    JbKeyStr(&j, "ip", g_lgIp);
    JbKeyStr(&j, "ipk", g_ipkPath);
    JbKeyStr(&j, "lastInstallAt", now);
    JbKeyStr(&j, "installedBy", APP_NAME L" " APP_VERSION);
    JbClose(&j, '}');
    JbStr(&j, "\n");
    WriteTextFileUtf8(path, j.buf, j.len);
    JbFree(&j);
}

/* ==========================================================================
 * Visualizar TV - janela em tela cheia com o Modo Quadro
 * ========================================================================== */

typedef struct {
    HBITMAP bmp;
    void   *bits;
    int     w, h;
} Canvas;

static HWND    g_preview;
static int    *g_pvOrder;
static int     g_pvCount, g_pvPos;
static Canvas  g_pvA, g_pvB, g_pvBlend;
static HFONT   g_pvFont;
static int     g_pvFadeStep;

static Canvas MakeCanvas(HDC ref, int w, int h)
{
    BITMAPINFO bi;
    Canvas c;
    memset(&c, 0, sizeof(c));
    if (w < 1 || h < 1) return c;
    memset(&bi, 0, sizeof(bi));
    bi.bmiHeader.biSize = sizeof(bi.bmiHeader);
    bi.bmiHeader.biWidth = w;
    bi.bmiHeader.biHeight = -h;          /* top-down */
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;
    c.bmp = CreateDIBSection(ref, &bi, DIB_RGB_COLORS, &c.bits, NULL, 0);
    if (!c.bmp) { c.bits = NULL; return c; }
    c.w = w;
    c.h = h;
    return c;
}

static void FreeCanvas(Canvas *c)
{
    if (c->bmp) DeleteObject(c->bmp);
    memset(c, 0, sizeof(*c));
}

/* Desenha a foto de g_pvOrder[pos] dentro de "target". */
static void ComposeInto(Canvas *target, int pos)
{
    HDC screen, mem;
    HBITMAP oldBmp;
    HBITMAP photo = NULL;
    RECT full;
    int id = -1;

    if (!target->bmp) return;
    screen = GetDC(NULL);
    mem = CreateCompatibleDC(screen);
    oldBmp = (HBITMAP)SelectObject(mem, target->bmp);
    SetRect(&full, 0, 0, target->w, target->h);

    if (pos >= 0 && pos < g_pvCount) {
        id = g_pvOrder[pos];
        if (id >= 0 && id < g_photos.count && !g_photos.items[id].missing)
            photo = LoadShellImage(g_photos.items[id].path,
                                   target->w, target->h);
    }
    RenderQuadro(mem, &full, photo,
                 (id >= 0 && id < g_photos.count) ? g_photos.items[id].title
                                                  : NULL,
                 g_pvFont);
    if (photo) DeleteObject(photo);

    SelectObject(mem, oldBmp);
    DeleteDC(mem);
    ReleaseDC(NULL, screen);
}

/* Mistura A e B com peso t/256 em Blend. */
static void BlendCanvas(int t)
{
    const BYTE *a = (const BYTE *)g_pvA.bits;
    const BYTE *b = (const BYTE *)g_pvB.bits;
    BYTE *out = (BYTE *)g_pvBlend.bits;
    size_t i, n;

    if (!a || !b || !out) return;
    n = (size_t)g_pvBlend.w * (size_t)g_pvBlend.h * 4;
    if (t < 0) t = 0;
    if (t > 256) t = 256;
    for (i = 0; i < n; i++)
        out[i] = (BYTE)(((int)a[i] * (256 - t) + (int)b[i] * t) >> 8);
}

static void PreviewPaint(HWND hwnd, Canvas *src)
{
    HDC dc = GetDC(hwnd);
    HDC mem;
    HBITMAP old;
    if (!dc) return;
    if (src && src->bmp) {
        mem = CreateCompatibleDC(dc);
        old = (HBITMAP)SelectObject(mem, src->bmp);
        BitBlt(dc, 0, 0, src->w, src->h, mem, 0, 0, SRCCOPY);
        SelectObject(mem, old);
        DeleteDC(mem);
    }
    ReleaseDC(hwnd, dc);
}

static int PreviewIntervalSeconds(void)
{
    if (g_curAlbum > 0) return g_albums.items[g_curAlbum - 1].interval;
    return g_frame.seconds;
}

static void PreviewAdvance(HWND hwnd, int delta)
{
    if (g_pvCount <= 0) return;
    g_pvPos = (g_pvPos + delta) % g_pvCount;
    if (g_pvPos < 0) g_pvPos += g_pvCount;

    ComposeInto(&g_pvB, g_pvPos);
    if (g_frame.fade && g_pvCount > 1) {
        g_pvFadeStep = 0;
        SetTimer(hwnd, PREVIEW_FADE_TIMER, PREVIEW_FADE_MS, NULL);
    } else {
        Canvas tmp = g_pvA;
        g_pvA = g_pvB;
        g_pvB = tmp;
        PreviewPaint(hwnd, &g_pvA);
    }
}

static void PreviewBuildOrder(void)
{
    int i, n;

    free(g_pvOrder);
    g_pvOrder = NULL;
    g_pvCount = 0;
    g_pvPos = 0;

    n = CurrentAlbumCount();
    if (n <= 0) return;
    g_pvOrder = (int *)XAlloc((size_t)n * sizeof(int));
    for (i = 0; i < n; i++)
        g_pvOrder[i] = (g_curAlbum <= 0) ? i
                                         : g_albums.items[g_curAlbum - 1].ids[i];
    g_pvCount = n;

    if (g_frame.random && n > 1) {
        /* Fisher-Yates com semente de tempo. */
        unsigned seed = GetTickCount();
        for (i = n - 1; i > 0; i--) {
            int k;
            seed = seed * 1103515245u + 12345u;
            k = (int)((seed >> 16) % (unsigned)(i + 1));
            { int t = g_pvOrder[i]; g_pvOrder[i] = g_pvOrder[k]; g_pvOrder[k] = t; }
        }
    }
}

static LRESULT CALLBACK PreviewProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_CREATE: {
        RECT rc;
        HDC dc = GetDC(hwnd);
        LOGFONTW lf;

        GetClientRect(hwnd, &rc);
        memset(&lf, 0, sizeof(lf));
        StringCchCopyW(lf.lfFaceName, ARRAYSIZE(lf.lfFaceName), L"Segoe UI");
        lf.lfHeight = -(rc.bottom / 26);
        lf.lfWeight = FW_SEMIBOLD;
        lf.lfQuality = CLEARTYPE_QUALITY;
        g_pvFont = CreateFontIndirectW(&lf);

        g_pvA = MakeCanvas(dc, rc.right, rc.bottom);
        g_pvB = MakeCanvas(dc, rc.right, rc.bottom);
        g_pvBlend = MakeCanvas(dc, rc.right, rc.bottom);
        ReleaseDC(hwnd, dc);

        PreviewBuildOrder();
        ComposeInto(&g_pvA, g_pvCount ? 0 : -1);
        if (g_pvCount > 1)
            SetTimer(hwnd, PREVIEW_TIMER,
                     (UINT)PreviewIntervalSeconds() * 1000, NULL);
        return 0;
    }

    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC dc = BeginPaint(hwnd, &ps);
        Canvas *src = (g_pvFadeStep > 0) ? &g_pvBlend : &g_pvA;
        if (src->bmp) {
            HDC mem = CreateCompatibleDC(dc);
            HBITMAP old = (HBITMAP)SelectObject(mem, src->bmp);
            BitBlt(dc, 0, 0, src->w, src->h, mem, 0, 0, SRCCOPY);
            SelectObject(mem, old);
            DeleteDC(mem);
        }
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_ERASEBKGND:
        return 1;

    case WM_TIMER:
        if (wp == PREVIEW_TIMER) {
            PreviewAdvance(hwnd, 1);
            return 0;
        }
        if (wp == PREVIEW_FADE_TIMER) {
            g_pvFadeStep++;
            if (g_pvFadeStep >= PREVIEW_FADE_STEPS) {
                Canvas tmp = g_pvA;
                KillTimer(hwnd, PREVIEW_FADE_TIMER);
                g_pvFadeStep = 0;
                g_pvA = g_pvB;
                g_pvB = tmp;
                PreviewPaint(hwnd, &g_pvA);
            } else {
                BlendCanvas(g_pvFadeStep * 256 / PREVIEW_FADE_STEPS);
                PreviewPaint(hwnd, &g_pvBlend);
            }
            return 0;
        }
        break;

    case WM_KEYDOWN:
        switch (wp) {
        case VK_ESCAPE:
        case VK_RETURN:
            DestroyWindow(hwnd);
            return 0;
        case VK_RIGHT:
        case VK_SPACE:
        case VK_DOWN:
            KillTimer(hwnd, PREVIEW_FADE_TIMER);
            g_pvFadeStep = 0;
            PreviewAdvance(hwnd, 1);
            return 0;
        case VK_LEFT:
        case VK_UP:
            KillTimer(hwnd, PREVIEW_FADE_TIMER);
            g_pvFadeStep = 0;
            PreviewAdvance(hwnd, -1);
            return 0;
        }
        break;

    case WM_LBUTTONDOWN:
    case WM_RBUTTONDOWN:
        DestroyWindow(hwnd);
        return 0;

    case WM_DESTROY:
        KillTimer(hwnd, PREVIEW_TIMER);
        KillTimer(hwnd, PREVIEW_FADE_TIMER);
        FreeCanvas(&g_pvA);
        FreeCanvas(&g_pvB);
        FreeCanvas(&g_pvBlend);
        if (g_pvFont) { DeleteObject(g_pvFont); g_pvFont = NULL; }
        free(g_pvOrder);
        g_pvOrder = NULL;
        g_pvCount = g_pvPos = g_pvFadeStep = 0;
        g_preview = NULL;
        if (g_main) {
            EnableWindow(g_main, TRUE);
            SetForegroundWindow(g_main);
        }
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static void OpenPreviewWindow(void)
{
    MONITORINFO mi;
    HMONITOR mon;

    if (g_preview) { SetForegroundWindow(g_preview); return; }
    if (!g_photos.count) {
        MessageBoxW(g_main,
                    L"Adicione fotos antes de visualizar a TV.",
                    APP_NAME, MB_ICONINFORMATION | MB_OK);
        return;
    }

    mon = MonitorFromWindow(g_main, MONITOR_DEFAULTTONEAREST);
    mi.cbSize = sizeof(mi);
    if (!GetMonitorInfoW(mon, &mi)) return;

    g_preview = CreateWindowExW(WS_EX_TOPMOST, PREVIEW_CLASS, APP_NAME,
                                WS_POPUP,
                                mi.rcMonitor.left, mi.rcMonitor.top,
                                mi.rcMonitor.right - mi.rcMonitor.left,
                                mi.rcMonitor.bottom - mi.rcMonitor.top,
                                g_main, NULL, g_inst, NULL);
    if (!g_preview) return;
    ShowWindow(g_preview, SW_SHOW);
    SetForegroundWindow(g_preview);
    SetFocus(g_preview);
}

/* ==========================================================================
 * Raiz da biblioteca
 * ==========================================================================
 * O caminho da raiz e guardado em %APPDATA%\LaurinhaManager\root.txt - um
 * ponteiro de uma linha, para nao precisar do registro do Windows.
 */

static void RootPointerPath(WCHAR *out, int cch)
{
    WCHAR appData[MAX_PATH];
    if (FAILED(SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, SHGFP_TYPE_CURRENT,
                                appData))) {
        out[0] = 0;
        return;
    }
    PathJoin(out, cch, appData, L"LaurinhaManager");
    EnsureDir(out);
    PathJoin(out, cch, out, L"root.txt");
}

static void WriteRootPointer(void)
{
    WCHAR ptr[MAX_PATH];
    char *utf8;
    RootPointerPath(ptr, MAX_PATH);
    if (!ptr[0]) return;
    utf8 = ToUtf8(g_root);
    WriteTextFileUtf8(ptr, utf8, strlen(utf8));
    free(utf8);
}

static void ResolveRoot(void)
{
    WCHAR ptr[MAX_PATH], profile[MAX_PATH];
    char *data;
    size_t len;

    RootPointerPath(ptr, MAX_PATH);
    if (ptr[0]) {
        data = ReadTextFileUtf8(ptr, &len);
        if (data) {
            WCHAR *w = FromUtf8(data, -1);
            TrimW(w);
            if (w[0]) StringCchCopyW(g_root, MAX_PATH, w);
            free(w);
            free(data);
        }
    }
    if (!g_root[0]) {
        DWORD n = GetEnvironmentVariableW(L"LAURINHA_HOME", g_root, MAX_PATH);
        if (n == 0 || n >= MAX_PATH) g_root[0] = 0;
    }
    if (!g_root[0]) {
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_PROFILE, NULL,
                                       SHGFP_TYPE_CURRENT, profile)))
            PathJoin(g_root, MAX_PATH, profile, L"Laurinha");
        else
            StringCchCopyW(g_root, MAX_PATH, L"C:\\Laurinha");
    }
}

static void EnsureLibraryFolders(void)
{
    WCHAR dir[MAX_PATH];
    EnsureDir(g_root);
    PathJoin(dir, MAX_PATH, g_root, DIR_MUSIC);
    EnsureDir(dir);
    PathJoin(dir, MAX_PATH, g_root, DIR_PHOTOS);
    EnsureDir(dir);
    PathJoin(dir, MAX_PATH, g_root, DIR_HUB);
    EnsureDir(dir);
}

static void ResetLibraryState(void)
{
    StopThumbnailWorker();
    InvalidatePreviewCache();
    MediaListClear(&g_tracks);
    MediaListClear(&g_photos);
    CollectionListClear(&g_playlists);
    CollectionListClear(&g_albums);
    StrListClear(&g_musicRoots);
    StrListClear(&g_photoRoots);
    g_curPlaylist = 0;
    g_curAlbum = 0;
}

static int FindPhotoByUid(int uid)
{
    int i;
    for (i = 0; i < g_photos.count; i++)
        if (g_photos.items[i].uid == uid) return i;
    return -1;
}

static void OpenSettings(void)
{
    WCHAR before[MAX_PATH];
    ScanResult res;

    StringCchCopyW(before, MAX_PATH, g_root);
    if (DialogBoxParamW(g_inst, MAKEINTRESOURCEW(IDD_SETTINGS), g_main,
                        SettingsProc, 0) != IDOK)
        return;

    if (lstrcmpiW(before, g_root) != 0) {
        if (g_dirty) {
            WCHAR old[MAX_PATH];
            StringCchCopyW(old, MAX_PATH, g_root);
            StringCchCopyW(g_root, MAX_PATH, before);
            SaveState();                       /* preserva o estado antigo */
            StringCchCopyW(g_root, MAX_PATH, old);
        }
        WriteRootPointer();
        EnsureLibraryFolders();
        ResetLibraryState();
        LoadState();
        memset(&res, 0, sizeof(res));
        RescanLibrary(&res);
        StartThumbnailWorker();
        g_dirty = TRUE;
    } else {
        WriteRootPointer();
        MarkDirty();
    }
    RefreshMusicUI();
    RefreshPhotoUI();
    RefreshFrameUI();
    RecomputeStatus();
    InvalidateRect(g_main, NULL, TRUE);
}

/* ==========================================================================
 * Janela principal
 * ========================================================================== */

static void HandleCommand(HWND hwnd, int id, int code, HWND ctl)
{
    if (id >= IDC_NAV_FIRST && id < IDC_NAV_FIRST + PAGE_COUNT) {
        ShowPage(id - IDC_NAV_FIRST);
        return;
    }
    if (id >= IDC_CMD_FIRST && id < IDC_CMD_FIRST + IDC_CMD_COUNT) {
        switch (id - IDC_CMD_FIRST) {
        case 0: ShowAddMenu(ctl, TRUE);  break;
        case 1: ShowAddMenu(ctl, FALSE); break;
        case 2: CommandRefreshLibrary(); break;
        case 3: CommandOpenHub();        break;
        case 4: OpenPreviewWindow();     break;
        case 5: CommandInstallLg();      break;
        }
        return;
    }

    switch (id) {
    /* ---- Musica ---- */
    case IDC_MUS_PLAYLISTS:
        if (code == LBN_SELCHANGE) {
            int sel = (int)SendMessageW(ctl, LB_GETCURSEL, 0, 0);
            if (sel >= 0 && sel != g_curPlaylist) {
                g_curPlaylist = sel;
                RefreshMusicUI();
            }
        }
        break;
    case IDC_MUS_NEW:
        NewCollection(&g_playlists, L"Playlist", &g_curPlaylist, TRUE);
        break;
    case IDC_MUS_RENAME:
        RenameCollection(&g_playlists, g_curPlaylist, TRUE);
        break;
    case IDC_MUS_DELETE:
        DeleteCollection(&g_playlists, &g_curPlaylist, TRUE);
        break;
    case IDC_MUS_ADD:
        AddToCollection(&g_playlists, g_curPlaylist, &g_tracks, TRUE);
        break;
    case IDC_MUS_UP:
        MoveInCollection(&g_playlists, g_curPlaylist, IDC_MUS_TRACKS, -1, TRUE);
        break;
    case IDC_MUS_DOWN:
        MoveInCollection(&g_playlists, g_curPlaylist, IDC_MUS_TRACKS, 1, TRUE);
        break;
    case IDC_MUS_REMOVE:
        if (g_curPlaylist > 0)
            RemoveFromCollection(&g_playlists, g_curPlaylist, IDC_MUS_TRACKS,
                                 TRUE);
        else
            RemoveFromLibrary(&g_tracks, &g_playlists, IDC_MUS_TRACKS, TRUE);
        break;

    /* ---- Fotos ---- */
    case IDC_PHO_ALBUMS:
        if (code == LBN_SELCHANGE) {
            int sel = (int)SendMessageW(ctl, LB_GETCURSEL, 0, 0);
            if (sel >= 0 && sel != g_curAlbum) {
                g_curAlbum = sel;
                RefreshPhotoUI();
            }
        }
        break;
    case IDC_PHO_NEW:
        NewCollection(&g_albums, L"Album", &g_curAlbum, FALSE);
        break;
    case IDC_PHO_RENAME:
        RenameCollection(&g_albums, g_curAlbum, FALSE);
        break;
    case IDC_PHO_DELETE:
        DeleteCollection(&g_albums, &g_curAlbum, FALSE);
        break;
    case IDC_PHO_ADD:
        AddToCollection(&g_albums, g_curAlbum, &g_photos, FALSE);
        break;
    case IDC_PHO_UP:
        MoveInCollection(&g_albums, g_curAlbum, IDC_PHO_GRID, -1, FALSE);
        break;
    case IDC_PHO_DOWN:
        MoveInCollection(&g_albums, g_curAlbum, IDC_PHO_GRID, 1, FALSE);
        break;
    case IDC_PHO_COVER:
        SetAlbumCover();
        break;
    case IDC_PHO_REMOVE:
        if (g_curAlbum > 0)
            RemoveFromCollection(&g_albums, g_curAlbum, IDC_PHO_GRID, FALSE);
        else
            RemoveFromLibrary(&g_photos, &g_albums, IDC_PHO_GRID, FALSE);
        break;
    case IDC_PHO_SORTAPPLY:
        SortPhotos();
        break;

    /* ---- Modo Quadro ---- */
    case IDC_FR_FADE:
    case IDC_FR_RANDOM:
    case IDC_FR_CAPTION:
        if (code == BN_CLICKED) {
            BOOL on = SendMessageW(ctl, BM_GETCHECK, 0, 0) == BST_CHECKED;
            if (id == IDC_FR_FADE) g_frame.fade = on;
            else if (id == IDC_FR_RANDOM) g_frame.random = on;
            else g_frame.caption = on;
            MarkDirty();
            Layout();
        }
        break;
    case IDC_FR_FRAME:
    case IDC_FR_BG:
        if (code == CBN_SELCHANGE) {
            int sel = (int)SendMessageW(ctl, CB_GETCURSEL, 0, 0);
            if (sel >= 0) {
                if (id == IDC_FR_FRAME) g_frame.frame = sel;
                else g_frame.background = sel;
                MarkDirty();
                Layout();
            }
        }
        break;

    /* ---- Status ---- */
    case IDC_ST_CHECK:
        RecomputeStatus();
        InvalidateRect(hwnd, NULL, TRUE);
        break;
    case IDC_ST_SETTINGS:
        OpenSettings();
        break;
    case IDC_ST_FOLDER:
        EnsureLibraryFolders();
        ShellExecuteW(hwnd, L"open", g_root, NULL, NULL, SW_SHOWNORMAL);
        break;

    default:
        break;
    }
}

static void HandleTrack(HWND ctl)
{
    int id = GetDlgCtrlID(ctl);
    int pos = (int)SendMessageW(ctl, TBM_GETPOS, 0, 0);

    switch (id) {
    case IDC_FR_SECONDS:
        if (pos == g_frame.seconds) return;
        g_frame.seconds = pos;
        break;
    case IDC_FR_PASSE:
        if (pos == g_frame.passepartout) return;
        g_frame.passepartout = pos;
        break;
    case IDC_PHO_INTERVAL:
        if (g_curAlbum <= 0) return;
        if (pos == g_albums.items[g_curAlbum - 1].interval) return;
        g_albums.items[g_curAlbum - 1].interval = pos;
        break;
    default:
        return;
    }
    MarkDirty();
    Layout();
}

static LRESULT CALLBACK MainProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_CREATE:
        g_main = hwnd;
        g_dpi = QueryDpi(hwnd);
        MakeFonts();
        CreateControls(hwnd);
        DragAcceptFiles(hwnd, TRUE);
        return 0;

    case WM_SIZE:
        Layout();
        return 0;

    case WM_GETMINMAXINFO: {
        MINMAXINFO *mmi = (MINMAXINFO *)lp;
        mmi->ptMinTrackSize.x = ScaleDpi(1020);
        mmi->ptMinTrackSize.y = ScaleDpi(660);
        return 0;
    }

    case WM_DPICHANGED: {
        RECT *sug = (RECT *)lp;
        g_dpi = HIWORD(wp);
        MakeFonts();
        ApplyFontToChildren(hwnd);
        SetWindowPos(hwnd, NULL, sug->left, sug->top,
                     sug->right - sug->left, sug->bottom - sug->top,
                     SWP_NOZORDER | SWP_NOACTIVATE);
        Layout();
        return 0;
    }

    case WM_ERASEBKGND:
        return 1;

    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC dc = BeginPaint(hwnd, &ps);
        PaintMain(hwnd, dc);
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_DRAWITEM:
        DrawOwnerButton((LPDRAWITEMSTRUCT)lp);
        return TRUE;

    case WM_CTLCOLORSTATIC:
    case WM_CTLCOLORBTN:
        SetBkColor((HDC)wp, CLR_SURFACE);
        SetTextColor((HDC)wp, CLR_TEXT);
        return (LRESULT)g_brSurface;

    case WM_CTLCOLORLISTBOX:
        SetBkColor((HDC)wp, CLR_SURFACE);
        SetTextColor((HDC)wp, CLR_TEXT);
        return (LRESULT)g_brSurface;

    case WM_COMMAND:
        HandleCommand(hwnd, LOWORD(wp), HIWORD(wp), (HWND)lp);
        return 0;

    case WM_HSCROLL:
        if (lp) HandleTrack((HWND)lp);
        return 0;

    case WM_DROPFILES:
        HandleDrop((HDROP)wp);
        return 0;

    case WM_APP_THUMB_READY: {
        ThumbMsg *tm = (ThumbMsg *)lp;
        int idx;
        if (!tm) return 0;
        idx = FindPhotoByUid(tm->uid);
        if (idx >= 0 && g_thumbs) {
            int image = ImageList_Add(g_thumbs, tm->bmp, NULL);
            if (image >= 0) {
                HWND lv = GetDlgItem(hwnd, IDC_PHO_GRID);
                g_photos.items[idx].thumb = image;
                if (lv) {
                    int row, n = ListView_GetItemCount(lv);
                    for (row = 0; row < n; row++) {
                        LVITEMW it;
                        memset(&it, 0, sizeof(it));
                        it.mask = LVIF_PARAM;
                        it.iItem = row;
                        if (!ListView_GetItem(lv, &it)) continue;
                        if ((int)it.lParam != idx) continue;
                        it.mask = LVIF_IMAGE;
                        it.iImage = image;
                        ListView_SetItem(lv, &it);
                        break;
                    }
                }
                if (g_page == PAGE_FRAME && g_previewIdx < 0)
                    InvalidateRect(hwnd, &g_rcFramePreview, FALSE);
            }
        }
        DeleteObject(tm->bmp);
        free(tm);
        return 0;
    }

    case WM_APP_TASK_DONE: {
        WCHAR *text = (WCHAR *)lp;
        g_busy[0] = 0;
        if (g_installPending) {
            g_installPending = FALSE;
            if (wp == 0) RecordLgInstall();
            RecomputeStatus();
        }
        InvalidateRect(hwnd, NULL, TRUE);
        if (text) {
            MessageBoxW(hwnd, text, APP_NAME,
                        (wp == 0 ? MB_ICONINFORMATION : MB_ICONWARNING) | MB_OK);
            free(text);
        }
        return 0;
    }

    case WM_CLOSE:
        if (g_dirty) {
            int answer = MessageBoxW(hwnd,
                L"Há alterações que ainda não foram gravadas.\n\n"
                L"Gravar o estado e publicar o manifesto do Hub antes de sair?",
                APP_NAME, MB_ICONQUESTION | MB_YESNOCANCEL);
            if (answer == IDCANCEL) return 0;
            if (answer == IDYES) {
                WCHAR err[320];
                err[0] = 0;
                SaveState();
                if (!PublishManifest(err, ARRAYSIZE(err)))
                    MessageBoxW(hwnd, err, APP_NAME, MB_ICONERROR | MB_OK);
            }
        }
        DestroyWindow(hwnd);
        return 0;

    case WM_DESTROY:
        StopThumbnailWorker();
        if (g_preview) DestroyWindow(g_preview);
        InvalidatePreviewCache();
        ResetLibraryState();
        if (g_thumbs) { ImageList_Destroy(g_thumbs); g_thumbs = NULL; }
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

/* ==========================================================================
 * Entrada
 * ========================================================================== */

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmdLine, int show)
{
    INITCOMMONCONTROLSEX icc;
    WNDCLASSEXW wc;
    MSG msg;
    ScanResult res;
    HWND hwnd;

    (void)prev;
    (void)cmdLine;

    g_inst = inst;

    if (FAILED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED |
                                    COINIT_DISABLE_OLE1DDE))) {
        MessageBoxW(NULL, L"Falha ao inicializar o COM.", APP_NAME,
                    MB_ICONERROR | MB_OK);
        return 1;
    }

    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_LISTVIEW_CLASSES | ICC_BAR_CLASSES | ICC_STANDARD_CLASSES |
                ICC_WIN95_CLASSES;
    InitCommonControlsEx(&icc);

    g_brWindow = CreateSolidBrush(CLR_WINDOW);
    g_brSurface = CreateSolidBrush(CLR_SURFACE);
    g_brRail = CreateSolidBrush(CLR_RAIL);

    memset(&wc, 0, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = MainProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = g_brWindow;
    wc.lpszClassName = APP_CLASS;
    wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(IDI_APPICON));
    wc.hIconSm = wc.hIcon;
    if (!RegisterClassExW(&wc)) { CoUninitialize(); return 1; }

    memset(&wc, 0, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = PreviewProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wc.lpszClassName = PREVIEW_CLASS;
    wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(IDI_APPICON));
    RegisterClassExW(&wc);

    ResolveRoot();
    EnsureLibraryFolders();

    hwnd = CreateWindowExW(WS_EX_ACCEPTFILES, APP_CLASS,
                           APP_NAME L" " APP_VERSION,
                           WS_OVERLAPPEDWINDOW,
                           CW_USEDEFAULT, CW_USEDEFAULT,
                           1180, 760, NULL, NULL, inst, NULL);
    if (!hwnd) { CoUninitialize(); return 1; }

    LoadState();
    memset(&res, 0, sizeof(res));
    RescanLibrary(&res);
    g_dirty = (res.audio || res.image) ? TRUE : FALSE;

    RefreshFrameUI();
    RefreshMusicUI();
    RefreshPhotoUI();
    RecomputeStatus();
    ShowPage(PAGE_MUSIC);
    StartThumbnailWorker();

    ShowWindow(hwnd, show);
    UpdateWindow(hwnd);

    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        /* A janela de previa e um popup proprio: as setas do teclado
           precisam chegar inteiras ate ela. */
        if (!g_preview && !IsDialogMessageW(hwnd, &msg)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        } else if (g_preview) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    if (g_fontUI) DeleteObject(g_fontUI);
    if (g_fontBold) DeleteObject(g_fontBold);
    if (g_fontTitle) DeleteObject(g_fontTitle);
    if (g_fontSmall) DeleteObject(g_fontSmall);
    if (g_brWindow) DeleteObject(g_brWindow);
    if (g_brSurface) DeleteObject(g_brSurface);
    if (g_brRail) DeleteObject(g_brRail);

    CoUninitialize();
    return (int)msg.wParam;
}
