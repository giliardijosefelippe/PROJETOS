# CONF ARMADURA — stable signing keystore

Sideload/debug installs use this keystore so APKs update in place across cloud agent VMs
(`applicationId` `br.lunardeli.conferenciaarmadura` + same cert).

- File: `conf-armadura.keystore`
- Alias: `androiddebugkey`
- Store/key password: `android`
- SHA-256: `49:17:78:79:44:76:30:13:11:A5:3E:6F:29:4E:A9:7A:C0:5F:C9:6D:2E:3C:51:F8:89:2C:FC:58:65:5B:EF:4F`

Do **not** regenerate. Replacing it breaks in-place updates for phones that already
installed APKs signed with this cert (0.1.09+).

## Note on 0.1.08-20261117

That build used a different ephemeral `~/.android/debug.keystore` (SHA-256
`A1:E0:27:1D:…:A0`) created on a disposable VM on 2026-11-17. The private key was
never committed and cannot be recovered from the APK. Installing 0.1.33+ over 0.1.08
requires **one** uninstall of 0.1.08 (library/annots are wiped by uninstall). After
that, updates keep data.
