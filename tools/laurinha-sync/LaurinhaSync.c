#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")

#define ID_ADD_MUSIC 1001
#define ID_ADD_PHOTOS 1002
#define ID_OPEN_MUSIC 1003
#define ID_OPEN_PHOTOS 1004
#define ID_REFRESH 1005
#define ID_HUB 1006
#define ID_INSTALL 1007
#define ID_PREVIEW 1008
#define ID_TEST_TV 1009
#define ID_SYNC_TV 1010
#define ID_STATUS 1100
#define ID_MUSIC_COUNT 1101
#define ID_PHOTO_COUNT 1102
#define ID_TITLE 1103

static HINSTANCE gInst;
static HWND gMain, gStatus, gMusicCount, gPhotoCount;
static char gRoot[MAX_PATH * 4];
static char gMusic[MAX_PATH * 4];
static char gPhotos[MAX_PATH * 4];

static int ext_eq(const char *name, const char *ext) {
    size_t n = strlen(name), e = strlen(ext);
    if (n < e) return 0;
    return _stricmp(name + n - e, ext) == 0;
}

static int is_music(const char *name) { return ext_eq(name, ".mp3"); }
static int is_photo(const char *name) { return ext_eq(name, ".jpg") || ext_eq(name, ".jpeg") || ext_eq(name, ".png") || ext_eq(name, ".webp"); }

static void path_join(char *out, size_t cap, const char *a, const char *b) {
    snprintf(out, cap, "%s%s%s", a, (a[0] && a[strlen(a)-1] != '\\') ? "\\" : "", b);
}

static void ensure_dir(const char *p) {
    char tmp[MAX_PATH * 4];
    size_t i, n = strlen(p);
    if (n >= sizeof(tmp)) return;
    strcpy(tmp, p);
    for (i = 3; i < n; ++i) {
        if (tmp[i] == '\\' || tmp[i] == '/') {
            char c = tmp[i]; tmp[i] = 0; CreateDirectoryA(tmp, NULL); tmp[i] = c;
        }
    }
    CreateDirectoryA(tmp, NULL);
}

static const char *basename_ptr(const char *p) {
    const char *a = strrchr(p, '\\'), *b = strrchr(p, '/');
    const char *q = a > b ? a : b;
    return q ? q + 1 : p;
}

static int count_files(const char *dir, int kind) {
    WIN32_FIND_DATAA fd; HANDLE h; char pat[MAX_PATH * 4], child[MAX_PATH * 4]; int count = 0;
    path_join(pat, sizeof(pat), dir, "*");
    h = FindFirstFileA(pat, &fd); if (h == INVALID_HANDLE_VALUE) return 0;
    do {
        if (!strcmp(fd.cFileName, ".") || !strcmp(fd.cFileName, "..")) continue;
        path_join(child, sizeof(child), dir, fd.cFileName);
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) count += count_files(child, kind);
        else if ((kind == 1 && is_music(fd.cFileName)) || (kind == 2 && is_photo(fd.cFileName))) count++;
    } while (FindNextFileA(h, &fd));
    FindClose(h); return count;
}

static int copy_tree_filtered(const char *src, const char *dst, int kind) {
    WIN32_FIND_DATAA fd; HANDLE h; char pat[MAX_PATH * 4], s[MAX_PATH * 4], d[MAX_PATH * 4]; int copied = 0;
    ensure_dir(dst); path_join(pat, sizeof(pat), src, "*");
    h = FindFirstFileA(pat, &fd); if (h == INVALID_HANDLE_VALUE) return 0;
    do {
        if (!strcmp(fd.cFileName, ".") || !strcmp(fd.cFileName, "..")) continue;
        path_join(s, sizeof(s), src, fd.cFileName); path_join(d, sizeof(d), dst, fd.cFileName);
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) copied += copy_tree_filtered(s, d, kind);
        else if ((kind == 1 && is_music(fd.cFileName)) || (kind == 2 && is_photo(fd.cFileName))) {
            ensure_dir(dst);
            if (CopyFileA(s, d, FALSE) || GetLastError() == ERROR_FILE_EXISTS) copied++;
        }
    } while (FindNextFileA(h, &fd));
    FindClose(h); return copied;
}

static void set_status(const char *msg) { SetWindowTextA(gStatus, msg); }

