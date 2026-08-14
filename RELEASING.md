# Releasing LX Flow Music

LX Flow Music publishes Windows installer updates through GitHub Releases. The release must be public so installed applications can download it without a GitHub credential.

1. Update `version` in `package.json` and `package-lock.json`.
2. Add a matching entry to `CHANGELOG.md`.
3. Commit and push the changes to GitHub.
4. Create and push a matching tag, for example `v2.12.4`.

```powershell
git tag v2.12.4
git push origin HEAD --tags
```

The `Release LX Flow Music` workflow validates that the tag matches `package.json`, builds the x64 NSIS installer, and uploads the installer, blockmap, and `latest.yml` to the GitHub Release. Installed copies detect the new release through the Software Update page.

The green 7z package remains useful for portable use, but it cannot install updates automatically. Use the Setup installer once to move to the update-capable edition.
