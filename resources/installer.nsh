!macro customInstall
  # A shortcut left in the other install scope can claim the same
  # AppUserModelID. Windows then uses that stale shortcut's name and icon in
  # Start and on the taskbar, so remove it before creating our own shortcut.
  ${if} $installMode == "all"
    SetShellVarContext current
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    ClearErrors
    SetShellVarContext all
  ${else}
    SetShellVarContext all
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    ClearErrors
    SetShellVarContext current
  ${endif}

  # Give the AppUserModelID an explicit display name and icon so Start, search
  # and taskbar pinning do not fall back to the default Electron identity.
  WriteRegStr SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}" DisplayName "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}" IconUri "$appExe"
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}"
!macroend