static void refresh_counts(void) {
    char buf[128]; int m = count_files(gMusic, 1), p = count_files(gPhotos, 2);
    snprintf(buf, sizeof(buf), "%d faixas MP3", m); SetWindowTextA(gMusicCount, buf);
    snprintf(buf, sizeof(buf), "%d fotos", p); SetWindowTextA(gPhotoCount, buf);
}

static int browse_folder(HWND owner, const char *title, char *out, size_t cap) {
    BROWSEINFOA bi; LPITEMIDLIST pidl; char display[MAX_PATH]; ZeroMemory(&bi, sizeof(bi));
    bi.hwndOwner = owner; bi.lpszTitle = title; bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE; bi.pszDisplayName = display;
    pidl = SHBrowseForFolderA(&bi); if (!pidl) return 0;
    if (!SHGetPathFromIDListA(pidl, out)) { CoTaskMemFree(pidl); return 0; }
    CoTaskMemFree(pidl); out[cap-1] = 0; return 1;
}

static void import_folder(HWND hwnd, int kind) {
    char src[MAX_PATH * 4], target[MAX_PATH * 4], msg[512]; const char *base;
    if (!browse_folder(hwnd, kind == 1 ? "Escolha uma pasta com MP3" : "Escolha uma pasta com fotos", src, sizeof(src))) return;
    base = basename_ptr(src); path_join(target, sizeof(target), kind == 1 ? gMusic : gPhotos, base && *base ? base : (kind == 1 ? "Playlist" : "Album"));
    set_status("Importando arquivos...");
    int n = copy_tree_filtered(src, target, kind); refresh_counts();
    snprintf(msg, sizeof(msg), "%s: %d arquivo(s) adicionados em %s", kind == 1 ? "Música" : "Fotos", n, base);
    set_status(msg);
}

static void open_folder(const char *p) { ensure_dir(p); ShellExecuteA(gMain, "open", p, NULL, NULL, SW_SHOWNORMAL); }

static void launch_cmd(const char *name) {
    char file[MAX_PATH * 4]; path_join(file, sizeof(file), gRoot, name);
    if (GetFileAttributesA(file) == INVALID_FILE_ATTRIBUTES) { MessageBoxA(gMain, "Arquivo não encontrado no pacote.", "Laurinha em Casa", MB_ICONWARNING); return; }
    ShellExecuteA(gMain, "open", file, NULL, gRoot, SW_SHOWNORMAL);
}

static int run_hidden(const char *cmd) {
    STARTUPINFOA si; PROCESS_INFORMATION pi; DWORD code = 1; char *copy;
    ZeroMemory(&si, sizeof(si)); ZeroMemory(&pi, sizeof(pi)); si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
    copy = _strdup(cmd); if (!copy) return 0;
    if (!CreateProcessA(NULL, copy, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, gRoot, &si, &pi)) { free(copy); return 0; }
    free(copy);
    WaitForSingleObject(pi.hProcess, 30000);
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return code == 0;
}

static void test_tv(void) {
    set_status("Testando conexao com a LG...");
    if (run_hidden("cmd.exe /d /s /c \"ares-device-info.cmd --system-info --device CrewCheckLG >nul 2>&1\""))
        set_status("TV CrewCheckLG conectada. Pronto para sincronizar.");
    else
        set_status("TV indisponivel. Confira Developer Mode, IP cadastrado e webOS CLI.");
}

static void sync_tv(void) {
    set_status("Sincronizando com a TV...");
    /* Arquivos ficam no PC/Hub. Reabrir o app força nova leitura dos manifestos. */
    run_hidden("cmd.exe /d /s /c \"ares-launch.cmd --device CrewCheckLG --close com.saraiva.laurinha.tv >nul 2>&1\"");
    Sleep(500);
    if (run_hidden("cmd.exe /d /s /c \"ares-launch.cmd --device CrewCheckLG com.saraiva.laurinha.tv >nul 2>&1\""))
        set_status("Sincronizado: a TV foi recarregada e vai reler fotos/MP3 pelo Hub.");
    else
        set_status("Falha ao recarregar o app. Teste a conexao CrewCheckLG primeiro.");
}

