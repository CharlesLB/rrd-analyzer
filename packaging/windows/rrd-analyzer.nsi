; NSIS installer for RRD Analyzer.
;
; Built from what GoReleaser has already produced in dist/, so the installer ships the same
; executable the zip does. makensis runs on Linux, which is why the Windows half of the release
; needs no Windows runner:
;
;   apt-get install -y nsis
;
; Usage:  makensis -DVERSION=1.2.3 -DSOURCE_EXE=<path> -DOUTPUT=<path> packaging/windows/rrd-analyzer.nsi

Unicode true
ManifestDPIAware true

!ifndef VERSION
  !error "VERSION is required"
!endif
!ifndef SOURCE_EXE
  !error "SOURCE_EXE is required"
!endif
!ifndef OUTPUT
  !error "OUTPUT is required"
!endif

!define APP_NAME "RRD Analyzer"
!define APP_EXE "rrd-analyzer.exe"
!define PUBLISHER "Charles Braga"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RRDAnalyzer"
; SHChangeNotify event and flag: an association changed, so the shell drops the icons it cached.
!define SHCNE_ASSOCCHANGED 0x08000000
!define SHCNF_IDLIST 0

Name "${APP_NAME}"
OutFile "${OUTPUT}"
; Per-user by default: no elevation prompt, and the app writes only to the user's profile.
InstallDir "$LOCALAPPDATA\Programs\RRDAnalyzer"
InstallDirRegKey HKCU "Software\RRDAnalyzer" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (c) ${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APP_NAME}"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "/oname=${APP_EXE}" "${SOURCE_EXE}"

  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  WriteRegStr HKCU "Software\RRDAnalyzer" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ; An update lands on the same path, and Windows keys its icon cache by path: without this the
  ; Start menu and a taskbar pin keep drawing the previous version's icon until the cache ages out.
  System::Call 'shell32::SHChangeNotify(i ${SHCNE_ASSOCCHANGED}, i ${SHCNF_IDLIST}, p 0, p 0)'
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\RRDAnalyzer"
SectionEnd