static void layout(HWND h) {
    RECT r; GetClientRect(h, &r); int w = r.right, left = 26, top = 26;
    MoveWindow(GetDlgItem(h, ID_TITLE), left, top, w-52, 54, TRUE);
    MoveWindow(GetDlgItem(h, ID_MUSIC_COUNT), left, 100, 260, 32, TRUE);
    MoveWindow(GetDlgItem(h, ID_ADD_MUSIC), left, 142, 235, 46, TRUE);
    MoveWindow(GetDlgItem(h, ID_OPEN_MUSIC), left+247, 142, 180, 46, TRUE);
    MoveWindow(GetDlgItem(h, ID_PHOTO_COUNT), left, 222, 260, 32, TRUE);
    MoveWindow(GetDlgItem(h, ID_ADD_PHOTOS), left, 264, 235, 46, TRUE);
    MoveWindow(GetDlgItem(h, ID_OPEN_PHOTOS), left+247, 264, 180, 46, TRUE);
    MoveWindow(GetDlgItem(h, ID_REFRESH), left, 348, 160, 44, TRUE);
    MoveWindow(GetDlgItem(h, ID_HUB), left+172, 348, 190, 44, TRUE);
    MoveWindow(GetDlgItem(h, ID_PREVIEW), left+374, 348, 190, 44, TRUE);
    MoveWindow(GetDlgItem(h, ID_TEST_TV), left, 408, 176, 44, TRUE);
    MoveWindow(GetDlgItem(h, ID_SYNC_TV), left+188, 408, 376, 44, TRUE);
    MoveWindow(GetDlgItem(h, ID_INSTALL), left, 468, 564, 52, TRUE);
    MoveWindow(GetDlgItem(h, ID_STATUS), left, 546, w-52, 54, TRUE);
}

static HWND make_btn(HWND p, int id, const char *txt) { return CreateWindowA("BUTTON", txt, WS_CHILD|WS_VISIBLE|BS_PUSHBUTTON,0,0,10,10,p,(HMENU)(INT_PTR)id,gInst,NULL); }
static HWND make_static(HWND p, int id, const char *txt, DWORD extra) { return CreateWindowA("STATIC", txt, WS_CHILD|WS_VISIBLE|extra,0,0,10,10,p,(HMENU)(INT_PTR)id,gInst,NULL); }

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_CREATE: {
        HFONT title = CreateFontA(31,0,0,0,FW_BOLD,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,"Segoe UI");
        HFONT normal = CreateFontA(20,0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,"Segoe UI");
        HWND t = make_static(hwnd, ID_TITLE, "🍒 Laurinha em Casa — Playlists, Fotos e TV", SS_LEFT); SendMessageA(t, WM_SETFONT, (WPARAM)title, TRUE);
        gMusicCount = make_static(hwnd, ID_MUSIC_COUNT, "0 faixas MP3", SS_LEFT); SendMessageA(gMusicCount, WM_SETFONT, (WPARAM)normal, TRUE);
        gPhotoCount = make_static(hwnd, ID_PHOTO_COUNT, "0 fotos", SS_LEFT); SendMessageA(gPhotoCount, WM_SETFONT, (WPARAM)normal, TRUE);
        make_btn(hwnd, ID_ADD_MUSIC, "Adicionar pasta de MP3"); make_btn(hwnd, ID_OPEN_MUSIC, "Abrir músicas");
        make_btn(hwnd, ID_ADD_PHOTOS, "Adicionar pasta de fotos"); make_btn(hwnd, ID_OPEN_PHOTOS, "Abrir fotos");
        make_btn(hwnd, ID_REFRESH, "Atualizar"); make_btn(hwnd, ID_HUB, "Iniciar Hub"); make_btn(hwnd, ID_PREVIEW, "Visualizar na TV");
        make_btn(hwnd, ID_TEST_TV, "Testar LG"); make_btn(hwnd, ID_SYNC_TV, "Sincronizar TV");
        make_btn(hwnd, ID_INSTALL, "Preparar / instalar na LG");
        gStatus = make_static(hwnd, ID_STATUS, "Arraste pastas para esta janela ou use os botões acima.", SS_LEFT | SS_CENTERIMAGE); SendMessageA(gStatus, WM_SETFONT, (WPARAM)normal, TRUE);
        DragAcceptFiles(hwnd, TRUE); refresh_counts(); layout(hwnd); return 0; }
    case WM_SIZE: layout(hwnd); return 0;
    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case ID_ADD_MUSIC: import_folder(hwnd,1); break; case ID_ADD_PHOTOS: import_folder(hwnd,2); break;
        case ID_OPEN_MUSIC: open_folder(gMusic); break; case ID_OPEN_PHOTOS: open_folder(gPhotos); break;
        case ID_REFRESH: refresh_counts(); set_status("Biblioteca atualizada."); break;
        case ID_TEST_TV: test_tv(); break;
        case ID_SYNC_TV: sync_tv(); break;
        case ID_HUB: launch_cmd("INICIAR_HUB_DA_CASA.cmd"); break;
        case ID_INSTALL: launch_cmd("INSTALAR_NA_LG.cmd"); break;
        case ID_PREVIEW: { char f[MAX_PATH*4]; path_join(f,sizeof(f),gRoot,"PREVIA_NO_COMPUTADOR.html"); ShellExecuteA(hwnd,"open",f,NULL,gRoot,SW_SHOWNORMAL); } break;
        } return 0;
    case WM_DROPFILES: {
        HDROP d=(HDROP)wp; UINT n=DragQueryFileA(d,0xFFFFFFFF,NULL,0),i; int totalM=0,totalP=0; char src[MAX_PATH*4],dst[MAX_PATH*4];
        for(i=0;i<n;i++){DragQueryFileA(d,i,src,sizeof(src));DWORD a=GetFileAttributesA(src);if(a!=INVALID_FILE_ATTRIBUTES&&(a&FILE_ATTRIBUTE_DIRECTORY)){int cm=count_files(src,1),cp=count_files(src,2);const char* b=basename_ptr(src);if(cm){path_join(dst,sizeof(dst),gMusic,b);totalM+=copy_tree_filtered(src,dst,1);}if(cp){path_join(dst,sizeof(dst),gPhotos,b);totalP+=copy_tree_filtered(src,dst,2);}}}
        DragFinish(d); refresh_counts(); char m[256]; snprintf(m,sizeof(m),"Arrastar e soltar: %d MP3 e %d fotos importados.",totalM,totalP);set_status(m); return 0; }
    case WM_DESTROY: PostQuitMessage(0); return 0;
    }
    return DefWindowProcA(hwnd,msg,wp,lp);
}

int APIENTRY WinMain(HINSTANCE h, HINSTANCE prev, LPSTR cmd, int show) {
    (void)prev; (void)cmd; gInst=h; INITCOMMONCONTROLSEX ic={sizeof(ic),ICC_STANDARD_CLASSES}; InitCommonControlsEx(&ic); CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    GetModuleFileNameA(NULL,gRoot,sizeof(gRoot)); char *p=strrchr(gRoot,'\\'); if(p)*p=0; { char test[MAX_PATH*4]; path_join(test,sizeof(test),gRoot,"INICIAR_HUB_DA_CASA.cmd"); if(GetFileAttributesA(test)==INVALID_FILE_ATTRIBUTES){ char *q=strrchr(gRoot,'\\'); if(q)*q=0; } } path_join(gMusic,sizeof(gMusic),gRoot,"MINHAS_MUSICAS"); path_join(gPhotos,sizeof(gPhotos),gRoot,"FOTOS_LAURINHA"); ensure_dir(gMusic); ensure_dir(gPhotos);
    WNDCLASSA wc={0}; wc.lpfnWndProc=WndProc; wc.hInstance=h; wc.hCursor=LoadCursor(NULL,IDC_ARROW); wc.hbrBackground=(HBRUSH)(COLOR_WINDOW+1); wc.lpszClassName="LaurinhaManagerWnd"; wc.hIcon=LoadIcon(NULL,IDI_APPLICATION); RegisterClassA(&wc);
    gMain=CreateWindowExA(0,wc.lpszClassName,"Laurinha Sync — TV LG",WS_OVERLAPPEDWINDOW|WS_VISIBLE,CW_USEDEFAULT,CW_USEDEFAULT,660,690,NULL,NULL,h,NULL); if(!gMain)return 1; ShowWindow(gMain,show); UpdateWindow(gMain);
    MSG m; while(GetMessageA(&m,NULL,0,0)>0){TranslateMessage(&m);DispatchMessageA(&m);} CoUninitialize(); return (int)m.wParam;
}